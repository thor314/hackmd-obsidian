// import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Remember to rename these classes and interfaces!

interface HackMDPluginSettings {
	accessToken: string;
	apiEndpoint: string;
	defaultReadPermission: 'owner' | 'signed_in' | 'guest';
	defaultWritePermission: 'owner' | 'signed_in' | 'guest';
	defaultCommentPermission: 'disabled' | 'forbidden' | 'owners' | 'signed_in_users' | 'everyone';
	noteIdMap: { [path: string]: string }; // Maps local file paths to HackMD note IDs
	lastSyncTimestamps: { [path: string]: number };
}

const DEFAULT_SETTINGS: HackMDPluginSettings = {
	accessToken: '',
	apiEndpoint: 'https://api.hackmd.io/v1',
	defaultReadPermission: 'owner',
	defaultWritePermission: 'owner',
	defaultCommentPermission: 'disabled',
	noteIdMap: {},
	lastSyncTimestamps: {}
}

export default class HackMDPlugin extends Plugin {
	settings: HackMDPluginSettings;

	async onload() {
		await this.loadSettings();

		// Initialize HackMD CLI configuration if needed
		await this.initializeHackMDConfig();



		// Add commands
		this.addCommand({
			id: 'hackmd-push',
			name: 'Push to HackMD',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				if (view.file) {
					await this.pushToHackMD(editor, view.file, false);
				} else {
					new Notice('No active file to push');
				}
			}
		});

