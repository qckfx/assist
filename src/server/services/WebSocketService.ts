import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { AgentService, AgentServiceEvent, getAgentService } from './AgentService';
import { SessionManager, sessionManager } from './SessionManager';
import { serverLogger } from '../logger';
import { ToolPreviewData, ToolPreviewState } from '../../types/preview';
import { WebSocketEvent } from '../../types/websocket';
import { 
  ToolExecutionState, 
  ToolExecutionStatus
} from '../../types/tool-execution';
import { previewService } from './preview';

/**
 * Enhanced WebSocket events for tool executions
 */
export enum EnhancedWebSocketEvent {
  TOOL_STATE_UPDATE = 'tool_state_update',
  TOOL_HISTORY = 'tool_history'
}

/**
 * Interface for tracking active tool execution
 */
interface ActiveToolExecution {
  startTime: Date;
  tool: {
    id: string;
    name: string;
    executionId?: string;
  };
  paramSummary: string;
  args?: Record<string, unknown>;
}

/**
 * Service to manage WebSocket connections and events
 */
export class WebSocketService {
  private io: SocketIOServer;
  private agentService: AgentService;
  private sessionManager: SessionManager;
  
  // Map of sessionId -> Map of toolId -> active tool execution
  private activeTools: Map<string, Map<string, ActiveToolExecution>> = new Map();
  
  // Map to store permission previews by execution ID
  private permissionPreviews: Map<string, ToolPreviewData> = new Map();

  constructor(server: HTTPServer) {
    // Set up debug mode before initializing socket.io
    if (process.env.NODE_ENV === 'development') {
      process.env.DEBUG = 'socket.io:*,engine.io:*';
    }
    
    serverLogger.info('Initializing Socket.IO server with debug enabled...');
    
    // Socket.IO configuration with fallback to polling
    this.io = new SocketIOServer(server);
    
    // Add detailed error logging
    this.io.engine.on("connection_error", (err) => {
      serverLogger.error("Socket.IO connection error:", {
        code: err.code,
        message: err.message,
        context: err.context,
        headers: err.req?.headers
      });
    });
    
    serverLogger.info('Socket.IO server instance created, configuration:', {
      cors: true,
      engine: this.io.engine ? 'Started' : 'Not started',
      httpServer: server ? 'Connected' : 'Missing'
    });
    
    // Log Socket.IO connections in development
    if (process.env.NODE_ENV === 'development') {
      serverLogger.debug('Setting up verbose Socket.IO logging for development');
    }

    this.agentService = getAgentService();
    this.sessionManager = sessionManager;

    this.setupSocketHandlers();
    this.setupAgentEventListeners();
    this.setupSessionEventForwarding();

    serverLogger.info('WebSocketService initialized');
  }

  /**
   * Create a new WebSocketService instance
   * 
   * @param server HTTP server instance
   * @returns A new WebSocketService instance
   */
  public static create(server: HTTPServer): WebSocketService {
    return new WebSocketService(server);
  }
  
  /**
   * Get pending permission requests for a session
   */
  public getPendingPermissions(sessionId: string) {
    return this.agentService.getPermissionRequests(sessionId);
  }
  
  /**
   * Get active tools for a session
   */
  public getActiveTools(sessionId: string): Array<{
    toolId: string;
    name: string;
    startTime: Date;
    paramSummary: string;
    elapsedTimeMs: number;
  }> {
    const sessionTools = this.activeTools.get(sessionId);
    if (!sessionTools) {
      return [];
    }
    
    const now = new Date();
    return Array.from(sessionTools.entries()).map(([toolId, data]) => ({
      toolId,
      name: data.tool.name,
      startTime: data.startTime,
      paramSummary: data.paramSummary,
      elapsedTimeMs: now.getTime() - data.startTime.getTime(),
    }));
  }

  /**
   * Clean up and close all socket connections
   */
  public close(): Promise<void> {
    return new Promise((resolve) => {
      // Clean up all stored previews
      this.permissionPreviews.clear();
      
      this.io.close(() => {
        serverLogger.info('WebSocketService closed');
        resolve();
      });
    });
  }
  
