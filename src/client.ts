import { requestUrl, RequestUrlParam } from 'obsidian';
import { NotePermissionRole, CommentPermissionType } from '@hackmd/api/dist/type';

/**
 * Response type for HackMD API requests
 */
interface HackMDResponse {
  status: number;
  data: any;
  ok: boolean;
}

/**
 * Options for creating or updating a HackMD note
 */
interface NoteOptions {
  title?: string;
  content?: string;
  readPermission?: NotePermissionRole;
  writePermission?: NotePermissionRole;
  commentPermission?: CommentPermissionType;
}

/**
 * Client for interacting with the HackMD API
 */
export class HackMDClient {
  private readonly baseUrl = 'https://api.hackmd.io/v1';
  private readonly headers: Record<string, string>;

  /**
   * Creates a new HackMD client
   * @param accessToken - HackMD API access token
   */
  constructor(accessToken: string) {
    this.headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * Makes a request to the HackMD API
   * @param endpoint - API endpoint
   * @param options - Request options
   * @returns Response from the API
   * @throws Error if the request fails
   */
  private async request(endpoint: string, options: Partial<RequestUrlParam> = {}): Promise<HackMDResponse> {
    const url = `${this.baseUrl}${endpoint}`;
    try {
      console.log('Making request to:', url);
      const response = await requestUrl({
        url,
        method: options.method || 'GET',
        headers: {
          ...this.headers,
          ...options.headers,
        },
        body: options.body,
      });

      console.log('Response:', response);

      // Handle special response types
      if (response.status === 204 || response.text.length === 0) {
        return { status: response.status, data: null, ok: true };
      }
      if (response.status === 202) {
        return { status: response.status, data: null, ok: true };
      }

      return {
        status: response.status,
        data: response.json,
        ok: response.status >= 200 && response.status < 300
      };
    } catch (error) {
      console.error('Request failed:', {
        url,
        method: options.method || 'GET',
        status: error.status,
        message: error.message
      });

      // Special handling for delete operations
      if (options.method === 'DELETE' && error.status === 404) {
        return { status: 404, data: null, ok: true };
      }

      throw this.handleApiError(error);
    }
  }

  /**
   * Converts API errors into meaningful error messages
   */
  private handleApiError(error: any): Error {
    switch (error.status) {
      case 401:
        return new Error('Authentication failed. Please check your access token.');
      case 403:
        return new Error('Not authorized to perform this action.');
      case 404:
        return new Error('Resource not found.');
      default:
        return new Error(`Request failed: ${error.message}`);
    }
  }

  /**
   * Gets the current user's information
   * @returns User information
   */
  async getMe() {
    const response = await this.request('/me');
    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.status}`);
    }
    return response.data;
  }

  /**
   * Gets a note by ID
   * @param noteId - ID of the note to retrieve
   * @returns Note data
   */
  async getNote(noteId: string) {
    const response = await this.request(`/notes/${noteId}`);
    if (!response.ok) {
      throw new Error(`Failed to get note: ${response.status}`);
    }
    return response.data;
  }

  /**
   * Creates a new note
   * @param options - Note creation options
   * @returns Created note data
   */
  async createNote(options: NoteOptions) {
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

  /**
   * Updates an existing note
   * @param noteId - ID of the note to update
   * @param options - Update options
   * @returns Updated note data
   */
  async updateNote(noteId: string, options: NoteOptions) {
    console.log('Updating note with options:', options);
    const response = await this.request(`/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify(options)
    });

    // Handle 202 Accepted response
    if (response.status === 202) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return this.getNote(noteId);
    }

    if (!response.ok) {
      throw new Error(`Failed to update note: ${response.status}`);
    }
    return response.data;
  }

  /**
   * Deletes a note
   * @param noteId - ID of the note to delete
   * @returns true if deletion was successful
   */
  async deleteNote(noteId: string): Promise<boolean> {
    try {
      const response = await this.request(`/notes/${noteId}`, {
        method: 'DELETE'
      });

      if (response.status === 404) {
        console.log(`Note ${noteId} was already deleted or doesn't exist`);
      } else {
        console.log(`Note ${noteId} successfully deleted`);
      }
      return true;
    } catch (error) {
      if (error.status === 404) return true;
      throw error;
    }
  }
}