		this.addCommand({
			id: 'hackmd-pull',
			name: 'Pull from HackMD',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				if (view.file) {
					await this.pullFromHackMD(editor, view.file, false);
				} else {
					new Notice('No active file to pull');
				}
			}
		});

		this.addCommand({
			id: 'hackmd-force-push',
			name: 'Force Push to HackMD',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				if (view.file) {
					await this.pushToHackMD(editor, view.file, true);
				} else {
					new Notice('No active file to push');
				}
			}
		});

		this.addCommand({
			id: 'hackmd-force-pull',
			name: 'Force Pull from HackMD',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				if (view.file) {
					await this.pullFromHackMD(editor, view.file, true);
				} else {
					new Notice('No active file to pull');
				}
			}
		});

		this.addCommand({
			id: 'hackmd-copy-url',
			name: 'Copy HackMD URL',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				if (view.file) {
					await this.copyHackMDUrl(view.file);
				} else {
					new Notice('No active file to copy URL from');
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new HackMDSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async initializeHackMDConfig() {
		if (this.settings.accessToken) {
			// Set environment variable for HackMD CLI
			process.env.HMD_API_ACCESS_TOKEN = this.settings.accessToken;
			// process.env.HMD_API_ENDPOINT_URL = this.settings.apiEndpoint;

			try {
				// Verify login status
				await this.runHackMDCommand('whoami');
			} catch (error) {
				new Notice('Failed to authenticate with HackMD. Please check your access token in settings.');
				console.error('HackMD authentication error:', error);
			}
		}
	}

	private async runHackMDCommand(command: string): Promise<string> {
		try {
			const { stdout } = await execAsync(`hackmd-cli ${command}`);
			return stdout.trim();
		} catch (error) {
			console.error('HackMD CLI error:', error);
			throw new Error(`Failed to execute HackMD command: ${error.message}`);
		}
	}

	private async pushToHackMD(editor: Editor, file: TFile, force: boolean) {
		try {
			const content = editor.getValue();
			const noteId = this.settings.noteIdMap[file.path];

			if (!force && noteId) {
				// Check if note exists and has been modified
				try {
					const noteContent = await this.runHackMDCommand(`export --noteId=${noteId}`);
					const lastSync = this.settings.lastSyncTimestamps[file.path] || 0;

					if (noteContent !== content && Date.now() - lastSync > 0) {
						new Notice('Remote note has been modified. Use force push to overwrite.');
						return;
					}
				} catch (error) {
					// Note might have been deleted, create new one
					delete this.settings.noteIdMap[file.path];
				}
			}

			if (noteId) {
				// Update existing note
				await this.runHackMDCommand(`notes:update --noteId=${noteId} --content="${content}"`);
			} else {
				// Create new note
				const result = await this.runHackMDCommand(
					`notes:create --content="${content}" ` +
					`--readPermission=${this.settings.defaultReadPermission} ` +
					`--writePermission=${this.settings.defaultWritePermission} ` +
					`--commentPermission=${this.settings.defaultCommentPermission} ` +
					`--title="${file.basename}"`
				);

				// Parse noteId from result and store it
				// Assuming the output includes the note ID in some format
				const newNoteId = this.parseNoteIdFromResult(result);
				this.settings.noteIdMap[file.path] = newNoteId;
				await this.saveSettings();
			}

			this.settings.lastSyncTimestamps[file.path] = Date.now();
			await this.saveSettings();
			new Notice('Successfully pushed to HackMD!');
		} catch (error) {
			new Notice(`Failed to push to HackMD: ${error.message}`);
		}
	}

	private async pullFromHackMD(editor: Editor, file: TFile, force: boolean) {
		try {
			const noteId = this.settings.noteIdMap[file.path];
			if (!noteId) {
				new Notice('This file has not been pushed to HackMD yet.');
				return;
			}

			if (!force) {
				const lastSync = this.settings.lastSyncTimestamps[file.path] || 0;
				if (file.stat.mtime > lastSync) {
					new Notice('Local file has been modified. Use force pull to overwrite.');
					return;
				}
			}

			const content = await this.runHackMDCommand(`export --noteId=${noteId}`);
			editor.setValue(content);

			this.settings.lastSyncTimestamps[file.path] = Date.now();
			await this.saveSettings();
			new Notice('Successfully pulled from HackMD!');
		} catch (error) {
			new Notice(`Failed to pull from HackMD: ${error.message}`);
		}
	}

	private async copyHackMDUrl(file: TFile) {
		const noteId = this.settings.noteIdMap[file.path];
		if (!noteId) {
			new Notice('This file has not been pushed to HackMD yet.');
			return;
		}

		try {
			// Construct HackMD URL (adjust based on your HackMD instance)
			const url = `https://hackmd.io/${noteId}`;
			await navigator.clipboard.writeText(url);
			new Notice('HackMD URL copied to clipboard!');
		} catch (error) {
			new Notice(`Failed to copy HackMD URL: ${error.message}`);
		}
	}

	private parseNoteIdFromResult(result: string): string {
		// This needs to be implemented based on the actual output format of the CLI
		// For now, this is a placeholder implementation
		const matches = result.match(/ID\s+([^\s]+)/);
		return matches ? matches[1] : '';
	}
}


class HackMDSettingTab extends PluginSettingTab {
	plugin: HackMDPlugin;

	constructor(app: App, plugin: HackMDPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Access Token')
			.setDesc('HackMD API access token')
			.addText(text => text
				.setPlaceholder('Enter your HackMD access token')
				.setValue(this.plugin.settings.accessToken)
				.onChange(async (value) => {
					this.plugin.settings.accessToken = value;
					await this.plugin.saveSettings();
					await this.plugin.initializeHackMDConfig();
				}));

		new Setting(containerEl)
			.setName('API Endpoint')
			.setDesc('HackMD API endpoint URL')
			.addText(text => text
				.setPlaceholder('https://api.hackmd.io/v1')
				.setValue(this.plugin.settings.apiEndpoint)
				.onChange(async (value) => {
					this.plugin.settings.apiEndpoint = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Read Permission')
			.setDesc('Default read permission for new notes')
			.addDropdown(dropdown => dropdown
				.addOption('owner', 'Owner Only')
				.addOption('signed_in', 'Signed In Users')
				.addOption('guest', 'Everyone')
				.setValue(this.plugin.settings.defaultReadPermission)
				.onChange(async (value: 'owner' | 'signed_in' | 'guest') => {
					this.plugin.settings.defaultReadPermission = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Write Permission')
			.setDesc('Default write permission for new notes')
			.addDropdown(dropdown => dropdown
				.addOption('owner', 'Owner Only')
				.addOption('signed_in', 'Signed In Users')
				.addOption('guest', 'Everyone')
				.setValue(this.plugin.settings.defaultWritePermission)
				.onChange(async (value: 'owner' | 'signed_in' | 'guest') => {
					this.plugin.settings.defaultWritePermission = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Comment Permission')
			.setDesc('Default comment permission for new notes')
			.addDropdown(dropdown => dropdown
				.addOption('disabled', 'Disabled')
				.addOption('forbidden', 'Forbidden')
				.addOption('owners', 'Owners Only')
				.addOption('signed_in_users', 'Signed In Users')
				.addOption('everyone', 'Everyone')
				.setValue(this.plugin.settings.defaultCommentPermission)
				.onChange(async (value: 'disabled' | 'forbidden' | 'owners' | 'signed_in_users' | 'everyone') => {
					this.plugin.settings.defaultCommentPermission = value;
					await this.plugin.saveSettings();
				}));
	}
}
