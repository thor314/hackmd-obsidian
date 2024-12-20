import {
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  parseYaml,
  stringifyYaml
} from 'obsidian';
import { HackMDClient } from './client';
import {
  HackMDPluginSettings,
  DEFAULT_SETTINGS,
  HackMDSettingTab
} from './settings';
import { ModalFactory } from './modal';
import {
  HackMDMetadata,
  NoteFrontmatter,
  SyncMode,
  HackMDError,
  HackMDErrorType,
} from './types';

export default class HackMDPlugin extends Plugin {
  settings: HackMDPluginSettings;
  private client: HackMDClient | null = null;

  async onload() {
    // load settings 
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    // initialize the HackMD client
    if (this.settings.accessToken) {
      await this.initializeClient();
    }
    this.registerCommands();
    this.addSettingTab(new HackMDSettingTab(this.app, this));
  }


  private registerCommands(): void {
    this.addCommand({
      id: 'push',
      name: 'Push',
      editorCallback: this.createEditorCallback(this.pushToHackMD.bind(this))
    });

    this.addCommand({
      id: 'pull',
      name: 'Pull',
      editorCallback: this.createEditorCallback(this.pullFromHackMD.bind(this))
    });

    this.addCommand({
      id: 'force-push',
      name: 'Force push',
      editorCallback: this.createEditorCallback(
        (editor: Editor, file: TFile) => this.pushToHackMD(editor, file, 'force')
      )
    });

    this.addCommand({
      id: 'force-pull',
      name: 'Force pull',
      editorCallback: this.createEditorCallback(
        (editor: Editor, file: TFile) => this.pullFromHackMD(editor, file, 'force')
      )
    });

    this.addCommand({
      id: 'copy-url',
      name: 'Copy URL',
      editorCallback: this.createEditorCallback(this.copyHackMDUrl.bind(this))
    });

    this.addCommand({
      id: 'delete',
      name: 'Delete remote',
      editorCallback: this.createEditorCallback(this.deleteHackMDNote.bind(this))
    });
  }


  // Creates a wrapped editor callback with error handling.
  // Enforce the editor and file to be passed into the callback.
  private createEditorCallback(
    callback: (editor: Editor, file: TFile) => Promise<void>
  ) {
    return async (editor: Editor, view: MarkdownView) => {
      if (!this.client) {
        new Notice('Please set up HackMD authentication in settings first');
        return;
      }
      if (!view.file) {
        new Notice('No active file');
        return;
      }
      try {
        await callback(editor, view.file);
      } catch (error) {
        console.error('Command failed:', error);
        new Notice(`Operation failed: ${error.message}`);
      }
    };
  }

  // Initializes the HackMD client
  async initializeClient() {
    try {
      this.client = new HackMDClient(this.settings.accessToken);
      await this.client.getMe();
    } catch (error) {
      console.error('Failed to initialize HackMD client:', error);
      new Notice('Failed to connect to HackMD. Please check your access token.');
      this.client = null;
    }
  }

  // Pushes content 
  private async pushToHackMD(
    editor: Editor,
    file: TFile,
    mode: SyncMode = 'normal'
  ): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');

    const { content, noteId } = await this.prepareSync(editor);

    // if force push, just push the note, otherwise check for recent remote edits
    if (mode === 'normal' && noteId) {
      await this.checkPushConflicts(file, noteId);
    }

    const result = noteId
      ? await this.updateRemoteNote(noteId, file, content)
      : await this.createRemoteNote(file, content);

