// Basic API response and request types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
}

export interface SessionStartRequest {
  modelOptions?: {
    model?: string;
    temperature?: number;
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
    citations?: any[] | null;
  }>;
}

export interface SessionData {
  id: string;
  startTime: string;
  status: 'idle' | 'thinking' | 'error';
  history: SessionHistoryEntry[];
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
  id: string;
  granted: boolean;
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
  PERMISSION_REQUESTED = 'permission_requested',
  PERMISSION_RESOLVED = 'permission_resolved',
  SESSION_UPDATED = 'session_updated',
  STREAM_CONTENT = 'stream_content',
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
  [WebSocketEvent.PROCESSING_COMPLETED]: { sessionId: string; result: any; };
  [WebSocketEvent.PROCESSING_ERROR]: { sessionId: string; error: { name: string; message: string; stack?: string; }; };
  [WebSocketEvent.PROCESSING_ABORTED]: { sessionId: string; };
  [WebSocketEvent.TOOL_EXECUTION]: { sessionId: string; tool: any; result: any; };
  [WebSocketEvent.TOOL_EXECUTION_BATCH]: { 
    toolId: string; 
    results: Array<{ sessionId: string; tool: any; result: any; }>;
    isBatched: boolean;
    batchSize: number;
  };
  [WebSocketEvent.PERMISSION_REQUESTED]: { sessionId: string; permission: any; };
  [WebSocketEvent.PERMISSION_RESOLVED]: { sessionId: string; permissionId: string; resolution: boolean; };
  [WebSocketEvent.SESSION_UPDATED]: SessionData;
  [WebSocketEvent.STREAM_CONTENT]: { sessionId: string; content: string; };
}