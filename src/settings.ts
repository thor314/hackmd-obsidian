import { App, PluginSettingTab, Setting } from 'obsidian';
import { NotePermissionRole, CommentPermissionType } from '@hackmd/api/dist/type';
import type HackMDPlugin from './main';

/**
 * Plugin settings interface
 */
export interface HackMDPluginSettings {
  /** HackMD API access token */
  accessToken: string;
  /** Default read permission for new notes */
  defaultReadPermission: NotePermissionRole;
  /** Default write permission for new notes */
  defaultWritePermission: NotePermissionRole;
  /** Default comment permission for new notes */
  defaultCommentPermission: CommentPermissionType;
  /** Map of file paths to HackMD note IDs */
  noteIdMap: Record<string, string>;
  /** Map of file paths to last sync timestamps */
  lastSyncTimestamps: Record<string, number>;
}

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: HackMDPluginSettings = {
  accessToken: '',
  defaultReadPermission: NotePermissionRole.OWNER,
  defaultWritePermission: NotePermissionRole.OWNER,
  defaultCommentPermission: CommentPermissionType.DISABLED,
  noteIdMap: {},
  lastSyncTimestamps: {}
};

/**
 * Settings tab UI implementation
 */
export class HackMDSettingTab extends PluginSettingTab {
  private readonly plugin: HackMDPlugin;

  constructor(app: App, plugin: HackMDPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * Creates the settings UI
   */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.renderAccessTokenSetting();
    this.renderPermissionSettings();
  }

  /**
   * Renders the access token input section
   */
  private renderAccessTokenSetting(): void {
    new Setting(this.containerEl)
      .setName('Access Token')
      .setDesc('HackMD API access token (from hackmd.io → Settings → API → Create API token)')
      .addText(text => text
        .setPlaceholder('Enter your HackMD access token')
        .setValue(this.plugin.settings.accessToken || '')
        .onChange(async (value) => {
          this.plugin.settings.accessToken = value;
          await this.plugin.saveSettings();
          await this.plugin.initializeClient();
        }));
  }

  /**
   * Renders the permission settings sections
   */
  private renderPermissionSettings(): void {
    this.renderReadPermissionSetting();
    this.renderWritePermissionSetting();
    this.renderCommentPermissionSetting();
  }

  private renderReadPermissionSetting(): void {
    new Setting(this.containerEl)
      .setName('Default Read Permission')
      .setDesc('Default read permission for new notes')
      .addDropdown(dropdown => this.configurePermissionDropdown(
        dropdown,
        [
          { value: NotePermissionRole.OWNER, label: 'Owner Only' },
          { value: NotePermissionRole.SIGNED_IN, label: 'Signed In Users' },
          { value: NotePermissionRole.GUEST, label: 'Everyone' }
        ],
        this.plugin.settings.defaultReadPermission,
        async (value: NotePermissionRole) => {
          this.plugin.settings.defaultReadPermission = value;
          await this.plugin.saveSettings();
        }
      ));
  }

  private renderWritePermissionSetting(): void {
    new Setting(this.containerEl)
      .setName('Default Write Permission')
      .setDesc('Default write permission for new notes')
      .addDropdown(dropdown => this.configurePermissionDropdown(
        dropdown,
        [
          { value: NotePermissionRole.OWNER, label: 'Owner Only' },
          { value: NotePermissionRole.SIGNED_IN, label: 'Signed In Users' },
          { value: NotePermissionRole.GUEST, label: 'Everyone' }
        ],
        this.plugin.settings.defaultWritePermission,
        async (value: NotePermissionRole) => {
          this.plugin.settings.defaultWritePermission = value;
          await this.plugin.saveSettings();
        }
      ));
  }

  private renderCommentPermissionSetting(): void {
    new Setting(this.containerEl)
      .setName('Default Comment Permission')
      .setDesc('Default comment permission for new notes')
      .addDropdown(dropdown => this.configurePermissionDropdown(
        dropdown,
        [
          { value: CommentPermissionType.DISABLED, label: 'Disabled' },
          { value: CommentPermissionType.FORBIDDEN, label: 'Forbidden' },
          { value: CommentPermissionType.OWNERS, label: 'Owners Only' },
          { value: CommentPermissionType.SIGNED_IN_USERS, label: 'Signed In Users' },
          { value: CommentPermissionType.EVERYONE, label: 'Everyone' }
        ],
        this.plugin.settings.defaultCommentPermission,
        async (value: CommentPermissionType) => {
          this.plugin.settings.defaultCommentPermission = value;
          await this.plugin.saveSettings();
        }
      ));
  }

  /**
   * Helper function to configure permission dropdown menus
   */
  private configurePermissionDropdown<T>(
    dropdown: any,
    options: Array<{ value: T, label: string }>,
    currentValue: T,
    onChange: (value: T) => Promise<void>
  ) {
    options.forEach(({ value, label }) => {
      dropdown.addOption(value, label);
      // dropdown.addOption(value as string, label);
    });

    return dropdown
      .setValue(currentValue)
      .onChange(onChange);
  }
}

/**
 * Utility functions for settings management
 */
export const SettingsUtils = {
  /**
   * Gets the note ID for a given file path
   */
  getNoteId(settings: HackMDPluginSettings, filePath: string): string | null {
    return settings.noteIdMap[filePath] || null;
  },

  /**
   * Gets the last sync timestamp for a given file path
   */
  getLastSyncTime(settings: HackMDPluginSettings, filePath: string): number {
    return settings.lastSyncTimestamps[filePath] || 0;
  },

  /**
   * Updates the note ID mapping for a file path
   */
  updateNoteIdMap(settings: HackMDPluginSettings, filePath: string, noteId: string): void {
    settings.noteIdMap[filePath] = noteId;
  },

  /**
   * Updates the last sync timestamp for a file path
   */
  updateLastSyncTime(settings: HackMDPluginSettings, filePath: string): void {
    settings.lastSyncTimestamps[filePath] = Date.now();
  },

  /**
   * Removes all settings data for a file path
   */
  cleanupFileSettings(settings: HackMDPluginSettings, filePath: string): void {
    delete settings.noteIdMap[filePath];
    delete settings.lastSyncTimestamps[filePath];
  }
};
