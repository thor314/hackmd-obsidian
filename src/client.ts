import { requestUrl } from 'obsidian';
import { NotePermissionRole, CommentPermissionType } from '@hackmd/api/dist/type';
import { HackMDError, HackMDErrorType } from './types';

// Response type for HackMD API requests
interface HackMDResponse {
  status: number;
  data: any;
  ok: boolean;
}

// Options for creating or updating a HackMD note
interface NoteOptions {
  title?: string;
  content?: string;
  readPermission?: NotePermissionRole;
  writePermission?: NotePermissionRole;
  commentPermission?: CommentPermissionType;
}

// Client for interacting with the HackMD API
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
   * @param method - HTTP method
   * @param endpoint - API endpoint
   * @param data - Request body data
   * @returns Response from the API
   */
  private async request(
    method: string,
    endpoint: string,
    data?: any
  ): Promise<HackMDResponse> {
    const url = `${this.baseUrl}${endpoint}`;
    try {
      const response = await requestUrl({
        url,
        method,
        headers: {
          ...this.headers,
          'Content-Type': 'application/json',
        },
        body: data ? JSON.stringify(data) : undefined,
      });

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
        method,
        status: error.status,
        message: error.message
      });

      // Special handling for delete operations
      if (method === 'DELETE' && error.status === 404) {
        return { status: 404, data: null, ok: true };
      }

      throw this.handleApiError(error);
    }
  }

  // Handle API errors with HackMDError type
  private handleApiError(error: any): HackMDError {
    switch (error.status) {
      case 401:
        return new HackMDError(
          'Authentication failed. Please check your access token.',
          HackMDErrorType.AUTH_FAILED,
          401
        );
      case 403:
        return new HackMDError(
          'Not authorized to perform this action.',
          HackMDErrorType.PERMISSION_DENIED,
          403
        );
      case 404:
        return new HackMDError(
          'Resource not found.',
          HackMDErrorType.NOT_FOUND,
          404
        );
      default:
        return new HackMDError(
          `Request failed: ${error.message}`,
          HackMDErrorType.UNKNOWN,
          error.status
        );
    }
  }

  // Gets the current user's information
  async getMe() {
    const response = await this.request('GET', '/me');
    return response.data;
  }

  // Gets a note by ID
  async getNote(noteId: string) {
    const response = await this.request('GET', `/notes/${noteId}`);
    return response.data;
  }

  // Creates a new note
  async createNote(options: NoteOptions) {
    const data = {
      content: options.content || '',
      readPermission: options.readPermission,
      writePermission: options.writePermission,
      commentPermission: options.commentPermission,
    };

    const response = await this.request('POST', '/notes', data);
    return response.data;
  }

  // Updates an existing note
  async updateNote(noteId: string, options: NoteOptions) {
    const response = await this.request('PATCH', `/notes/${noteId}`, options);
    // Handle 202 Accepted response
    if (response.status === 202) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return this.getNote(noteId);
    }
    return response.data;
  }

  // Deletes a note
  async deleteNote(noteId: string): Promise<boolean> {
    const response = await this.request('DELETE', `/notes/${noteId}`);
    // Both successful deletion and "already deleted" cases return true
    if (response.status === 404) {
      console.debug(`Note ${noteId} was already deleted or doesn't exist`);
    }
    return true;
  }
}
