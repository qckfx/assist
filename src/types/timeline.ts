/**
 * Types for the unified timeline feature
 */

import { StoredMessage } from './session';
import { ToolExecutionState, PermissionRequestState } from './platform-types';
import { ToolPreviewState } from './preview';

/**
 * Enum for types of timeline items
 */
export enum TimelineItemType {
  MESSAGE = 'message',
  TOOL_EXECUTION = 'tool_execution',
  PERMISSION_REQUEST = 'permission_request'
}

/**
 * Base interface for all timeline items
 */
export interface TimelineItemBase {
  /**
   * Unique ID for the timeline item
   */
  id: string;
  
  /**
   * Type of timeline item
   */
  type: TimelineItemType;
  
  /**
   * ISO timestamp for sorting the timeline chronologically
   */
  timestamp: string;
  
  /**
   * Session ID this item belongs to
   */
  sessionId: string;
}

/**
 * Message timeline item
 */
export interface MessageTimelineItem extends TimelineItemBase {
  type: TimelineItemType.MESSAGE;
  
  /**
   * The message data
   */
  message: StoredMessage;
  
  /**
   * Associated tool executions (if any)
   */
  toolExecutions?: string[];
}

/**
 * Tool execution timeline item
 */
export interface ToolExecutionTimelineItem extends TimelineItemBase {
  type: TimelineItemType.TOOL_EXECUTION;
  
  /**
   * The tool execution data
   */
  toolExecution: ToolExecutionState;
  
  /**
   * Associated permission request (if any)
   */
  permissionRequest?: string;
  
  /**
   * Associated preview (if any)
   */
  preview?: ToolPreviewState;
  
  /**
   * Parent message ID (if known)
   */
  parentMessageId?: string;
}

/**
 * Permission request timeline item
 */
export interface PermissionRequestTimelineItem extends TimelineItemBase {
  type: TimelineItemType.PERMISSION_REQUEST;
  
  /**
   * The permission request data
   */
  permissionRequest: PermissionRequestState;
  
  /**
   * Associated tool execution ID
   */
  toolExecutionId: string;
  
  /**
   * Associated preview (if any)
   */
  preview?: ToolPreviewState;
}

/**
 * Union type for all timeline items
 */
export type TimelineItem = 
  | MessageTimelineItem
  | ToolExecutionTimelineItem
  | PermissionRequestTimelineItem;

/**
 * Response for the timeline API endpoint
 */
export interface TimelineResponse {
  /**
   * Timeline items in chronological order
   */
  items: TimelineItem[];
  
  /**
   * Pagination token for the next page (if more items exist)
   */
  nextPageToken?: string;
  
  /**
   * Total count of timeline items for this session
   */
  totalCount: number;
}

/**
 * Parameters for timeline API requests
 */
export interface TimelineParams {
  /**
   * Maximum number of items to return
   */
  limit?: number;
  
  /**
   * Pagination token from a previous request
   */
  pageToken?: string;
  
  /**
   * Filter to specific types of timeline items
   */
  types?: TimelineItemType[];
  
  /**
   * Whether to include full related data (previews, etc.)
   */
  includeRelated?: boolean;
}

/**
 * Update to the WebSocketEvent enum
 */
export const TIMELINE_UPDATE = 'timeline_update';
export const TIMELINE_HISTORY = 'timeline_history';

/**
 * Timeline update event data
 */
export interface TimelineUpdateEvent {
  /**
   * Session ID for the update
   */
  sessionId: string;
  
  /**
   * New or updated timeline item
   */
  item: TimelineItem;
}

/**
 * Timeline history event data
 */
export interface TimelineHistoryEvent {
  /**
   * Session ID for the history
   */
  sessionId: string;
  
  /**
   * Timeline items in chronological order
   */
  items: TimelineItem[];
  
  /**
   * Pagination token for the next page (if more items exist)
   */
  nextPageToken?: string;
  
  /**
   * Total count of timeline items for this session
   */
  totalCount: number;
}