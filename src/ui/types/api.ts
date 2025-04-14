// Basic API response and request types
import { ToolPreviewData } from '../../types/preview';
import { TimelineItem } from '../../types/timeline';
import { StructuredContent } from '../../types/message';

/**
 * Environment status enum for connection and initialization status
 */
export enum EnvironmentChange {
  INITIALIZING = 'initializing',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  ERROR = 'error'
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
}

export interface SessionStartRequest {
  sessionId?: string;  // Optional session ID for reconnecting to existing sessions
  modelOptions?: {
    model?: string;
    temperature?: number;
  };
  config?: {
    executionAdapterType?: 'docker' | 'local' | 'e2b';
    e2bSandboxId?: string;
  };
}

export interface QueryRequest {
  query: string;
}

export interface SessionHistoryEntry {
  role: 'user' | 'assistant';
  content: Array<{
    type: 'text';
    text: string;
    citations?: Array<Record<string, unknown>> | null;
  }>;
}

// Import the SessionState type from model.ts
import { SessionState } from '../../types/model';

export interface SessionData {
  id: string;
  startTime?: string;
  createdAt?: string;
  lastActiveAt?: string;
  status?: 'idle' | 'thinking' | 'error';
  state?: SessionState;
  isProcessing?: boolean;
  history?: SessionHistoryEntry[];
}

export interface AgentStatus {
  sessionId: string;
  status: 'idle' | 'thinking' | 'error';
  lastActivityTime: string;
}

export interface PermissionRequest {
  id: string;
  toolId: string;
  args: Record<string, unknown>;
  timestamp: string;
}

export interface PermissionResolveRequest {
  sessionId: string;
  executionId: string;  // Changed from permissionId to executionId
  granted: boolean;
}

/**
 * Tool interface for WebSocket events
 */
export interface Tool {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  paramSummary?: string;
  timestamp?: string;
  isActive?: boolean;
  startTime?: string;
  endTime?: string;
  executionTime?: number;
}

/**
 * WebSocket event types that match server-side events
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
  TOOL_EXECUTION_ABORTED = 'tool_execution_aborted', // New event type for aborted tools
  PERMISSION_REQUESTED = 'permission_requested',
  PERMISSION_RESOLVED = 'permission_resolved',
  SESSION_UPDATED = 'session_updated',
  STREAM_CONTENT = 'stream_content',
  
  // Fast Edit Mode events
  FAST_EDIT_MODE_ENABLED = 'fast_edit_mode_enabled',
  FAST_EDIT_MODE_DISABLED = 'fast_edit_mode_disabled',
  
  // Environment information events
  INIT = 'init',
  ENVIRONMENT_STATUS_CHANGED = 'environment_status_changed',
  
  // Timeline events
  TIMELINE_UPDATE = 'timeline_update',
  TIMELINE_HISTORY = 'timeline_history',
  
  // Message events (new)
  MESSAGE_RECEIVED = 'message_received',
  MESSAGE_UPDATED = 'message_updated',
  
  // Tool timeline events (new)
  TOOL_EXECUTION_RECEIVED = 'tool_execution_received',
  TOOL_EXECUTION_UPDATED = 'tool_execution_updated',
  
  // Session management events
  SESSION_LOADED = 'session_loaded',
  SESSION_SAVED = 'session_saved',
  SESSION_DELETED = 'session_deleted',
  SESSION_LIST_UPDATED = 'session_list_updated',
}

/**
 * WebSocket connection status
 */
