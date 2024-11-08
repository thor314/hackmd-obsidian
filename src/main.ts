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
    await this.loadSettings();
    await this.setupClient();
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
      name: 'Force Push',
      editorCallback: this.createEditorCallback(
        (editor: Editor, file: TFile) => this.pushToHackMD(editor, file, 'force')
      )
    });

    this.addCommand({
      id: 'force-pull',
      name: 'Force Pull',
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
      name: 'Delete Remote',
      editorCallback: this.createEditorCallback(this.deleteHackMDNote.bind(this))
    });
  }


  // Creates a wrapped editor callback with error handling
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


  // Set up the HackMD client
  async setupClient() {
    if (this.settings.accessToken) {
      await this.initializeClient();
    }
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

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }


  // Pushes content 
  private async pushToHackMD(
    editor: Editor,
    file: TFile,
    mode: SyncMode = 'normal'
  ): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');

    const { content, metadata } = await this.prepareSync(editor);
    const noteId = metadata?.hackmd?.id;

    if (mode === 'normal' && noteId) {
      await this.checkSyncConflicts(file, noteId);
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

    const { metadata } = await this.prepareSync(editor);
    const noteId = metadata?.hackmd?.id;

    if (!noteId) {
      throw new Error('This file has not been pushed to HackMD yet.');
    }

    if (mode === 'normal') {
      await this.checkSyncConflicts(file, noteId);
    }

    const note = await this.client.getNote(noteId);
    await this.updateLocalContent(editor, file, note);
    new Notice('Successfully pulled from HackMD!');
  }


  // Copies HackMD URL to clipboard
  private async copyHackMDUrl(editor: Editor): Promise<void> {
    const { metadata } = await this.prepareSync(editor);
    const noteId = metadata?.hackmd?.id;

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
    const noteId = metadata?.hackmd?.id;

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


  // Prepares a file for sync operations
  private async prepareSync(
    editor: Editor,
  ): Promise<{ content: string; metadata: NoteFrontmatter | null }> {
    const content = editor.getValue();
    const { frontmatter } = this.getFrontmatter(content);
    return { content, metadata: frontmatter };
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

  // Checks for sync conflicts between local and remote versions
  private async checkSyncConflicts(file: TFile, noteId: string): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');

    const note = await this.client.getNote(noteId);
    const lastSyncTime = this.settings.lastSyncTimestamps[file.path] || 0;
    const localModTime = file.stat.mtime;
    const remoteModTime = new Date(note.lastChangedAt || note.createdAt).getTime();

    if (remoteModTime > lastSyncTime && remoteModTime > localModTime) {
      throw new HackMDError(
        'Remote note has been modified more recently. Use force sync to overwrite.',
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
      id: note.id,
      url: `https://hackmd.io/${note.id}`,
      title: note.title || file.basename,
      createdAt: note.createdAt || new Date().toISOString(),
      lastSync: new Date().toISOString(),
      readPermission: note.readPermission || this.settings.defaultReadPermission,
      writePermission: note.writePermission || this.settings.defaultWritePermission,
      commentPermission: note.commentPermission || this.settings.defaultCommentPermission,
    };

    if (note.teamPath) metadata.teamPath = note.teamPath;
    if (note.publishLink) metadata.publishLink = note.publishLink;

    const content = editor.getValue();
    const updatedContent = this.updateFrontmatter(content, metadata);
    editor.setValue(updatedContent);

    this.settings.noteIdMap[file.path] = note.id;
    this.settings.lastSyncTimestamps[file.path] = Date.now();
    await this.saveSettings();
  }

  // Updates local content with remote changes
  private async updateLocalContent(editor: Editor, file: TFile, note: any): Promise<void> {
    const metadata: HackMDMetadata = {
      id: note.id,
      url: `https://hackmd.io/${note.id}`,
      title: note.title || file.basename,
      createdAt: note.createdAt || new Date().toISOString(),
      lastSync: new Date().toISOString(),
      readPermission: note.readPermission,
      writePermission: note.writePermission,
      commentPermission: note.commentPermission,
    };

    if (note.teamPath) metadata.teamPath = note.teamPath;
    if (note.publishLink) metadata.publishLink = note.publishLink;

    const updatedContent = this.updateFrontmatter(note.content || '', metadata);
    editor.setValue(updatedContent);

    this.settings.lastSyncTimestamps[file.path] = Date.now();
    await this.saveSettings();
  }

  // Cleans up HackMD metadata from a note
  private async cleanupHackMDMetadata(editor: Editor, file: TFile): Promise<void> {
    try {
      // Clean up plugin settings
      delete this.settings.noteIdMap[file.path];
      delete this.settings.lastSyncTimestamps[file.path];
      await this.saveSettings();

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

  // Helper method for testing sync state
  async testSyncState(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      return;
    }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      return;
    }

    const content = view.editor.getValue();
    const { frontmatter } = this.getFrontmatter(content);
  }
}  
