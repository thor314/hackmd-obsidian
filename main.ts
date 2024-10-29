import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, requestUrl, RequestUrlParam } from 'obsidian';
import { NotePermissionRole, CommentPermissionType } from '@hackmd/api/dist/type';
import { parseYaml, stringifyYaml } from 'obsidian';

interface HackMDMetadata {
	id: string;
	url: string;
	title: string;
	createdAt: string;
	lastSync: string;
	readPermission: NotePermissionRole;
	writePermission: NotePermissionRole;
	commentPermission: CommentPermissionType;
	teamPath?: string;
	publishLink?: string;
}

interface NoteFrontmatter {
	hackmd?: HackMDMetadata;
	[key: string]: any;
}

interface HackMDResponse {
	status: number;
	data: any;
	ok: boolean;
}

class HackMDClient {
	private baseUrl = 'https://api.hackmd.io/v1';
	private accessToken: string;

	constructor(accessToken: string) {
		this.accessToken = accessToken;
	}

	private getAuthHeaders() {
		return {
			'Authorization': `Bearer ${this.accessToken}`,
			'Content-Type': 'application/json',
			'Accept': 'application/json'
		};
	}

	private async request(endpoint: string, options: Partial<RequestUrlParam> = {}): Promise<HackMDResponse> {
		const url = `${this.baseUrl}${endpoint}`;
		try {
			console.log('Making request to:', url);
			const response = await requestUrl({
				url,
				method: options.method || 'GET',
				headers: {
					...this.getAuthHeaders(),
					...options.headers,
				},
				body: options.body,
			});

			console.log('Response:', response);

			// Handle 202 Accepted response specially
			if (response.status === 202) {
				return {
					status: response.status,
					data: null,
					ok: true
				};
			}

			return {
				status: response.status,
				data: response.json,
				ok: response.status >= 200 && response.status < 300
			};
		} catch (error) {
			console.error('HackMD request failed:', error);
			if (error.status === 401) {
				throw new Error('Authentication failed. Please check your access token.');
			} else if (error.status === 403) {
				throw new Error('Not authorized to perform this action.');
			} else if (error.status === 404) {
				throw new Error('Resource not found.');
			} else {
				throw new Error(`Request failed: ${error.message}`);
			}
		}
	}

	async updateNote(noteId: string, options: {
		title?: string;
		content?: string;
		readPermission?: NotePermissionRole;
		writePermission?: NotePermissionRole;
		commentPermission?: CommentPermissionType;
	}) {
		console.log('Updating note with options:', options);
		const response = await this.request(`/notes/${noteId}`, {
			method: 'PATCH',
			body: JSON.stringify(options)
		});

		// For 202 responses, fetch the updated note data
		if (response.status === 202) {
			// Wait a short moment for the update to process
			await new Promise(resolve => setTimeout(resolve, 1000));
			const updatedNote = await this.getNote(noteId);
			return updatedNote;
		}

		if (!response.ok) {
			throw new Error(`Failed to update note: ${response.status}`);
		}
		return response.data;
	}

	async getMe() {
		const response = await this.request('/me');
		if (!response.ok) {
			throw new Error(`Failed to get user info: ${response.status}`);
		}
		return response.data;
	}

	async getNote(noteId: string) {
		const response = await this.request(`/notes/${noteId}`);
		if (!response.ok) {
			throw new Error(`Failed to get note: ${response.status}`);
		}
		return response.data;
	}

