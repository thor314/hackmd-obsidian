import { requestUrl } from 'obsidian';
import {
  HackMDError,
  HackMDErrorType,
  HackMDNote,
  HackMDResponse,
  HackMDUser,
  isHackMDUser,
  NoteOptions,
} from './types';

// Client for interacting with the HackMD API
export class HackMDClient {
  private static instance: HackMDClient;
  private static accessToken: string;
  private readonly baseUrl = 'https://api.hackmd.io/v1';
  private readonly headers: Record<string, string>;

  private constructor(accessToken: string) {
    this.headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  public static async getInstance(accessToken: string): Promise<HackMDClient> {
    if (!accessToken) {
      throw new HackMDError(
        'Failed to initialize HackMD client. Check your access token.',
        HackMDErrorType.AUTH_FAILED
      );
    }

    if (HackMDClient.instance && HackMDClient.accessToken === accessToken) {
      return HackMDClient.instance;
    }
    HackMDClient.instance = new HackMDClient(accessToken);
    HackMDClient.accessToken = accessToken;
    await HackMDClient.instance.getMe(); // Verify token works
    return HackMDClient.instance;
  }

  public static resetInstance(): void {
    HackMDClient.accessToken = '';
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
    data?: NoteOptions
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
        ok: response.status >= 200 && response.status < 300,
      };
    } catch (error) {
      console.error('Request failed:', {
        url,
        method,
        status: error.status,
        message: error.message,
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
  async getMe(): Promise<HackMDUser> {
    const response = await this.request('GET', '/me');
    if (!response.data || !isHackMDUser(response.data)) {
      throw new HackMDError(
        'Failed to get user information',
        HackMDErrorType.NOT_FOUND
      );
    }
    return response.data as HackMDUser;
  }

  // Gets a note by ID
  async getNote(noteId: string): Promise<HackMDNote> {
    const response = await this.request('GET', `/notes/${noteId}`);
    if (!response.data) {
      throw new HackMDError(
        `Note ${noteId} not found`,
        HackMDErrorType.NOT_FOUND
      );
    }
    return response.data as HackMDNote;
  }

  // Creates a new note
  async createNote(options: NoteOptions): Promise<HackMDNote> {
    const response = await this.request('POST', '/notes', options);
    if (!response.data) {
      throw new HackMDError('Failed to create note', HackMDErrorType.UNKNOWN);
    }
    return response.data as HackMDNote;
  }

  // Updates an existing note
  async updateNote(noteId: string, options: NoteOptions): Promise<HackMDNote> {
    const response = await this.request('PATCH', `/notes/${noteId}`, options);

    if (response.status === 202) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return this.getNote(noteId);
    }

    if (!response.data) {
      throw new HackMDError(
        `Failed to update note ${noteId}`,
        HackMDErrorType.UNKNOWN
      );
    }
    return response.data as HackMDNote;
  }

  // Deletes a note
  async deleteNote(noteId: string): Promise<boolean> {
    const response = await this.request('DELETE', `/notes/${noteId}`);
    if (response.status === 404) {
      console.debug(`Note ${noteId} was already deleted or doesn't exist`);
    }
    // Both successful deletion and "already deleted" cases return true
    return true;
  }
}

export function getIdFromUrl(url: string): string | null {
  const match = url.match(/hackmd\.io\/(?:@[^/]+\/)?([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export function getUrlFromId(noteId: string): string {
  return `https://hackmd.io/${noteId}`;
}
