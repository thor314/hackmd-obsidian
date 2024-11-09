import { TFile } from 'obsidian';
import { NotePermissionRole, CommentPermissionType } from '@hackmd/api/dist/type';

// HackMD metadata stored in note frontmatter
export interface HackMDMetadata {
  url: string;
  title: string;
  lastSync: string;
  teamPath?: string;
}

// Note frontmatter structure
export interface NoteFrontmatter {
  hackmd?: HackMDMetadata;
  [key: string]: any;
}

// HackMD API response
export interface HackMDResponse {
  status: number;
  data: any;
  ok: boolean;
}

// Note creation/update options
export interface NoteOptions {
  title?: string;
  content?: string;
  readPermission?: NotePermissionRole;
  writePermission?: NotePermissionRole;
  commentPermission?: CommentPermissionType;
}

// Plugin settings
export interface HackMDPluginSettings {
  accessToken: string;
  defaultReadPermission: NotePermissionRole;
  defaultWritePermission: NotePermissionRole;
  defaultCommentPermission: CommentPermissionType;
  noteIdMap: Record<string, string>;
  lastSyncTimestamps: Record<string, number>;
}

// Sync state between local and remote notes
export interface SyncState {
  file: TFile;
  localModTime: number;
  remoteModTime: number;
  lastSyncTime: number;
  contentChanged: boolean;
  metadataChanged: boolean;
}

// Modal configuration
export interface ModalConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  warning?: boolean;
}

// Type guards
export function isHackMDMetadata(value: any): value is HackMDMetadata {
  return value &&
    typeof value === 'object' &&
    'url' in value &&
    'title' in value &&
    'lastSync' in value;
}

export function hasFrontmatter(content: string): boolean {
  return content.startsWith('---\n');
}

// Error types
export enum HackMDErrorType {
  AUTH_FAILED = 'auth_failed',
  NOT_FOUND = 'not_found',
  NETWORK_ERROR = 'network_error',
  SYNC_CONFLICT = 'sync_conflict',
  PERMISSION_DENIED = 'permission_denied',
  UNKNOWN = 'unknown'
}

export class HackMDError extends Error {
  public type: HackMDErrorType;
  public statusCode?: number;

  constructor(message: string, type: HackMDErrorType = HackMDErrorType.UNKNOWN, statusCode?: number) {
    super(message);
    this.type = type;
    this.statusCode = statusCode;
    this.name = 'HackMDError';
  }

  static fromApiError(error: any): HackMDError {
    switch (error.status) {
      case 401:
        return new HackMDError('Authentication failed. Please check your access token.',
          HackMDErrorType.AUTH_FAILED, 401);
      case 403:
        return new HackMDError('Not authorized to perform this action.',
          HackMDErrorType.PERMISSION_DENIED, 403);
      case 404:
        return new HackMDError('Resource not found.',
          HackMDErrorType.NOT_FOUND, 404);
      default:
        return new HackMDError(`Request failed: ${error.message}`,
          HackMDErrorType.UNKNOWN, error.status);
    }
  }
}

// Plugin constants
export const CONSTANTS = {
  MIN_SYNC_INTERVAL: 1000,
  DEFAULT_TIMEOUT: 10000,
  MAX_RETRIES: 3,
} as const;

// Utility types
export type AsyncResult<T> = Promise<{
  success: boolean;
  data?: T;
  error?: HackMDError;
}>;

export type SyncDirection = 'push' | 'pull';
export type SyncMode = 'normal' | 'force';
