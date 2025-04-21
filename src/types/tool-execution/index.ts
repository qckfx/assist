/**
 * Type definitions for tool execution state management
 */
import { ToolPreviewState } from '../preview';
import { ToolExecutionState } from '../platform-types';

/**
 * Type for data emitted with the PREVIEW_GENERATED event
 */
export interface PreviewGeneratedEventData {
  execution: ToolExecutionState;
  preview: ToolPreviewState;
}

/**
 * Type for data emitted with the COMPLETED event when a preview is available
 */
export interface ExecutionCompletedWithPreviewEventData {
  execution: ToolExecutionState;
  preview?: ToolPreviewState;
}

export type { ToolExecutionStatus } from '@qckfx/agent/browser/internals';