export enum ConnectionStatus {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

/**
 * WebSocket event data types
 */
export interface WebSocketEventMap {
  [WebSocketEvent.CONNECT]: void;
  [WebSocketEvent.DISCONNECT]: void;
  [WebSocketEvent.ERROR]: { message: string; };
  [WebSocketEvent.JOIN_SESSION]: string;
  [WebSocketEvent.LEAVE_SESSION]: string;
  [WebSocketEvent.PROCESSING_STARTED]: { sessionId: string; };
  [WebSocketEvent.PROCESSING_COMPLETED]: { sessionId: string; result: unknown; };
  [WebSocketEvent.PROCESSING_ERROR]: { sessionId: string; error: { name: string; message: string; stack?: string; }; };
  [WebSocketEvent.PROCESSING_ABORTED]: { sessionId: string; };
  [WebSocketEvent.TOOL_EXECUTION]: { sessionId: string; tool: Tool; result: unknown; };
  [WebSocketEvent.TOOL_EXECUTION_BATCH]: { 
    toolId: string; 
    results: Array<{ sessionId: string; tool: Tool; result: unknown; }>;
    isBatched: boolean;
    batchSize: number;
  };
  [WebSocketEvent.TOOL_EXECUTION_STARTED]: { 
    sessionId: string;
    tool: {
      id: string;
      name: string;
    };
    args?: Record<string, unknown>;
    paramSummary: string;
    timestamp: string;
    isActive: boolean;
    elapsedTimeMs?: number;
  };
  [WebSocketEvent.TOOL_EXECUTION_COMPLETED]: { 
    sessionId: string;
    tool: {
      id: string;
      name: string;
    };
    result: unknown;
    paramSummary: string;
    executionTime: number;
    timestamp: string;
    isActive: false;
    startTime?: string;
    // Include preview data
    preview?: ToolPreviewData;
  };
  [WebSocketEvent.TOOL_EXECUTION_ERROR]: { 
    sessionId: string;
    tool: {
      id: string;
      name: string;
    };
    error: {
      message: string;
      stack?: string;
    };
    paramSummary: string;
    timestamp: string;
    isActive: false;
    startTime?: string;
    // Include preview data for errors
    preview?: ToolPreviewData;
  };
  [WebSocketEvent.TOOL_EXECUTION_ABORTED]: {
    sessionId: string;
    tool: {
      id: string;
      name: string;
    };
    timestamp: string;
    abortTimestamp: number;
    isActive: false;
    startTime?: string;
  };
  [WebSocketEvent.PERMISSION_REQUESTED]: { 
    sessionId: string; 
    permission: { 
      id: string; 
      toolId: string; 
      toolName?: string;
      args: Record<string, unknown>;
      timestamp: string;
      preview?: ToolPreviewData;
      executionId?: string;
    };
  };
  [WebSocketEvent.PERMISSION_RESOLVED]: { sessionId: string; executionId: string; resolution: boolean; };
  [WebSocketEvent.SESSION_UPDATED]: SessionData;
  [WebSocketEvent.STREAM_CONTENT]: { sessionId: string; content: string; };
  [WebSocketEvent.FAST_EDIT_MODE_ENABLED]: { sessionId: string; enabled: true; };
  [WebSocketEvent.FAST_EDIT_MODE_DISABLED]: { sessionId: string; enabled: false; };
  [WebSocketEvent.INIT]: { 
    sessionId: string; 
    executionEnvironment: 'local' | 'docker' | 'e2b'; 
    e2bSandboxId?: string; 
  };
  
  [WebSocketEvent.ENVIRONMENT_STATUS_CHANGED]: {
    environmentType: 'local' | 'docker' | 'e2b';
    status: string;
    isReady: boolean;
    error?: string;
  };
  
  
  // Timeline events
  [WebSocketEvent.TIMELINE_UPDATE]: {
    sessionId: string;
    item: TimelineItem;
  };
  
  [WebSocketEvent.TIMELINE_HISTORY]: {
    sessionId: string;
    items: TimelineItem[];
    nextPageToken?: string;
    totalCount: number;
  };
  
  // Message events (new)
  [WebSocketEvent.MESSAGE_RECEIVED]: {
    sessionId: string;
    message: {
      id: string;
      role: 'user' | 'assistant' | 'system';
      content: StructuredContent;
      timestamp: string;
    };
  };
  
  [WebSocketEvent.MESSAGE_UPDATED]: {
    sessionId: string;
    messageId: string;
    content: StructuredContent;
    isComplete: boolean;
  };
  
  // Tool execution events (new)
  [WebSocketEvent.TOOL_EXECUTION_RECEIVED]: {
    sessionId: string;
    toolExecution: {
      id: string;
      toolId: string;
      toolName: string;
      status: string;
      args: Record<string, unknown>;
      startTime: string;
      endTime?: string;
      executionTime?: number;
      result?: unknown;
      error?: { message: string; stack?: string; };
    };
  };
  
  [WebSocketEvent.TOOL_EXECUTION_UPDATED]: {
    sessionId: string;
    toolExecution: {
      id: string;
      toolId: string;
      toolName: string;
      status: string;
      args?: Record<string, unknown>;
      startTime: string;
      endTime?: string;
      executionTime?: number;
      result?: unknown;
      error?: { message: string; stack?: string; };
      // The preview is part of the toolExecution object
      preview?: ToolPreviewData;
      // Additional fields to help client detection
      hasPreview?: boolean;
      previewContentType?: string;
    };
  };
  
  // Session management events
  [WebSocketEvent.SESSION_LOADED]: { 
    sessionId: string;
    timestamp: string;
  };
  
  [WebSocketEvent.SESSION_SAVED]: {
    sessionId: string;
    timestamp: string;
  };
  
  [WebSocketEvent.SESSION_DELETED]: {
    sessionId: string;
    timestamp: string;
  };
  
  [WebSocketEvent.SESSION_LIST_UPDATED]: {
    sessions: Array<{
      id: string;
      createdAt: string;
      lastActiveAt: string;
      messageCount: number;
      toolCount: number;
      initialQuery?: string;
      lastMessage?: {
        role: 'user' | 'assistant';
        content: string;
        timestamp: string;
      };
      repositoryInfo?: {
        repoName: string;
        commitHash: string;
        branch: string;
        remoteUrl?: string;
        isDirty?: boolean;
        workingDirectory?: string;
      };
    }>;
  };
}