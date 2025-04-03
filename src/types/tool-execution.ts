/**
 * Represents the status of a tool execution
 */
export enum ToolExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  AWAITING_PERMISSION = 'awaiting-permission',
  COMPLETED = 'completed',
  ERROR = 'error',
  ABORTED = 'aborted'
}

/**
 * Interface for storing tool execution state
 */
export interface ToolExecutionState {
  /**
   * Unique ID for this tool execution
   */
  id: string;
  
  /**
   * Session ID this execution belongs to
   */
  sessionId: string;
  
  /**
   * The tool ID (type of tool being executed)
   */
  toolId: string;
  
  /**
   * Human-readable name of the tool
   */
  toolName: string;
  
  /**
   * Current status of the execution
   */
  status: ToolExecutionStatus;
  
  /**
   * Arguments passed to the tool
   */
  args: Record<string, unknown>;
  
  /**
   * Result of the tool execution (if completed)
   */
  result?: unknown;
  
  /**
   * ID of the associated tool_use block from the model's response
   */
  toolUseId?: string;
  
  /**
   * Error details if the tool execution failed
   */
  error?: {
    message: string;
    stack?: string;
  };
  
  /**
   * Brief summary of the tool execution (for display)
   */
  summary?: string;
  
  /**
   * The ISO timestamp when the tool execution started
   */
  startTime: string;
  
  /**
   * The ISO timestamp when the tool execution completed (or errored/aborted)
   */
  endTime?: string;
  
  /**
   * Execution time in milliseconds
   */
  executionTime?: number;
  
  /**
   * ID of the associated permission request (if any)
   */
  permissionId?: string;
  
  /**
   * Whether permission was granted (if applicable)
   */
  permissionGranted?: boolean;
  
  /**
   * ID of the associated preview (if any)
   */
  previewId?: string;
  
  /**
   * Any additional metadata for the execution
   */
  metadata?: Record<string, unknown>;
}

/**
 * Interface for permission request state
 */
export interface PermissionRequestState {
  /**
   * Unique ID for this permission request
   */
  id: string;
  
  /**
   * Session ID this permission request belongs to
   */
  sessionId: string;
  
  /**
   * The tool ID that requires permission
   */
  toolId: string;
  
  /**
   * Human-readable name of the tool
   */
  toolName: string;
  
  /**
   * Arguments passed to the tool
   */
  args: Record<string, unknown>;
  
  /**
   * The ISO timestamp when the permission was requested
   */
  requestTime: string;
  
  /**
   * The ISO timestamp when the permission was resolved (if applicable)
   */
  resolvedTime?: string;
  
  /**
   * Whether permission was granted or denied (if resolved)
   */
  granted?: boolean;
  
  /**
   * ID of the associated tool execution
   */
  executionId: string;
  
  /**
   * ID of the associated preview (if any)
   */
  previewId?: string;
  
  /**
   * Any additional metadata for the permission request
   */
  metadata?: Record<string, unknown>;
}

/**
 * Interface for tool preview state
 */
export interface ToolPreviewState {
  /**
   * Unique ID for this preview
   */
  id: string;
  
  /**
   * Session ID this preview belongs to
   */
  sessionId: string;
  
  /**
   * ID of the associated tool execution
   */
  executionId: string;
  
  /**
   * ID of the associated permission request (if applicable)
   */
  permissionId?: string;
  
  /**
   * Type of preview content
   */
  contentType: string;
  
  /**
   * Brief content for summarized view
   */
  briefContent: string;
  
  /**
   * Full content for expanded view
   */
  fullContent?: string;
  
  /**
   * Any additional metadata for the preview
   */
  metadata?: Record<string, unknown>;
}

/**
 * Events emitted by the ToolExecutionManager
 */
export enum ToolExecutionEvent {
  CREATED = 'tool_execution:created',
  UPDATED = 'tool_execution:updated',
  COMPLETED = 'tool_execution:completed',
  ERROR = 'tool_execution:error',
  ABORTED = 'tool_execution:aborted',
  PREVIEW_GENERATED = 'tool_execution:preview_generated',
  PERMISSION_REQUESTED = 'tool_execution:permission_requested',
  PERMISSION_RESOLVED = 'tool_execution:permission_resolved'
}

/**
 * Interface for tool execution manager
 */
export interface ToolExecutionManager {
  /**
   * Create a new tool execution
   */
  createExecution(sessionId: string, toolId: string, toolName: string, args: Record<string, unknown>): ToolExecutionState;
  
  /**
   * Update an existing tool execution
   */
  updateExecution(executionId: string, updates: Partial<ToolExecutionState>): ToolExecutionState;
  
  /**
   * Complete a tool execution with results
   */
  completeExecution(executionId: string, result: unknown, executionTime: number): ToolExecutionState;
  
  /**
   * Mark a tool execution as failed
   */
  failExecution(executionId: string, error: Error): ToolExecutionState;
  
  /**
   * Abort a tool execution
   */
  abortExecution(executionId: string): ToolExecutionState;
  
  /**
   * Create a permission request for a tool execution
   */
  requestPermission(executionId: string, args: Record<string, unknown>): PermissionRequestState;
  
  /**
   * Resolve a permission request
   */
  resolvePermission(permissionId: string, granted: boolean): PermissionRequestState;
  
  /**
   * Get a tool execution by ID
   */
  getExecution(executionId: string): ToolExecutionState | undefined;
  
  /**
   * Get all tool executions for a session
   */
  getExecutionsForSession(sessionId: string): ToolExecutionState[];
  
  /**
   * Get a permission request by ID
   */
  getPermissionRequest(permissionId: string): PermissionRequestState | undefined;
  
  /**
   * Get all permission requests for a session
   */
  getPermissionRequestsForSession(sessionId: string): PermissionRequestState[];
  
  /**
   * Register a listener for tool execution events
   */
  on(event: ToolExecutionEvent, listener: (data: unknown) => void): () => void;
}