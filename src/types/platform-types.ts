/**
 * Platform‑specific extensions of the `@qckfx/agent` public types.
 *
 * The agent‑core package purposely omits UI / persistence details such as
 * previews and summaries.  This wrapper defines richer interfaces for use
 * inside the server and React front‑end while re‑exporting the original
 * enums so that callers only change their import path.
 */

import type {
  ToolExecutionState as CoreExecutionState,
  PermissionRequestState as CorePermissionRequestState,
  StructuredContent,
  ContentPart,
  TextContentPart,
  ContextWindow
} from '@qckfx/agent';
import type {
  ExecutionAdapter,
  ExecutionAdapterFactoryOptions,
  ToolExecutionManager,
  PromptManager
} from '@qckfx/agent/internals';
import { 
  parseStructuredContent,
  ToolExecutionStatus
} from '@qckfx/agent';
import {
  createExecutionAdapter,
  createPromptManager,
} from '@qckfx/agent/internals';

import type { PreviewContentType, ToolPreviewState } from '../types/preview';

/**
 * Permission modes for agent operations
 */
export enum PermissionMode {
  /** Standard permission mode - requires user approval for risky operations */
  NORMAL = 'normal',
  /** Fast edit mode - auto-approves safe file operations */
  FAST_EDIT = 'fast-edit', 
  /** Dangerous mode - auto-approves all operations (use only in secure environments) */
  DANGEROUS = 'dangerous'
}

/**
 * Repository information for a session
 */
export interface RepositoryInfo {
  /**
   * Working directory path
   */
  workingDirectory: string;
  
  /**
   * Whether the directory is a git repository
   */
  isGitRepository: boolean;
  
  /**
   * Current branch name (if git repository)
   */
  currentBranch?: string;
  
  /**
   * Whether the repository has uncommitted changes
   */
  hasUncommittedChanges?: boolean;
  
  /**
   * Hash of the most recent commit (if git repository)
   */
  latestCommitHash?: string;
  
  /**
   * Warning flags for the repository state
   */
  warnings?: {
    /**
     * Whether there are uncommitted changes (which won't be included in the saved state)
     */
    uncommittedChanges?: boolean;
    
    /**
     * Whether there are untracked files (which won't be included in the saved state)
     */
    untrackedFiles?: boolean;
  };
}

/**
 * Extended execution record used by the platform layer.
 */
export interface ToolExecutionState extends CoreExecutionState {
  /** User‑friendly, one‑line summary for timeline display. */
  summary?: string;

  /** ID of the preview associated with this execution. */
  previewId?: string;

  /** The preview associated with this execution. */
  preview?: ToolPreviewState;

  /**
   * Whether the tool execution has a preview.
   */
  hasPreview?: boolean;

  /**
   * The type of preview content.
   */
  previewContentType?: PreviewContentType;
}

/**
 * Extended permission request including preview reference.
 */
export interface PermissionRequestState extends CorePermissionRequestState {
  previewId?: string;

  /**
   * Inline preview shown while awaiting permission.
   */
  preview?: ToolPreviewState;
}

/**
 * Platform‑side execution events (adds PREVIEW_GENERATED).
 */
export enum ToolExecutionEvent {
  CREATED = 'tool_execution:created',
  UPDATED = 'tool_execution:updated',
  COMPLETED = 'tool_execution:completed',
  ERROR = 'tool_execution:error',
  ABORTED = 'tool_execution:aborted',
  PERMISSION_REQUESTED = 'tool_execution:permission_requested',
  PERMISSION_RESOLVED = 'tool_execution:permission_resolved',
  PREVIEW_GENERATED = 'tool_execution:preview_generated',
}

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

export interface PreviewGeneratedEventData {
  execution: ToolExecutionState;
  preview: ToolPreviewState;
}

export interface ExecutionCompletedWithPreviewEventData {
  execution: ToolExecutionState;
  preview?: ToolPreviewState;
}

export interface PermissionRequestedEventData {
  execution: ToolExecutionState;
  permissionRequest: PermissionRequestState;
  preview?: ToolPreviewState;
}

export interface PermissionResolvedEventData {
  execution: ToolExecutionState;
  permissionRequest: PermissionRequestState;
  granted: boolean;
  preview?: ToolPreviewState;
}

// Export status enum unchanged so callers can import alongside wrappers.
export { 
  ToolExecutionStatus,
  parseStructuredContent,
  createExecutionAdapter,
  createPromptManager,
  ContextWindow,
};
export type {
  StructuredContent,
  ContentPart,
  TextContentPart,
  ExecutionAdapter,
  ToolExecutionManager,
  ExecutionAdapterFactoryOptions,
  PromptManager,
};
