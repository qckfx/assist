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
  ImageContentPart,
  CodeBlockContentPart,
  RepositoryEnvironment,
  ExecutionAdapter,
  RepositoryInfo,
  GitRepositoryInfo,
  ToolExecutionManager,
  ExecutionAdapterFactoryOptions,
  ExecutionAdapterType,
  PromptManager,
} from '@qckfx/agent/node/internals';
import { 
  parseStructuredContent,
  createContextWindow,
  isSessionAborted,
  setSessionAborted,
  clearSessionAborted,
  createExecutionAdapter,
  createDefaultPromptManager,
  createPromptManager,
  createPermissionManager,
  createToolRegistry,
  createAgentRunner,
  ToolExecutionStatus,
  ContextWindow
} from '@qckfx/agent/node/internals';

import type { PreviewContentType, ToolPreviewState } from '../types/preview';

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
  createContextWindow,
  isSessionAborted,
  setSessionAborted,
  clearSessionAborted,
  createExecutionAdapter,
  createDefaultPromptManager,
  createPromptManager,
  createPermissionManager,
  createToolRegistry,
  createAgentRunner,
  ContextWindow,
};
export type {
  StructuredContent,
  ContentPart,
  TextContentPart,
  ImageContentPart,
  CodeBlockContentPart,
  RepositoryEnvironment,
  ExecutionAdapter,
  RepositoryInfo,
  GitRepositoryInfo,
  ToolExecutionManager,
  ExecutionAdapterFactoryOptions,
  ExecutionAdapterType,
  PromptManager,
};