  /**
   * Clean up any resources associated with a session
   */
  public cleanupSession(sessionId: string): void {
    // Remove active tools for this session
    this.activeTools.delete(sessionId);
    
    // We don't need to clean up permissionPreviews here since they're
    // automatically cleaned up after being used or when a tool execution errors/aborts
    serverLogger.debug(`Cleaned up resources for session ${sessionId}`);
  }

  /**
   * Setup socket connection handling
   */
  private setupSocketHandlers(): void {
    // Log all Engine.io events for debugging
    if (this.io.engine) {
      this.io.engine.on('connection', (socket) => {
        serverLogger.info(`Socket.IO Engine - new raw connection: ${socket.id}`);
        
        // Monitor socket transport
        socket.on('transport', (transport: { name: string }) => {
          serverLogger.info(`Socket ${socket.id} transport: ${transport.name}`);
        });
        
        // Monitor upgrade attempts
        socket.on('upgrading', (transport: { name: string }) => {
          serverLogger.info(`Socket ${socket.id} upgrading to ${transport.name}`);
        });
        
        // Monitor upgrade completions
        socket.on('upgrade', (transport: { name: string }) => {
          serverLogger.info(`Socket ${socket.id} upgraded to ${transport.name}`);
        });
        
        // Monitor closing
        socket.on('close', (reason: string) => {
          serverLogger.info(`Socket.IO Engine - connection ${socket.id} closed, reason: ${reason}`);
        });
        
        // Monitor errors
        socket.on('error', (err: Error) => {
          serverLogger.error(`Socket.IO Engine - connection ${socket.id} error:`, err);
        });
      });
      
      // Monitor new incoming connections at the engine level
      this.io.engine.on('initial_headers', (headers, req) => {
        serverLogger.debug('Socket.IO initial_headers event:', { 
          url: req.url,
          method: req.method,
          headers: JSON.stringify(req.headers)
        });
      });
    } else {
      serverLogger.error('Socket.IO engine not available for monitoring!');
    }
    
    // Handle Socket.IO connections
    this.io.on(WebSocketEvent.CONNECT, (socket: Socket) => {
      serverLogger.info(`Client connected: ${socket.id} (transport: ${socket.conn.transport.name})`);
      
      // Immediately send a welcome message to confirm the connection
      socket.emit('welcome', { message: 'Connected to QCKFX WebSocket server', socketId: socket.id });
      
      // Handle connection errors
      socket.conn.on('error', (err) => {
        serverLogger.error(`Socket ${socket.id} connection error:`, err);
      });
      
      // Log all incoming events in development
      if (process.env.NODE_ENV === 'development') {
        // Instead of replacing socket.on, we'll add a listener for all events
        serverLogger.debug(`Added verbose logging for socket ${socket.id}`);
        // Listen for any event (we can't replace socket.on due to TypeScript type constraints)
        socket.onAny((event, ...args) => {
          serverLogger.debug(`Socket ${socket.id} received event '${event}' with data:`, args);
        });
      }

      // Handle join session requests
      socket.on(WebSocketEvent.JOIN_SESSION, (sessionId: string) => {
        serverLogger.debug(`Join session request: ${sessionId} from client ${socket.id}`);
        
        try {
          if (!this.sessionManager.getSession(sessionId)) {
            serverLogger.warn(`Session ${sessionId} not found for client ${socket.id}`);
            socket.emit(WebSocketEvent.ERROR, {
              message: `Session ${sessionId} not found`,
            });
            return;
          }

          // Join the session's room
          socket.join(sessionId);
          serverLogger.info(`Client ${socket.id} joined session ${sessionId}`);

          // Send current session state
          const session = this.sessionManager.getSession(sessionId);
          socket.emit(WebSocketEvent.SESSION_UPDATED, session);
          serverLogger.debug(`Sent updated session to client ${socket.id}`);
          
          // Send init event with execution environment info
          this.sendInitEvent(socket);

          // If there are pending permission requests, send them
          const pendingPermissions = this.agentService.getPermissionRequests(sessionId);
          if (pendingPermissions.length > 0) {
            serverLogger.debug(`Sending ${pendingPermissions.length} pending permissions to client ${socket.id}`);
            socket.emit(WebSocketEvent.PERMISSION_REQUESTED, {
              sessionId,
              permissions: pendingPermissions,
            });
          }
          
          // Send active tool executions, if any
          const activeTools = this.getActiveTools(sessionId);
          if (activeTools.length > 0) {
            serverLogger.debug(`Sending ${activeTools.length} active tool executions to client ${socket.id}`);
            // Send each active tool as a separate TOOL_EXECUTION_STARTED event
            activeTools.forEach(tool => {
              socket.emit(WebSocketEvent.TOOL_EXECUTION_STARTED, {
                sessionId,
                tool: {
                  id: tool.toolId,
                  name: tool.name,
                },
                paramSummary: tool.paramSummary,
                timestamp: tool.startTime.toISOString(),
                isActive: true,
                elapsedTimeMs: tool.elapsedTimeMs,
              });
            });
          }
          
          // Send list of persisted sessions
          try {
            this.agentService.listPersistedSessions().then(sessions => {
              socket.emit(WebSocketEvent.SESSION_LIST_UPDATED, { sessions });
            }).catch(error => {
              serverLogger.error('Error sending persisted sessions list:', error);
            });
          } catch (error) {
            serverLogger.error('Error sending persisted sessions list:', error);
          }
        } catch (error) {
          serverLogger.error(`Error in JOIN_SESSION handler:`, error);
          socket.emit(WebSocketEvent.ERROR, {
            message: `Error joining session: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      });

      // Handle leave session requests
      socket.on(WebSocketEvent.LEAVE_SESSION, (sessionId: string) => {
        try {
          socket.leave(sessionId);
          serverLogger.debug(`Client ${socket.id} left session ${sessionId}`);
        } catch (error) {
          serverLogger.error(`Error in LEAVE_SESSION handler:`, error);
        }
      });

      // Add a ping handler for keepalive
      socket.on('ping', (callback) => {
        if (typeof callback === 'function') {
          callback({ time: Date.now() });
        }
      });

      // Handle requests for tool execution history
      socket.on(EnhancedWebSocketEvent.TOOL_HISTORY, ({ sessionId, includeCompleted = true }) => {
        try {
          if (!sessionId) {
            socket.emit(WebSocketEvent.ERROR, {
              message: 'Session ID is required',
            });
            return;
          }
          
          // Get all tool executions for the session
          const executions = this.agentService.getToolExecutionsForSession(sessionId);
          
          // Filter based on includeCompleted flag
          const filteredExecutions = includeCompleted 
            ? executions 
            : executions.filter(e => 
                e.status === ToolExecutionStatus.RUNNING || 
                e.status === ToolExecutionStatus.AWAITING_PERMISSION);
          
          // Convert to the simplified format
          const toolState = filteredExecutions.map(execution => 
            this.convertExecutionToClientFormat(execution)
          );
          
          // Send the tool history
          socket.emit(EnhancedWebSocketEvent.TOOL_HISTORY, {
            sessionId,
            tools: toolState
          });
        } catch (error) {
          serverLogger.error('Error handling tool history request:', error);
          socket.emit(WebSocketEvent.ERROR, {
            message: `Error fetching tool history: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      });
      
      // Handle session management actions
      
      // Session save request
      socket.on('save_session', async (data, callback) => {
        try {
          const { sessionId } = data;
          await this.agentService.saveSessionState(sessionId);
          
          // Update session list
          const sessions = await this.agentService.listPersistedSessions();
          this.broadcastEvent(WebSocketEvent.SESSION_LIST_UPDATED, { sessions });
          
          if (callback) callback({ success: true });
        } catch (error) {
          if (callback) callback({ success: false, error: (error as Error).message });
        }
      });
      
      // Session delete request
      socket.on('delete_session', async (data, callback) => {
        try {
          const { sessionId } = data;
          const success = await this.agentService.deletePersistedSession(sessionId);
          
          // Update session list
          const sessions = await this.agentService.listPersistedSessions();
          this.broadcastEvent(WebSocketEvent.SESSION_LIST_UPDATED, { sessions });
          
          if (callback) callback({ success });
        } catch (error) {
          if (callback) callback({ success: false, error: (error as Error).message });
        }
      });
      
      // Session list request
      socket.on('list_sessions', async (data, callback) => {
        try {
          const sessions = await this.agentService.listPersistedSessions();
          
          if (callback) callback({ success: true, sessions });
          
          // Also broadcast to all clients
          this.broadcastEvent(WebSocketEvent.SESSION_LIST_UPDATED, { sessions });
        } catch (error) {
          if (callback) callback({ success: false, error: (error as Error).message });
        }
      });

      // Handle disconnects
      socket.on(WebSocketEvent.DISCONNECT, (reason) => {
        serverLogger.info(`Client disconnected: ${socket.id}, reason: ${reason}`);
        
        // Cleanup logic for transport close - this helps prevent lingering socket connections
        if (reason === 'transport close' || reason === 'transport error') {
          serverLogger.warn(`Transport-level disconnection for ${socket.id}, cleaning up resources`);
          
          // Ensure socket is removed from all rooms
          Object.keys(socket.rooms).forEach(room => {
            if (room !== socket.id) {
              socket.leave(room);
              serverLogger.debug(`Forced leave room ${room} for disconnected socket ${socket.id}`);
            }
          });
          
          // Force socket cleanup (disconnect will have already happened, but this handles edge cases)
          if (socket.connected) {
            serverLogger.warn(`Forcing disconnect for socket ${socket.id} that reports connected after transport close`);
            try {
              socket.disconnect(true);
            } catch (err) {
              serverLogger.error(`Error during forced disconnect: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }
      });
      
      // Add special handling for transport errors at the connection level
      socket.conn.on('packet', (packet: { type: string; data?: unknown }) => {
        if (packet.type === 'error') {
          serverLogger.error(`Transport packet error for socket ${socket.id}:`, packet.data);
        }
      });
    });
  }

  /**
   * Setup listeners for AgentService events
   */
  /**
   * Set up event forwarding for session-related events
   */
  private setupSessionEventForwarding(): void {
    // Forward session events
    this.agentService.on(AgentServiceEvent.SESSION_SAVED, (data) => {
      this.broadcastEvent(WebSocketEvent.SESSION_SAVED, data);
    });
    
    this.agentService.on(AgentServiceEvent.SESSION_LOADED, (data) => {
      this.broadcastEvent(WebSocketEvent.SESSION_LOADED, data);
    });
    
    this.agentService.on(AgentServiceEvent.SESSION_DELETED, (data) => {
      this.broadcastEvent(WebSocketEvent.SESSION_DELETED, data);
    });
  }
  
  /**
   * Broadcast an event to all connected clients
   */
  private broadcastEvent(event: WebSocketEvent, data: Record<string, unknown>): void {
    this.io.emit(event, data);
  }

  private setupAgentEventListeners(): void {
    // Processing started - only send the processing event
    this.agentService.on(AgentServiceEvent.PROCESSING_STARTED, ({ sessionId }) => {
      this.io.to(sessionId).emit(WebSocketEvent.PROCESSING_STARTED, { sessionId });
      // No need to send session update here since it doesn't contain new information yet
    });

    // Processing completed
    this.agentService.on(AgentServiceEvent.PROCESSING_COMPLETED, ({ sessionId, result }) => {
      this.io.to(sessionId).emit(WebSocketEvent.PROCESSING_COMPLETED, { 
        sessionId,
        result,
      });
      
      // Also send updated session
      const session = this.sessionManager.getSession(sessionId);
      this.io.to(sessionId).emit(WebSocketEvent.SESSION_UPDATED, session);
    });

    // Processing error
    this.agentService.on(AgentServiceEvent.PROCESSING_ERROR, ({ sessionId, error }) => {
      this.io.to(sessionId).emit(WebSocketEvent.PROCESSING_ERROR, { 
        sessionId,
        error: {
          name: error.name,
          message: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        },
      });
      // No need to send session update on error as there's no new conversation data
    });

    // Processing aborted
    this.agentService.on(AgentServiceEvent.PROCESSING_ABORTED, ({ sessionId }) => {
      this.io.to(sessionId).emit(WebSocketEvent.PROCESSING_ABORTED, { sessionId });
      // No need to send session update on abort as there's no new conversation data
    });

    // Legacy tool execution (for backward compatibility)
    this.agentService.on(AgentServiceEvent.TOOL_EXECUTION, ({ sessionId, tool, result }) => {
      this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION, { 
        sessionId,
        tool,
        result, 
      });
    });
    
    // Use the tool execution events from the ToolExecutionManager
    // The AgentService will forward these events after transforming them
    
    // Tool execution started
    this.agentService.on(AgentServiceEvent.TOOL_EXECUTION_STARTED, this.handleToolExecutionStarted.bind(this));
    
    // Tool execution updated
    this.agentService.on(AgentServiceEvent.TOOL_EXECUTION, this.handleToolExecutionUpdated.bind(this));
    
    // Tool execution completed
    this.agentService.on(AgentServiceEvent.TOOL_EXECUTION_COMPLETED, this.handleToolExecutionCompleted.bind(this));
    
    // Tool execution error
    this.agentService.on(AgentServiceEvent.TOOL_EXECUTION_ERROR, this.handleToolExecutionError.bind(this));
    
    // Tool execution aborted
    this.agentService.on(AgentServiceEvent.TOOL_EXECUTION_ABORTED, this.handleToolExecutionAborted.bind(this));
    
    // Permission requested
    this.agentService.on(AgentServiceEvent.PERMISSION_REQUESTED, this.handlePermissionRequested.bind(this));
    
    // Permission resolved
    this.agentService.on(AgentServiceEvent.PERMISSION_RESOLVED, this.handlePermissionResolved.bind(this));
    
    // Fast Edit Mode enabled
    this.agentService.on(AgentServiceEvent.FAST_EDIT_MODE_ENABLED, ({ sessionId }) => {
      this.io.to(sessionId).emit(WebSocketEvent.FAST_EDIT_MODE_ENABLED, { 
        sessionId,
        enabled: true,
      });
      
      serverLogger.debug(`Fast Edit Mode enabled for session ${sessionId}`);
    });
    
    // Fast Edit Mode disabled
    this.agentService.on(AgentServiceEvent.FAST_EDIT_MODE_DISABLED, ({ sessionId }) => {
      this.io.to(sessionId).emit(WebSocketEvent.FAST_EDIT_MODE_DISABLED, { 
        sessionId,
        enabled: false,
      });
      
      serverLogger.debug(`Fast Edit Mode disabled for session ${sessionId}`);
    });
    
    // No permission timeout handler - permission requests wait indefinitely
  }
  
  /**
   * Get a session ID from a socket instance
   */
  private getSessionIdFromSocket(socket: Socket): string | undefined {
    // Get session ID from socket room membership
    return Array.from(socket.rooms.values())
      .find(room => room !== socket.id);
  }
  
  /**
   * Send initialization event with execution environment information
   */
  private sendInitEvent(socket: Socket) {
    try {
      const sessionId = this.getSessionIdFromSocket(socket);
      if (!sessionId) {
        serverLogger.error('Cannot send init event: no session ID for socket');
        return;
      }
      
      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        serverLogger.error(`Cannot send init event: session ${sessionId} not found`);
        return;
      }
      
      // Include execution adapter type and sandbox ID in init event
      socket.emit('init', {
        sessionId,
        executionEnvironment: session.state.executionAdapterType || 'docker',
        e2bSandboxId: session.state.e2bSandboxId
      });
    } catch (error) {
      serverLogger.error(`Error sending init event: ${(error as Error).message}`, error);
    }
  }

  /**
   * Handle tool execution started event
   */
  private handleToolExecutionStarted(data: {
    sessionId: string;
    tool: { id: string; name: string; executionId: string };
    args?: Record<string, unknown>;
    paramSummary?: string;
    timestamp?: string;
  }): void {
    const { sessionId, tool, paramSummary } = data;
    
    // Get the full execution state from the tool execution manager
    const executionId = tool.executionId;
    const execution = this.agentService.getToolExecution(executionId);
    
    if (!execution) {
      serverLogger.warn(`Tool execution not found: ${executionId}`);
      // Fall back to the original event format
      this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_STARTED, data);
      return;
    }
    
    // Convert to client format
    const clientData = this.convertExecutionToClientFormat(execution);
    
    // Add tool to active tools
    if (!this.activeTools.has(sessionId)) {
      this.activeTools.set(sessionId, new Map());
    }
    
    // Track the tool in our active tools map
    this.activeTools.get(sessionId)?.set(tool.id, {
      tool,
      startTime: execution.startTime ? new Date(execution.startTime) : new Date(),
      paramSummary: paramSummary || execution.summary || 'No parameters',
      args: execution.args || {}
    });
    
    // Emit both the original event for backward compatibility
    // and the new simplified event
    const enhancedData = {
      ...data,
      isActive: true // Mark as active for UI
    };
    
    this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_STARTED, enhancedData);
    this.io.to(sessionId).emit(EnhancedWebSocketEvent.TOOL_STATE_UPDATE, {
      sessionId,
      tool: clientData
    });
  }
  
  /**
   * Handle tool execution updated event
   */
  private handleToolExecutionUpdated(data: {
    sessionId: string;
    tool: { id: string; name: string; executionId: string };
    result?: unknown;
  }): void {
    const { sessionId, tool } = data;
    
    // Get the full execution state
    const executionId = tool.executionId;
    const execution = this.agentService.getToolExecution(executionId);
    
    if (!execution) {
      serverLogger.warn(`Tool execution not found for update: ${executionId}`);
      // Fall back to the original event format
      this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION, data);
      return;
    }
    
    // Convert to client format
    const clientData = this.convertExecutionToClientFormat(execution);
    
    // Emit both formats
    this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION, data);
    this.io.to(sessionId).emit(EnhancedWebSocketEvent.TOOL_STATE_UPDATE, {
      sessionId,
      tool: clientData
    });
  }
  
  /**
   * Handle tool execution completed event
   */
  private async handleToolExecutionCompleted(data: {
    sessionId: string;
    tool: { id: string; name: string; executionId?: string };
    result?: unknown;
    paramSummary?: string;
    executionTime?: number;
    timestamp?: string;
  }): Promise<void> {
    const { sessionId, tool, result, paramSummary, executionTime, timestamp } = data;
    
    // Remove from active tools
    const sessionTools = this.activeTools.get(sessionId);
    if (sessionTools) {
      sessionTools.delete(tool.id);
      
      // If no more active tools for this session, clean up the map entry
      if (sessionTools.size === 0) {
        this.activeTools.delete(sessionId);
      }
    }
    
    // Check if we are using the new format with executionId
    if (tool.executionId) {
      const executionId = tool.executionId;
      const execution = this.agentService.getToolExecution(executionId);
      
      if (!execution) {
        serverLogger.warn(`Tool execution not found for completion: ${executionId}`);
        // Fall back to the original event format
        this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_COMPLETED, data);
        return;
      }
      
      // Convert to client format
      const clientData = this.convertExecutionToClientFormat(execution);
      
      // Emit both formats
      this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_COMPLETED, data);
      this.io.to(sessionId).emit(EnhancedWebSocketEvent.TOOL_STATE_UPDATE, {
        sessionId,
        tool: clientData
      });
    } else {
      // Use the legacy behavior for backward compatibility with tests
      // Get tool args from the stored data in AgentService
      const args = this.agentService.getToolArgs(sessionId, tool.id) || {};
      
      // Check if we have a stored preview from a permission request
      let preview: ToolPreviewData | null = null;
      
      // Fall back to generating a new preview if no permission request occurred
      try {
        // Use PreviewService to generate the preview
        const previewPromise = previewService.generatePreview(
          {
            id: tool.id,
            name: tool.name
          },
          args,
          result
        );
        
        // Wait for the promise to resolve
        preview = await previewPromise;
      } catch (error) {
        serverLogger.error(`Error generating preview for tool ${tool.id}:`, error);
      }
      
      // Forward the event to clients with preview data if available
      this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_COMPLETED, { 
        sessionId,
        tool,
        result,
        paramSummary,
        executionTime,
        timestamp,
        isActive: false,
        // Include preview data if available
        preview
      });
    }
  }
  
  /**
   * Handle tool execution error event
   */
  private handleToolExecutionError(data: {
    sessionId: string;
    tool: { id: string; name: string; executionId?: string };
    error?: { message: string; stack?: string; name?: string; };
    paramSummary?: string;
    timestamp?: string;
  }): void {
    const { sessionId, tool, error, paramSummary, timestamp } = data;
    
    // Remove from active tools
    const sessionTools = this.activeTools.get(sessionId);
    if (sessionTools) {
      sessionTools.delete(tool.id);
      
      // If no more active tools for this session, clean up the map entry
      if (sessionTools.size === 0) {
        this.activeTools.delete(sessionId);
      }
    }
    
    if (tool.executionId) {
      // Get the full execution state
      const executionId = tool.executionId;
      const execution = this.agentService.getToolExecution(executionId);
      
      if (!execution) {
        serverLogger.warn(`Tool execution not found for error: ${executionId}`);
        // Fall back to the original event format
        this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_ERROR, data);
        return;
      }
      
      // Convert to client format
      const clientData = this.convertExecutionToClientFormat(execution);
      
      // Emit both formats
      this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_ERROR, data);
      this.io.to(sessionId).emit(EnhancedWebSocketEvent.TOOL_STATE_UPDATE, {
        sessionId,
        tool: clientData
      });
    } else {
      // For backward compatibility with tests
      // Create error preview data using the PreviewService
      // Ensure error has all required properties
      const errorWithName = error ? {
        message: error.message || 'Unknown error',
        name: error.name || 'Error',
        stack: error.stack
      } : {
        message: 'Unknown error',
        name: 'Error'
      };
      
      const preview = previewService.generateErrorPreview(
        {
          id: tool.id,
          name: tool.name
        },
        errorWithName,
        { paramSummary }
      );
      
      // Forward the event to clients
      this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_ERROR, { 
        sessionId,
        tool,
        error,
        paramSummary,
        timestamp,
        isActive: false,
        preview
      });
    }
  }
  
  /**
   * Handle tool execution aborted event
   */
  private handleToolExecutionAborted(data: {
    sessionId: string;
    tool: { id: string; name: string; executionId?: string };
    timestamp?: string;
    abortTimestamp?: string;
  }): void {
    const { sessionId, tool, timestamp, abortTimestamp } = data;
    
    if (tool.executionId) {
      // Get the full execution state
      const executionId = tool.executionId;
      const execution = this.agentService.getToolExecution(executionId);
      
      if (!execution) {
        serverLogger.warn(`Tool execution not found for abort: ${executionId}`);
        // Fall back to the original event format
        this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_ABORTED, data);
        return;
      }
      
      // Convert to client format
      const clientData = this.convertExecutionToClientFormat(execution);
      
      // Emit both formats
      this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_ABORTED, data);
      this.io.to(sessionId).emit(EnhancedWebSocketEvent.TOOL_STATE_UPDATE, {
        sessionId,
        tool: clientData
      });
    } else {
      // For backward compatibility with tests
      // Forward the event to clients
      this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_ABORTED, { 
        sessionId,
        tool,
        timestamp,
        abortTimestamp,
        isActive: false
      });
    }
  }
  
  /**
   * Handle permission requested event
   */
  private handlePermissionRequested(data: {
    sessionId: string;
    permissionId: string;
    toolId: string;
    toolName?: string;
    executionId?: string;
    args?: Record<string, unknown>;
    timestamp?: string;
  }): void {
    const { sessionId, permissionId, toolId, toolName, executionId, args, timestamp } = data;
    
    if (executionId) {
      // Get the full execution state
      const execution = this.agentService.getToolExecution(executionId);
      
      if (!execution) {
        serverLogger.warn(`Tool execution not found for permission request: ${executionId}`);
        // Fall back to the original event format
        this.io.to(sessionId).emit(WebSocketEvent.PERMISSION_REQUESTED, {
          sessionId,
          permission: data
        });
        return;
      }
      
      // Convert to client format
      const clientData = this.convertExecutionToClientFormat(execution);
      
      // Emit both formats
      this.io.to(sessionId).emit(WebSocketEvent.PERMISSION_REQUESTED, {
        sessionId,
        permission: data
      });
      this.io.to(sessionId).emit(EnhancedWebSocketEvent.TOOL_STATE_UPDATE, {
        sessionId,
        tool: clientData
      });
    } else {
      // For backward compatibility with tests
      // Generate a preview for the permission request
      const preview = previewService.generatePermissionPreview(
        {
          id: toolId,
          name: toolName || toolId
        },
        args || {}
      );
      
      // Format the permission object according to the expected UI format
      this.io.to(sessionId).emit(WebSocketEvent.PERMISSION_REQUESTED, { 
        sessionId,
        permission: {
          id: permissionId,
          toolId: toolId,
          toolName: toolName || toolId,
          args: args,
          timestamp: timestamp,
          preview
        },
      });
    }
  }
  
  /**
   * Handle permission resolved event
   */
  private handlePermissionResolved(data: {
    sessionId: string;
    permissionId: string;
    toolId: string;
    executionId?: string;
    granted: boolean;
    timestamp?: string;
  }): void {
    const { sessionId, permissionId, executionId, granted } = data;
    
    if (executionId) {
      // Get the full execution state
      const execution = this.agentService.getToolExecution(executionId);
      
      if (!execution) {
        serverLogger.warn(`Tool execution not found for permission resolution: ${executionId}`);
        // Fall back to the original event format
        this.io.to(sessionId).emit(WebSocketEvent.PERMISSION_RESOLVED, {
          sessionId,
          permissionId,
          resolution: granted
        });
        return;
      }
      
      // Convert to client format
      const clientData = this.convertExecutionToClientFormat(execution);
      
      // Emit both formats
      this.io.to(sessionId).emit(WebSocketEvent.PERMISSION_RESOLVED, {
        sessionId,
        permissionId,
        resolution: granted
      });
      this.io.to(sessionId).emit(EnhancedWebSocketEvent.TOOL_STATE_UPDATE, {
        sessionId,
        tool: clientData
      });
    } else {
      // For backward compatibility with tests
      // Map AgentService's "granted" property to WebSocketEvent's "resolution" property
      this.io.to(sessionId).emit(WebSocketEvent.PERMISSION_RESOLVED, { 
        sessionId,
        permissionId,
        resolution: granted
      });
    }
  }
  
  /**
   * Convert a tool execution state to the format expected by clients
   */
  private convertExecutionToClientFormat(execution: ToolExecutionState): Record<string, unknown> {
    // Map ToolExecutionStatus to client status string
    const statusMap: Record<ToolExecutionStatus, string> = {
      [ToolExecutionStatus.PENDING]: 'pending',
      [ToolExecutionStatus.RUNNING]: 'running',
      [ToolExecutionStatus.AWAITING_PERMISSION]: 'awaiting-permission',
      [ToolExecutionStatus.COMPLETED]: 'completed',
      [ToolExecutionStatus.ERROR]: 'error',
      [ToolExecutionStatus.ABORTED]: 'aborted'
    };
    
    // Build the client data object
    const clientData: Record<string, unknown> = {
      id: execution.id,
      tool: execution.toolId,
      toolName: execution.toolName,
      status: statusMap[execution.status],
      args: execution.args,
      startTime: new Date(execution.startTime).getTime(),
      paramSummary: execution.summary
    };
    
    // Add optional fields if present
    if (execution.result !== undefined) {
      clientData.result = execution.result;
    }
    
    if (execution.error) {
      clientData.error = execution.error;
    }
    
    if (execution.endTime) {
      clientData.endTime = new Date(execution.endTime).getTime();
    }
    
    if (execution.executionTime) {
      clientData.executionTime = execution.executionTime;
    }
    
    if (execution.permissionId) {
      clientData.permissionId = execution.permissionId;
    }
    
    // Add preview if available
    if (execution.previewId) {
      try {
        // Here we'd need access to the PreviewManager which might be better
        // passed as a dependency. For simplicity in this example, we're using
        // the AgentService as a proxy.
        const preview = this.getPreviewForExecution(execution.id);
        if (preview) {
          clientData.preview = this.convertPreviewToClientFormat(preview);
        }
      } catch (error) {
        serverLogger.error(`Error getting preview for execution ${execution.id}:`, error);
      }
    }
    
    return clientData;
  }
  
  /**
   * Convert a preview state to the format expected by clients
   */
  private convertPreviewToClientFormat(preview: ToolPreviewState): Record<string, unknown> {
    return {
      contentType: preview.contentType,
      briefContent: preview.briefContent,
      fullContent: preview.fullContent,
      metadata: preview.metadata
    };
  }
  
  /**
   * Get a preview for an execution
   * This is a temporary method until we have proper DI for the PreviewManager
   */
  private getPreviewForExecution(_executionId: string): ToolPreviewState | null {
    // This would be replaced with a direct call to the PreviewManager
    // For now, we'd need to extend the AgentService to expose this method
    return null;
  }
}