	async createNote(options: {
		title?: string;
		content?: string;
		readPermission?: NotePermissionRole;
		writePermission?: NotePermissionRole;
		commentPermission?: CommentPermissionType;
	}) {
		console.log('Creating note with options:', options);
		const response = await this.request('/notes', {
			method: 'POST',
			body: JSON.stringify({
				title: options.title || 'Untitled',
				content: options.content || '',
				readPermission: options.readPermission,
				writePermission: options.writePermission,
				commentPermission: options.commentPermission,
			})
		});

		if (!response.ok) {
			throw new Error(`Failed to create note: ${response.status}`);
		}
		return response.data;
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
			// new Notice('Successfully connected to HackMD!'); // debugging
		} catch (error) {
			console.error('Failed to initialize HackMD client:', error);
			new Notice('Failed to connect to HackMD. Please check your access token.');
			this.client = null;
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
		} catch (e) {
			console.error('Failed to parse frontmatter:', e);
			return { frontmatter: null, content, position: 0 };
		}
	}


	private updateFrontmatter(originalContent: string, metadata: HackMDMetadata): string {
		const { frontmatter, content, position } = this.getFrontmatter(originalContent);

		const updatedFrontmatter: NoteFrontmatter = frontmatter || {};
		updatedFrontmatter.hackmd = metadata;

		const yamlStr = stringifyYaml(updatedFrontmatter);
		return `---\n${yamlStr}---\n${position ? content : originalContent}`;
	}

	private async pushToHackMD(editor: Editor, file: TFile, force: boolean) {
		if (!this.client) {
			new Notice('HackMD client not initialized');
			return;
		}

		try {
			const content = editor.getValue();
			const { frontmatter } = this.getFrontmatter(content);
			const noteId = frontmatter?.hackmd?.id || this.settings.noteIdMap[file.path];

			if (!force && noteId) {
				try {
					const note = await this.client.getNote(noteId);
					const lastSyncTime = frontmatter?.hackmd?.lastSync
						? new Date(frontmatter.hackmd.lastSync).getTime()
						: 0;
					const localModTime = file.stat.mtime;
					const remoteModTime = new Date(note.lastChangedAt || note.createdAt).getTime();

					console.log('Sync times:', {
						lastSync: new Date(lastSyncTime).toISOString(),
						localMod: new Date(localModTime).toISOString(),
						remoteMod: new Date(remoteModTime).toISOString(),
					});

					if (remoteModTime > lastSyncTime && remoteModTime > localModTime) {
						new Notice('Remote note has been modified more recently. Use force push to overwrite.');
						return;
					}
				} catch (error) {
					console.log('Note not found or error checking remote:', error);
					delete this.settings.noteIdMap[file.path];
				}
			}

			let note;
			if (noteId) {
				console.log('Updating existing note:', noteId);
				note = await this.client.updateNote(noteId, {
					content: content,
					title: file.basename
				});
			} else {
				console.log('Creating new note');
				note = await this.client.createNote({
					content: content,
					title: file.basename,
					readPermission: this.settings.defaultReadPermission,
					writePermission: this.settings.defaultWritePermission,
					commentPermission: this.settings.defaultCommentPermission
				});
			}

			// If we got a response, update the metadata
			if (note) {
				const metadata: HackMDMetadata = {
					id: note.id,
					url: `https://hackmd.io/${note.id}`,
					title: note.title || file.basename,
					createdAt: note.createdAt || frontmatter?.hackmd?.createdAt || new Date().toISOString(),
					lastSync: new Date().toISOString(),
					readPermission: note.readPermission || this.settings.defaultReadPermission,
					writePermission: note.writePermission || this.settings.defaultWritePermission,
					commentPermission: note.commentPermission || this.settings.defaultCommentPermission,
				};

				if (note.teamPath) {
					metadata.teamPath = note.teamPath;
				}
				if (note.publishLink) {
					metadata.publishLink = note.publishLink;
				}

				const updatedContent = this.updateFrontmatter(content, metadata);
				editor.setValue(updatedContent);

				this.settings.noteIdMap[file.path] = note.id;
				this.settings.lastSyncTimestamps[file.path] = Date.now();
				await this.saveSettings();
			}

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
			const content = editor.getValue();
			const { frontmatter } = this.getFrontmatter(content);
			const noteId = frontmatter?.hackmd?.id || this.settings.noteIdMap[file.path];

			if (!noteId) {
				new Notice('This file has not been pushed to HackMD yet.');
				return;
			}

			if (!force) {
				const lastSync = frontmatter?.hackmd?.lastSync
					? new Date(frontmatter.hackmd.lastSync).getTime()
					: 0;

				if (file.stat.mtime > lastSync) {
					new Notice('Local file has been modified. Use force pull to overwrite.');
					return;
				}
			}

			const note = await this.client.getNote(noteId);

			// Update frontmatter with latest HackMD metadata
			const metadata: HackMDMetadata = {
				id: note.id,
				url: `https://hackmd.io/${note.id}`,
				title: note.title || file.basename,
				createdAt: note.createdAt || frontmatter?.hackmd?.createdAt || new Date().toISOString(),
				lastSync: new Date().toISOString(),
				readPermission: note.readPermission,
				writePermission: note.writePermission,
				commentPermission: note.commentPermission,
			};

			if (note.teamPath) {
				metadata.teamPath = note.teamPath;
			}
			if (note.publishLink) {
				metadata.publishLink = note.publishLink;
			}

			const updatedContent = this.updateFrontmatter(note.content || '', metadata);
			editor.setValue(updatedContent);

			this.settings.lastSyncTimestamps[file.path] = Date.now();
			await this.saveSettings();

			new Notice('Successfully pulled from HackMD!');
		} catch (error) {
			console.error('Failed to pull from HackMD:', error);
			new Notice(`Failed to pull from HackMD: ${error.message}`);
		}
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
