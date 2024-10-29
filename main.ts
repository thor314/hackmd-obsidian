import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, requestUrl, RequestUrlParam } from 'obsidian';
import { NotePermissionRole, CommentPermissionType } from '@hackmd/api/dist/type';

interface HackMDResponse {
	status: number;
	json: any;
	ok: boolean;
}

class HackMDClient {
	private baseUrl = 'https://api.hackmd.io/v1';
	private accessToken: string;

	constructor(accessToken: string) {
		this.accessToken = accessToken;
	}

	private async request(endpoint: string, options: Partial<RequestUrlParam> = {}): Promise<HackMDResponse> {
		const url = `${this.baseUrl}${endpoint}`;
		try {
			const response = await requestUrl({
				url,
				method: options.method || 'GET',
				headers: {
					'Authorization': `Bearer ${this.accessToken}`,
					'Content-Type': 'application/json',
					...options.headers,
				},
				body: options.body,
			});

			return {
				status: response.status,
				json: response.json,
				ok: response.status >= 200 && response.status < 300
			};
		} catch (error) {
			console.error('HackMD request failed:', error);
			throw error;
		}
	}

	async getMe() {
		const response = await this.request('/me');
		if (!response.ok) {
			throw new Error('Failed to get user info');
		}
		return response.json;
	}

	async getNote(noteId: string) {
		const response = await this.request(`/notes/${noteId}`);
		if (!response.ok) {
			throw new Error('Failed to get note');
		}
		return response.json;
	}

	async createNote(options: {
		title?: string;
		content?: string;
		readPermission?: NotePermissionRole;
		writePermission?: NotePermissionRole;
		commentPermission?: CommentPermissionType;
	}) {
		const response = await this.request('/notes', {
			method: 'POST',
			body: JSON.stringify(options)
		});
		if (!response.ok) {
			throw new Error('Failed to create note');
		}
		return response.json;
	}

	async updateNote(noteId: string, options: {
		title?: string;
		content?: string;
		readPermission?: NotePermissionRole;
		writePermission?: NotePermissionRole;
		commentPermission?: CommentPermissionType;
	}) {
		const response = await this.request(`/notes/${noteId}`, {
			method: 'PATCH',
			body: JSON.stringify(options)
		});
		if (!response.ok) {
			throw new Error('Failed to update note');
		}
		return response.json;
	}
}

interface HackMDPluginSettings {
	accessToken: string;
	defaultReadPermission: NotePermissionRole;
	defaultWritePermission: NotePermissionRole;
	defaultCommentPermission: CommentPermissionType;
	noteIdMap: { [path: string]: string };
	lastSyncTimestamps: { [path: string]: number };
}

const DEFAULT_SETTINGS: HackMDPluginSettings = {
	accessToken: '',
	defaultReadPermission: NotePermissionRole.OWNER,
	defaultWritePermission: NotePermissionRole.OWNER,
	defaultCommentPermission: CommentPermissionType.DISABLED,
	noteIdMap: {},
	lastSyncTimestamps: {}
};

export default class HackMDPlugin extends Plugin {
	settings: HackMDPluginSettings;
	private client: HackMDClient | null = null;

	async onload() {
		await this.loadSettings();

		if (this.settings.accessToken) {
			await this.initializeClient();
		}

		this.addCommand({
			id: 'hackmd-push',
			name: 'Push to HackMD',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				if (!this.client) {
					new Notice('Please set up HackMD authentication in settings first');
					return;
				}
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
				if (!this.client) {
					new Notice('Please set up HackMD authentication in settings first');
					return;
				}
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
				if (!this.client) {
					new Notice('Please set up HackMD authentication in settings first');
					return;
				}
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
				if (!this.client) {
					new Notice('Please set up HackMD authentication in settings first');
					return;
				}
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
				if (!this.client) {
					new Notice('Please set up HackMD authentication in settings first');
					return;
				}
				if (view.file) {
					await this.copyHackMDUrl(view.file);
				} else {
					new Notice('No active file');
				}
			}
		});

