import { App, PluginSettingTab, Setting } from 'obsidian';
import {
  NotePermissionRole,
  CommentPermissionType,
} from '@hackmd/api/dist/type';
import type HackMDPlugin from './main';

// Plugin settings configuration
export interface HackMDPluginSettings {
  accessToken: string;
  defaultReadPermission: NotePermissionRole;
  defaultWritePermission: NotePermissionRole;
  defaultCommentPermission: CommentPermissionType;
}

export const DEFAULT_SETTINGS: HackMDPluginSettings = {
  accessToken: '',
  defaultReadPermission: NotePermissionRole.OWNER,
  defaultWritePermission: NotePermissionRole.OWNER,
  defaultCommentPermission: CommentPermissionType.DISABLED,
};

export class HackMDSettingTab extends PluginSettingTab {
  private readonly plugin: HackMDPlugin;

  constructor(app: App, plugin: HackMDPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.renderAccessTokenSetting();
    this.renderPermissionSettings();
  }

  private renderAccessTokenSetting(): void {
    new Setting(this.containerEl)
      .setName('Token')
      .setDesc(
        'HackMD API access token (from hackmd.io → Settings → API → Create API token)'
      )
      .addText(text =>
        text
          .setPlaceholder('Enter your HackMD access token')
          .setValue(this.plugin.settings.accessToken || '')
          .onChange(async value => {
            this.plugin.settings.accessToken = value;
            await this.plugin.saveData(this.plugin.settings);
            this.plugin.initializeClient()
          })
      );
  }

  private renderPermissionSettings(): void {
    this.renderReadPermissionSetting();
    this.renderWritePermissionSetting();
    this.renderCommentPermissionSetting();
  }

  private renderReadPermissionSetting(): void {
    new Setting(this.containerEl)
      .setName('Read permission')
      .setDesc('Read permission for new notes')
      .addDropdown(dropdown =>
        this.configurePermissionDropdown(
          dropdown,
          [
            { value: NotePermissionRole.OWNER, label: 'Owner' },
            { value: NotePermissionRole.SIGNED_IN, label: 'Signed In Users' },
            { value: NotePermissionRole.GUEST, label: 'Everyone' },
          ],
          this.plugin.settings.defaultReadPermission,
          async (value: NotePermissionRole) => {
            this.plugin.settings.defaultReadPermission = value;
          }
        )
      );
  }

  private renderWritePermissionSetting(): void {
    new Setting(this.containerEl)
      .setName('Write permission')
      .setDesc('write permission for new notes')
      .addDropdown(dropdown =>
        this.configurePermissionDropdown(
          dropdown,
          [
            { value: NotePermissionRole.OWNER, label: 'Owner' },
            { value: NotePermissionRole.SIGNED_IN, label: 'Signed In Users' },
            { value: NotePermissionRole.GUEST, label: 'Everyone' },
          ],
          this.plugin.settings.defaultWritePermission,
          async (value: NotePermissionRole) => {
            this.plugin.settings.defaultWritePermission = value;
            await this.plugin.saveData(this.plugin.settings);
          }
        )
      );
  }

  private renderCommentPermissionSetting(): void {
    new Setting(this.containerEl)
      .setName('Comment permission')
      .setDesc('comment permission for new notes')
      .addDropdown(dropdown =>
        this.configurePermissionDropdown(
          dropdown,
          [
            { value: CommentPermissionType.DISABLED, label: 'Disabled' },
            { value: CommentPermissionType.FORBIDDEN, label: 'Forbidden' },
            { value: CommentPermissionType.OWNERS, label: 'Owner' },
            {
              value: CommentPermissionType.SIGNED_IN_USERS,
              label: 'Signed In Users',
            },
            { value: CommentPermissionType.EVERYONE, label: 'Everyone' },
          ],
          this.plugin.settings.defaultCommentPermission,
          async (value: CommentPermissionType) => {
            this.plugin.settings.defaultCommentPermission = value;
            await this.plugin.saveData(this.plugin.settings);
          }
        )
      );
  }

  // Configure dropdown with permissions options
  private configurePermissionDropdown<T>(
    dropdown: any,
    options: Array<{ value: T; label: string }>,
    currentValue: T,
    onChange: (value: T) => Promise<void>
  ) {
    options.forEach(({ value, label }) => {
      dropdown.addOption(value, label);
    });

    return dropdown.setValue(currentValue).onChange(onChange);
  }
}
