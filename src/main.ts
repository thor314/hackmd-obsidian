import {
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  parseYaml,
  stringifyYaml,
} from 'obsidian';
import { HackMDClient } from './client';
import {
  HackMDPluginSettings,
  DEFAULT_SETTINGS,
  HackMDSettingTab,
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
  private client: HackMDClient;
  private readonly SYNC_TIME_MARGIN = 4000;

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.ensureClientInitialized();
    this.registerCommands();
    this.addSettingTab(new HackMDSettingTab(this.app, this));
  }

  private registerCommands(): void {
    const commands = [
      {
        name: 'Push',
        callback: this.pushToHackMD.bind(this),
      },
      {
        name: 'Pull',
        callback: this.pullFromHackMD.bind(this),
      },
      {
        name: 'Force Push',
        callback: (editor: Editor, file: TFile) =>
          this.pushToHackMD(editor, file, 'force'),
      },
      {
        name: 'Force Pull',
        callback: (editor: Editor, file: TFile) =>
          this.pullFromHackMD(editor, file, 'force'),
      },
      {
        name: 'Copy URL',
        callback: this.copyHackMDUrl.bind(this),
      },
      {
        name: 'Delete Remote',
        callback: this.deleteHackMDNote.bind(this),
      },
    ];

    for (const command of commands) {
      this.addCommand({
        id: command.name.toLowerCase().replace(' ', '-'),
        name: command.name,
        editorCallback: this.createEditorCallback(command.callback),
      });
    }
  }

  private createEditorCallback(
    callback: (editor: Editor, file: TFile) => Promise<void>
  ) {
    return async (editor: Editor, view: MarkdownView) => {
      try {
        if (!view.file) {
          throw new Error('No active file');
        }
        await callback(editor, view.file);
      } catch (error) {
        console.error('Command failed:', error);
        new Notice(`Operation failed: ${error.message}`);
      }
    };
  }

  public async ensureClientInitialized(): Promise<void> {
    try {
      if (!this.settings.accessToken) throw new Error();
      this.client = new HackMDClient(this.settings.accessToken);
      await this.client.getMe();
    } catch (error) {
      throw new HackMDError(
        'Failed to initialize HackMD client. Check your access token.',
        HackMDErrorType.AUTH_FAILED
      );
    }
  }

  async getClient(): Promise<HackMDClient> {
    if (!this.client) {
      await this.ensureClientInitialized();
    }
    return this.client;
  }

  private async pushToHackMD(
    editor: Editor,
    file: TFile,
    mode: SyncMode = 'normal'
  ): Promise<void> {
    const client = await this.getClient();
    const { content, noteId } = await this.prepareSync(editor);
    let result;

    if (noteId) {
      if (mode === 'normal') {
        await this.checkPushConflicts(file, noteId);
      }
      result = await client.updateNote(noteId, { content });
    } else {
      result = await this.pushNewNote(editor, file, content);
    }

    const updatedMetadata: Partial<HackMDMetadata> = {
      url: `https://hackmd.io/${result.id}`,
      title: result.title || file.basename,
      lastSync: new Date().toISOString(),
    };

    if (result.teamPath) {
      updatedMetadata.teamPath = result.teamPath;
    }

    await this.updateLocalNote({
      editor,
      content,
      metadata: updatedMetadata,
    });

    new Notice('Successfully pushed to HackMD!');
  }

  private async pushNewNote(
    editor: Editor,
    file: TFile,
    content: string
  ): Promise<any> {
    const client = await this.getClient();

    // First ensure the title is in the frontmatter
    const { frontmatter, content: noteContent } = this.getFrontmatter(content);
    const newFrontmatter: NoteFrontmatter = {
      ...frontmatter,
      title: file.basename,
    };

    // Create the note with proper title in frontmatter
    const contentWithTitle = this.combine(newFrontmatter, noteContent);
    const result = await client.createNote({
      content: contentWithTitle,
      readPermission: this.settings.defaultReadPermission,
      writePermission: this.settings.defaultWritePermission,
      commentPermission: this.settings.defaultCommentPermission,
    });

    return result;
  }

  private async pullFromHackMD(
    editor: Editor,
    file: TFile,
    mode: SyncMode = 'normal'
  ): Promise<void> {
    const client = await this.getClient();
    const { noteId } = await this.prepareSync(editor);

    if (!noteId) {
      throw new Error('This file has not been pushed to HackMD yet.');
    }

    if (mode === 'normal') {
      await this.checkPullConflicts(file);
    }

    const note = await client.getNote(noteId);

    const updatedMetadata: Partial<HackMDMetadata> = {
      url: `https://hackmd.io/${note.id}`,
      title: note.title || file.basename,
      lastSync: new Date().toISOString(),
    };

    if (note.teamPath) {
      updatedMetadata.teamPath = note.teamPath;
    }

    await this.updateLocalNote({
      editor,
      content: note.content || '',
      metadata: updatedMetadata,
    });

    new Notice('Successfully pulled from HackMD!');
  }

  private async copyHackMDUrl(editor: Editor): Promise<void> {
    const { noteId } = await this.prepareSync(editor);

    if (!noteId) {
      throw new Error('This file has not been pushed to HackMD yet.');
    }

    await navigator.clipboard.writeText(`https://hackmd.io/${noteId}`);
    new Notice('HackMD URL copied to clipboard!');
  }

  private async deleteHackMDNote(editor: Editor, file: TFile): Promise<void> {
    const client = await this.getClient();

    const { frontmatter } = await this.prepareSync(editor);
    const noteId = frontmatter?.url
      ? client.getIdFromUrl(frontmatter.url)
      : null;

    if (!noteId) {
      throw new Error('This file is not linked to a HackMD note.');
    }

    const modal = ModalFactory.createDeleteModal(
      this.app,
      file.basename,
      async () => {
        await client.deleteNote(noteId);
        await this.cleanupHackMDMetadata(editor);
        new Notice('Successfully unlinked note from HackMD!');
      }
    );

    modal.open();
  }

  private async prepareSync(editor: Editor): Promise<{
    content: string;
    frontmatter: NoteFrontmatter | null;
    noteId: string | null;
  }> {
    const client = await this.getClient();
    if (!editor) throw new Error('Editor not found');
    const content = editor.getValue();
    const { frontmatter } = this.getFrontmatter(content);
    const noteId = frontmatter?.url
      ? client.getIdFromUrl(frontmatter.url)
      : null;
    return { content, frontmatter, noteId };
  }

  private getFrontmatter(content: string): {
    frontmatter: NoteFrontmatter | null;
    content: string;
    position: number;
  } {
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

  private async checkPushConflicts(file: TFile, noteId: string): Promise<void> {
    const client = await this.getClient();

    const note = await client.getNote(noteId);
    const content = await this.app.vault.read(file);
    const { frontmatter } = this.getFrontmatter(content);
    const lastSyncStr = frontmatter?.lastSync;

    if (!lastSyncStr) {
      throw new HackMDError(
        'Could not verify the last sync of the local note. Pull remote note or use Force Push to overwrite.',
        HackMDErrorType.SYNC_CONFLICT
      );
    }

    const lastSyncTime = new Date(lastSyncStr).getTime();
    const remoteModTime = new Date(
      note.lastChangedAt || note.createdAt
    ).getTime();

    if (remoteModTime - lastSyncTime > this.SYNC_TIME_MARGIN) {
      throw new HackMDError(
        'Remote note has been modified since last push. Pull change or use Force Push to overwrite.',
        HackMDErrorType.SYNC_CONFLICT
      );
    }
  }

  private async checkPullConflicts(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    const { frontmatter } = this.getFrontmatter(content);
    const lastSyncStr = frontmatter?.lastSync;

    if (!lastSyncStr) {
      throw new HackMDError(
        'Could not verify the last sync of the local note. Use Force Pull to overwrite.',
        HackMDErrorType.SYNC_CONFLICT
      );
    }

    const lastSyncTime = new Date(lastSyncStr).getTime();
    const localModTime = file.stat.mtime;

    if (localModTime - lastSyncTime > this.SYNC_TIME_MARGIN) {
      throw new HackMDError(
        'Local note has been modified since last sync. Use Force Pull to overwrite.',
        HackMDErrorType.SYNC_CONFLICT
      );
    }
  }

  private async updateLocalNote(params: {
    editor: Editor;
    content?: string;
    metadata: Partial<HackMDMetadata>;
  }): Promise<void> {
    const { editor, metadata } = params;
    const baseContent = params.content ?? editor.getValue();
    const { frontmatter, content: noteContent } =
      this.getFrontmatter(baseContent);

    const newFrontmatter: NoteFrontmatter = {
      ...frontmatter,
      ...metadata,
    };

    // Remove empty metadata fields
    Object.keys(newFrontmatter).forEach(key => {
      if (
        newFrontmatter[key] &&
        typeof newFrontmatter[key] === 'object' &&
        Object.keys(newFrontmatter[key]).length === 0
      ) {
        delete newFrontmatter[key];
      }
    });

    const updatedContent =
      Object.keys(newFrontmatter).length > 0
        ? this.combine(newFrontmatter, noteContent)
        : noteContent;

    editor.setValue(updatedContent);
    await this.saveData(this.settings);
  }

  private async cleanupHackMDMetadata(editor: Editor): Promise<void> {
    const content = editor.getValue();
    const { frontmatter, content: noteContent } = this.getFrontmatter(content);

    if (frontmatter) {
      // Create a new frontmatter object without HackMD-specific fields
      const cleanedFrontmatter: NoteFrontmatter = { ...frontmatter };
      delete cleanedFrontmatter.url;
      delete cleanedFrontmatter.lastSync;
      delete cleanedFrontmatter.teamPath;
      delete cleanedFrontmatter.title;

      // Only keep frontmatter if there are remaining fields
      if (Object.keys(cleanedFrontmatter).length > 0) {
        const frontmatterAndContent = this.combine(
          cleanedFrontmatter,
          noteContent
        );
        editor.setValue(frontmatterAndContent);
      } else {
        editor.setValue(noteContent.trim());
      }
    }
  }

  private combine(frontmatter: NoteFrontmatter, content: string): string {
    return `---\n${stringifyYaml(frontmatter).trim()}\n---\n${content}`;
  }
}
