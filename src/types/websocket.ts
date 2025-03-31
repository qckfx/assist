/**
 * Types for WebSocket communication
 */

/**
 * Event types for WebSocket communication
 */
export enum WebSocketEvent {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  ERROR = 'error',
  JOIN_SESSION = 'join_session',
  LEAVE_SESSION = 'leave_session',
  PROCESSING_STARTED = 'processing_started',
  PROCESSING_COMPLETED = 'processing_completed',
  PROCESSING_ERROR = 'processing_error',
  PROCESSING_ABORTED = 'processing_aborted',
  TOOL_EXECUTION = 'tool_execution',
  TOOL_EXECUTION_BATCH = 'tool_execution_batch',
  TOOL_EXECUTION_STARTED = 'tool_execution_started',
  TOOL_EXECUTION_COMPLETED = 'tool_execution_completed',
  TOOL_EXECUTION_ERROR = 'tool_execution_error',
  TOOL_EXECUTION_ABORTED = 'tool_execution_aborted',
  PERMISSION_REQUESTED = 'permission_requested',
  PERMISSION_RESOLVED = 'permission_resolved',
  PERMISSION_TIMEOUT = 'permission_timeout',
  SESSION_UPDATED = 'session_updated',
  STREAM_CONTENT = 'stream_content',
  FAST_EDIT_MODE_ENABLED = 'fast_edit_mode_enabled',
  FAST_EDIT_MODE_DISABLED = 'fast_edit_mode_disabled',
}