    await this.updateLocalMetadata(editor, file, result);
    new Notice('Successfully pushed to HackMD!');
  }

  // Pulls content 
  private async pullFromHackMD(
    editor: Editor,
    file: TFile,
    mode: SyncMode = 'normal'
  ): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');
    const { noteId } = await this.prepareSync(editor);

    if (!noteId) {
      throw new Error('This file has not been pushed to HackMD yet.');
    }

    if (mode === 'normal') {
      await this.checkPullConflicts(file);
    }

    const note = await this.client.getNote(noteId);
    await this.updateLocalContent(editor, file, note);
    new Notice('Successfully pulled from HackMD!');
  }

  // Copies HackMD URL to clipboard
  private async copyHackMDUrl(editor: Editor): Promise<void> {
    const { noteId } = await this.prepareSync(editor);

    if (!noteId) {
      throw new Error('This file has not been pushed to HackMD yet.');
    }

    await navigator.clipboard.writeText(`https://hackmd.io/${noteId}`);
    new Notice('HackMD URL copied to clipboard!');
  }

  // Deletes a note from HackMD
  private async deleteHackMDNote(editor: Editor, file: TFile): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');

    const { metadata } = await this.prepareSync(editor);
    const noteId = metadata?.hackmd?.url ? getIdFromUrl(metadata.hackmd.url) : null;

    if (!noteId) {
      throw new Error('This file is not linked to a HackMD note.');
    }

    const modal = ModalFactory.createDeleteModal(
      this.app,
      file.basename,
      async () => {
        await this.client!.deleteNote(noteId);
        await this.cleanupHackMDMetadata(editor, file);
        new Notice('Successfully unlinked note from HackMD!');
      }
    );

    modal.open();
  }

  // Prepares a file for sync operations; 
  // return the note content, metadata, and noteId
  private async prepareSync(
    editor: Editor,
  ): Promise<{ content: string; metadata: NoteFrontmatter | null; noteId: string | null }> {
    if (!editor) throw new Error('Editor not found');
    const content = editor.getValue();
    const { frontmatter } = this.getFrontmatter(content);
    const noteId = frontmatter?.hackmd?.url ? getIdFromUrl(frontmatter.hackmd.url) : null;
    return { content, metadata: frontmatter, noteId };
  }

  // Gets frontmatter and content from a note
  private getFrontmatter(content: string): { frontmatter: NoteFrontmatter | null, content: string, position: number } {
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    if (!fmMatch) {
      return { frontmatter: null, content, position: 0 };
    }

    try {
      const frontmatter = parseYaml(fmMatch[1]);
      const position = fmMatch[0].length;
      const remainingContent = content.slice(position);
      return { frontmatter, content: remainingContent, position };
    } catch (error) {
      console.error('Failed to parse frontmatter:', error);
      return { frontmatter: null, content, position: 0 };
    }
  }

  // Updates frontmatter in a note
  private updateFrontmatter(originalContent: string, metadata: HackMDMetadata | Partial<NoteFrontmatter>): string {
    const { frontmatter, content, position } = this.getFrontmatter(originalContent);
    let updatedFrontmatter: NoteFrontmatter = frontmatter || {};

    if ('id' in metadata) {
      // It's HackMD metadata
      updatedFrontmatter.hackmd = metadata as HackMDMetadata;
    } else {
      // It's a general frontmatter update
      updatedFrontmatter = {
        ...updatedFrontmatter,
        ...metadata
      };
    }

    // Clean up empty objects
    Object.keys(updatedFrontmatter).forEach(key => {
      if (updatedFrontmatter[key] &&
        typeof updatedFrontmatter[key] === 'object' &&
        Object.keys(updatedFrontmatter[key]).length === 0) {
        delete updatedFrontmatter[key];
      }
    });

    if (Object.keys(updatedFrontmatter).length === 0) {
      return position ? content : originalContent;
    }

    const yamlStr = stringifyYaml(updatedFrontmatter).trim();
    return `---\n${yamlStr}\n---\n${position ? content : originalContent}`;
  }

  // Errors if the remote note has been modified more recently
  private async checkPushConflicts(file: TFile, noteId: string): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');

    const note = await this.client.getNote(noteId);
    const lastSyncTime = this.settings.lastSyncTimestamps[file.path] || 0;
    const remoteModTime = new Date(note.lastChangedAt || note.createdAt).getTime();

    // If remote has changed since last sync
    if (remoteModTime > lastSyncTime) {
      throw new HackMDError(
        'remote note has been modified since last push. Use force sync to overwrite.',
        HackMDErrorType.SYNC_CONFLICT
      );
    }
  }

  // Errors if the local note has been modified more recently
  private async checkPullConflicts(file: TFile): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');
    const lastSyncTime = this.settings.lastSyncTimestamps[file.path] || 0;
    const localModTime = file.stat.mtime;

    // If local has changed since last sync
    if (localModTime > lastSyncTime) {
      throw new HackMDError(
        'Local note has been modified since last sync. Use force sync to overwrite.',
        HackMDErrorType.SYNC_CONFLICT
      );
    }
  }

  // Creates a new note on HackMD
  private async createRemoteNote(file: TFile, content: string): Promise<any> {
    if (!this.client) throw new Error('Client not initialized');

    return await this.client.createNote({
      content,
      title: file.basename,
      readPermission: this.settings.defaultReadPermission,
      writePermission: this.settings.defaultWritePermission,
      commentPermission: this.settings.defaultCommentPermission
    });
  }

  // Updates an existing note on HackMD
  private async updateRemoteNote(noteId: string, file: TFile, content: string): Promise<any> {
    if (!this.client) throw new Error('Client not initialized');

    return await this.client.updateNote(noteId, {
      content,
      title: file.basename
    });
  }

  // Updates local metadata after a sync operation
  private async updateLocalMetadata(editor: Editor, file: TFile, note: any): Promise<void> {
    const metadata: HackMDMetadata = {
      url: `https://hackmd.io/${note.id}`,
      title: note.title || file.basename,
      lastSync: new Date().toISOString(),
    };

    if (note.teamPath) metadata.teamPath = note.teamPath;


    const content = editor.getValue();
    const { frontmatter, content: noteContent } = this.getFrontmatter(content);

    // Create new frontmatter object with hackmd namespace
    const newFrontmatter: NoteFrontmatter = {
      ...frontmatter,
      hackmd: metadata
    };

    const updatedContent = '---\n' +
      stringifyYaml(newFrontmatter) +
      '---\n' +
      noteContent;

    editor.setValue(updatedContent);

    this.settings.noteIdMap[file.path] = note.id || '';
    this.settings.lastSyncTimestamps[file.path] = Date.now();
    await this.saveData(this.settings);
  }

  // Updates local content with remote changes
  private async updateLocalContent(editor: Editor, file: TFile, note: any): Promise<void> {
    const metadata: HackMDMetadata = {
      url: `https://hackmd.io/${note.id}`,
      title: note.title || file.basename,
      lastSync: new Date().toISOString(),
    };

    if (note.teamPath) metadata.teamPath = note.teamPath;

    const updatedContent = this.updateFrontmatter(note.content || '', metadata);
    editor.setValue(updatedContent);

    this.settings.lastSyncTimestamps[file.path] = Date.now();
    await this.saveData(this.settings);
  }

  // Cleans up HackMD metadata from a note
  private async cleanupHackMDMetadata(editor: Editor, file: TFile): Promise<void> {
    try {
      // Clean up plugin settings
      delete this.settings.noteIdMap[file.path];
      delete this.settings.lastSyncTimestamps[file.path];
      await this.saveData(this.settings);


      // Clean up frontmatter
      const content = editor.getValue();
      const { frontmatter, content: restContent } = this.getFrontmatter(content);

      if (frontmatter) {
        delete frontmatter.hackmd;

        // Convert remaining frontmatter back to YAML
        if (Object.keys(frontmatter).length > 0) {
          const yamlStr = stringifyYaml(frontmatter).trim();
          editor.setValue(`---\n${yamlStr}\n---\n${restContent}`);
        } else {
          editor.setValue(restContent.trim());
        }
      }

    } catch (error) {
      console.error('Failed to clean up HackMD metadata:', error);
      throw new Error('Failed to clean up HackMD metadata: ' + error.message);
    }
  }
}

function getIdFromUrl(url: string): string | null {
  const match = url.match(/hackmd\.io\/(?:@[^/]+\/)?([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

