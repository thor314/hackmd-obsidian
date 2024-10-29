import { TFile } from 'obsidian';
import { NotePermissionRole, CommentPermissionType } from '@hackmd/api/dist/type';

/**
 * HackMD metadata stored in note frontmatter
 */
export interface HackMDMetadata {
  /** HackMD note ID */
  id: string;
  /** Full URL to the note */
  url: string;
  /** Note title */
  title: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last sync timestamp */
  lastSync: string;
  /** Read permission setting */
  readPermission: NotePermissionRole;
  /** Write permission setting */
  writePermission: NotePermissionRole;
  /** Comment permission setting */
  commentPermission: CommentPermissionType;
  /** Optional team path for team notes */
  teamPath?: string;
  /** Optional published note link */
  publishLink?: string;
}

/**
 * Structure for note frontmatter
 */
export interface NoteFrontmatter {
  /** HackMD-specific metadata */
  hackmd?: HackMDMetadata;
  /** Any other frontmatter fields */
  [key: string]: any;
}

/**
 * Response from HackMD API
 */
export interface HackMDResponse {
  /** HTTP status code */
  status: number;
  /** Response data */
  data: any;
  /** Whether the request was successful */
  ok: boolean;
}

/**
 * Options for creating or updating notes
 */
export interface NoteOptions {
  /** Note title */
  title?: string;
  /** Note content */
  content?: string;
  /** Read permission setting */
  readPermission?: NotePermissionRole;
  /** Write permission setting */
  writePermission?: NotePermissionRole;
  /** Comment permission setting */
  commentPermission?: CommentPermissionType;
}

/**
 * Plugin settings structure
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
 * Structure for sync state between local and remote notes
 */
export interface SyncState {
  /** Local file reference */
  file: TFile;
  /** Local modification time */
  localModTime: number;
  /** Remote modification time */
  remoteModTime: number;
  /** Last sync timestamp */
  lastSyncTime: number;
  /** Whether content has changed */
  contentChanged: boolean;
  /** Whether metadata has changed */
  metadataChanged: boolean;
}

/**
 * Supported modal types
 */
export interface ModalConfig {
  /** Modal title */
  title: string;
  /** Modal message */
  message: string;
  /** Confirm button text */
  confirmText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Whether this is a warning modal */
  warning?: boolean;
}

/**
 * Type guard to check if a value is a HackMD metadata object
 */
export function isHackMDMetadata(value: any): value is HackMDMetadata {
  return (
    value &&
    typeof value === 'object' &&
    'id' in value &&
    'url' in value &&
    'title' in value
  );
}

/**
 * Type guard to check if content has frontmatter
 */
export function hasFrontmatter(content: string): boolean {
  return content.startsWith('---\n');
}

/**
 * Error types for the plugin
 */
export enum HackMDErrorType {
  AUTH_FAILED = 'auth_failed',
  NOT_FOUND = 'not_found',
  NETWORK_ERROR = 'network_error',
  SYNC_CONFLICT = 'sync_conflict',
  PERMISSION_DENIED = 'permission_denied',
  UNKNOWN = 'unknown'
}

/**
 * Custom error class for HackMD operations
 */
export class HackMDError extends Error {
  public type: HackMDErrorType;
  public statusCode?: number;

  constructor(
    message: string,
    type: HackMDErrorType = HackMDErrorType.UNKNOWN,
    statusCode?: number
  ) {
    super(message);
    this.type = type;
    this.statusCode = statusCode;
    this.name = 'HackMDError';
  }

  /**
   * Creates an error instance based on an API error response
   */
  static fromApiError(error: any): HackMDError {
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
}

/**
 * Constants used throughout the plugin
 */
export const CONSTANTS = {
  /** Minimum time between sync operations */
  MIN_SYNC_INTERVAL: 1000,
  /** Default timeout for API requests */
  DEFAULT_TIMEOUT: 10000,
  /** Maximum retries for API requests */
  MAX_RETRIES: 3,
} as const;

/**
 * Utility types
 */
export type AsyncResult<T> = Promise<{
  success: boolean;
  data?: T;
  error?: HackMDError;
}>;

export type SyncDirection = 'push' | 'pull';

export type SyncMode = 'normal' | 'force';