		this.addSettingTab(new HackMDSettingTab(this.app, this));
	}

	async initializeClient() {
		try {
			this.client = new HackMDClient(this.settings.accessToken);

			// Test the connection
			const user = await this.client.getMe();
			console.log('Connected as:', user);
			new Notice('Successfully connected to HackMD!');
		} catch (error) {
			console.error('Failed to initialize HackMD client:', error);
			new Notice('Failed to connect to HackMD. Please check your access token.');
			this.client = null;
		}
	}

	private async pushToHackMD(editor: Editor, file: TFile, force: boolean) {
		if (!this.client) {
			new Notice('HackMD client not initialized');
			return;
		}

		try {
			const content = editor.getValue();
			const noteId = this.settings.noteIdMap[file.path];

			if (!force && noteId) {
				try {
					const note = await this.client.getNote(noteId);
					const lastSync = this.settings.lastSyncTimestamps[file.path] || 0;

					if (note.content !== content && Date.now() - lastSync > 0) {
						new Notice('Remote note has been modified. Use force push to overwrite.');
						return;
					}
				} catch (error) {
					delete this.settings.noteIdMap[file.path];
				}
			}

			if (noteId) {
				await this.client.updateNote(noteId, {
					content: content
				});
			} else {
				const note = await this.client.createNote({
					content: content,
					readPermission: this.settings.defaultReadPermission,
					writePermission: this.settings.defaultWritePermission,
					commentPermission: this.settings.defaultCommentPermission,
					title: file.basename
				});

				this.settings.noteIdMap[file.path] = note.id;
				await this.saveSettings();
			}

			this.settings.lastSyncTimestamps[file.path] = Date.now();
			await this.saveSettings();
			new Notice('Successfully pushed to HackMD!');
		} catch (error) {
			console.error('Failed to push to HackMD:', error);
			new Notice(`Failed to push to HackMD: ${error.message}`);
		}
	}

	private async pullFromHackMD(editor: Editor, file: TFile, force: boolean) {
		if (!this.client) {
			new Notice('HackMD client not initialized');
			return;
		}

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

			const note = await this.client.getNote(noteId);
			editor.setValue(note.content || '');

			this.settings.lastSyncTimestamps[file.path] = Date.now();
			await this.saveSettings();
			new Notice('Successfully pulled from HackMD!');
		} catch (error) {
			console.error('Failed to pull from HackMD:', error);
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
			await navigator.clipboard.writeText(`https://hackmd.io/${noteId}`);
			new Notice('HackMD URL copied to clipboard!');
		} catch (error) {
			console.error('Failed to copy URL:', error);
			new Notice('Failed to copy URL to clipboard');
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
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
			.setDesc('HackMD API access token (from hackmd.io → Settings → API → Create API token)')
			.addText(text => text
				.setPlaceholder('Enter your HackMD access token')
				.setValue(this.plugin.settings.accessToken || '')
				.onChange(async (value) => {
					this.plugin.settings.accessToken = value;
					await this.plugin.saveSettings();
					await this.plugin.initializeClient();
				}));

		new Setting(containerEl)
			.setName('Default Read Permission')
			.setDesc('Default read permission for new notes')
			.addDropdown(dropdown => dropdown
				.addOption(NotePermissionRole.OWNER, 'Owner Only')
				.addOption(NotePermissionRole.SIGNED_IN, 'Signed In Users')
				.addOption(NotePermissionRole.GUEST, 'Everyone')
				.setValue(this.plugin.settings.defaultReadPermission)
				.onChange(async (value: NotePermissionRole) => {
					this.plugin.settings.defaultReadPermission = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Write Permission')
			.setDesc('Default write permission for new notes')
			.addDropdown(dropdown => dropdown
				.addOption(NotePermissionRole.OWNER, 'Owner Only')
				.addOption(NotePermissionRole.SIGNED_IN, 'Signed In Users')
				.addOption(NotePermissionRole.GUEST, 'Everyone')
				.setValue(this.plugin.settings.defaultWritePermission)
				.onChange(async (value: NotePermissionRole) => {
					this.plugin.settings.defaultWritePermission = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Comment Permission')
			.setDesc('Default comment permission for new notes')
			.addDropdown(dropdown => dropdown
				.addOption(CommentPermissionType.DISABLED, 'Disabled')
				.addOption(CommentPermissionType.FORBIDDEN, 'Forbidden')
				.addOption(CommentPermissionType.OWNERS, 'Owners Only')
				.addOption(CommentPermissionType.SIGNED_IN_USERS, 'Signed In Users')
				.addOption(CommentPermissionType.EVERYONE, 'Everyone')
				.setValue(this.plugin.settings.defaultCommentPermission)
				.onChange(async (value: CommentPermissionType) => {
					this.plugin.settings.defaultCommentPermission = value;
					await this.plugin.saveSettings();
				}));
	}
}
