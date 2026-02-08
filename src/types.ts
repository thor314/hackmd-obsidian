import {
  NotePermissionRole,
  CommentPermissionType,
} from '@hackmd/api/dist/type';
import { IEditor } from './obsidian-service';

// HackMD metadata stored in note frontmatter
export interface HackMDMetadata {
  url: string;
  title: string;
  lastSync: string;
  teamPath?: string;
}

// Note frontmatter structure
export interface NoteFrontmatter extends Partial<HackMDMetadata> {
  [key: string]: any;
}

export interface SyncPrepareResult {
  content: string;
  frontmatter: NoteFrontmatter | null;
  noteId: string | undefined;
}

export interface UpdateLocalNoteParams {
  editor: IEditor;
  content?: string;
  metadata: Partial<HackMDMetadata>;
}

// Response types for HackMD API - simplified to what we use
export interface HackMDNote {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  lastChangedAt?: string;
  teamPath?: string;
}

export interface HackMDUser {
  id: string;
  name: string;
  userPath: string;
}

export interface HackMDResponse {
  status: number;
  ok: boolean;
  data: HackMDNote | HackMDUser | null;
}

// Only the options we actually send to the API
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
export function isHackMDMetadata(
  value: unknown
): value is HackMDMetadata {
  return (
    value != null &&
    typeof value === 'object' &&
    'url' in value &&
    'title' in value &&
    'lastSync' in value
  );
}

export function isHackMDUser(data: unknown): data is HackMDUser {
  return (
    data != null &&
    typeof data === 'object' &&
    'id' in data &&
    'name' in data &&
    'userPath' in data
  );
}

export function hasFrontmatter(content: string): boolean {
  return content.startsWith('---\n');
}

// Error types - User-oriented error messages directly embedded in enum values
export enum HackMDErrorType {
  // Authentication Errors
  AUTH_REQUIRED = 'An access token is required. Please configure your HackMD token in settings.',
  AUTH_INVALID = 'Your HackMD access token appears to be invalid. Please check your settings.',
  AUTH_EXPIRED = 'Your HackMD session has expired. Please generate a new access token.',

  // Synchronization Errors
  SYNC_CONFLICT_REMOTE = "Remote note has been modified since your last sync. Use 'Force Pull' to override local changes.",
  SYNC_CONFLICT_LOCAL = "Local note has been modified since your last sync. Use 'Force Push' to override remote version.",
  SYNC_NOT_LINKED = "This note is not linked to HackMD. Use 'Push' to publish it first.",
  SYNC_METADATA_MISSING = "Sync metadata is missing. Use 'Force Push/Pull' to reset synchronization.",

  // Access Errors
  PERMISSION_DENIED = "You don't have permission to access this HackMD note.",
  NOTE_NOT_FOUND = 'This note no longer exists on HackMD. It may have been deleted.',
  TEAM_ACCESS_DENIED = "You don't have access to this team note. Contact your team administrator.",

  // Network Errors
  CONNECTION_FAILED = 'Unable to connect to HackMD. Check your internet connection.',
  SERVER_ERROR = 'The HackMD server encountered an error. Please try again later.',
  RATE_LIMITED = 'Too many requests to HackMD. Please wait a few minutes before trying again.',

  // Local Handling Errors
  FILE_EXISTS = 'A file with this name already exists. An alternative name has been used.',
  INVALID_URL = 'The provided HackMD URL is invalid. Check the format.',
  PARSE_ERROR = 'Unable to process the note content. The format may be incompatible.',

  // Context Errors
  NO_ACTIVE_NOTE = 'This command requires an active Markdown note.',
  OBSIDIAN_RESTRICTION = 'This operation is not allowed by Obsidian in this context.',

  // Fallback
  UNKNOWN = 'An unknown error occurred.',
}

export class HackMDError extends Error {
  public type: HackMDErrorType;
  public statusCode?: number;
  public originalError?: any;

  constructor(
    type: HackMDErrorType = HackMDErrorType.UNKNOWN,
    message?: string,
    statusCode?: number,
    originalError?: any
  ) {
    // Use provided message or the message embedded in the enum
    super(message || type);

    this.type = type;
    this.statusCode = statusCode;
    this.originalError = originalError;
    this.name = 'HackMDError';
  }
}

// Plugin constants
export const CONSTANTS = {
  MIN_SYNC_INTERVAL: 1000,
  DEFAULT_TIMEOUT: 10000,
  MAX_RETRIES: 3,
} as const;

export type SyncDirection = 'push' | 'pull';
export type SyncMode = 'normal' | 'force';
