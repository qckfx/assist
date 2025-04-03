import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { AgentService, AgentServiceEvent, getAgentService } from './AgentService';
import { SessionManager, sessionManager } from './SessionManager';
import { serverLogger } from '../logger';
import { 
  ToolPreviewData, 
  ToolPreviewState,
  PreviewContentType,
  TextPreviewData,
  CodePreviewData,
  DiffPreviewData
} from '../../types/preview';
import { WebSocketEvent } from '../../types/websocket';
import { 
  ToolExecutionState, 
  ToolExecutionStatus
} from '../../types/tool-execution';
import { previewService } from './preview';


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

    // Modern tool execution events are handled below
    
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
    
    // Message event handlers
    this.agentService.on(AgentServiceEvent.MESSAGE_RECEIVED, (data) => {
      const { sessionId, message } = data;
      this.io.to(sessionId).emit(WebSocketEvent.MESSAGE_RECEIVED, {
        sessionId,
        message
      });
      serverLogger.debug(`Message received event emitted for session ${sessionId}`);
    });
    
    this.agentService.on(AgentServiceEvent.MESSAGE_UPDATED, (data) => {
      const { sessionId, messageId, content, isComplete } = data;
      this.io.to(sessionId).emit(WebSocketEvent.MESSAGE_UPDATED, {
        sessionId,
        messageId,
        content,
        isComplete
      });
      serverLogger.debug(`Message updated event emitted for session ${sessionId}`);
    });
    
    // Timeline item events
    this.agentService.on(AgentServiceEvent.TIMELINE_ITEM_UPDATED, async (data) => {
      const { sessionId, item, isUpdate } = data;
      // Emit the appropriate event based on the timeline item type
      if (item.type === 'message') {
        if (isUpdate) {
          this.io.to(sessionId).emit(WebSocketEvent.MESSAGE_UPDATED, {
            sessionId,
            messageId: item.id,
            content: item.message.content,
            isComplete: true
          });
        } else {
          this.io.to(sessionId).emit(WebSocketEvent.MESSAGE_RECEIVED, {
            sessionId,
            message: item.message
          });
        }
      } else if (item.type === 'tool_execution') {
        try {
          if (isUpdate) {
            // For updates, include important flags for preview data
            // First, check if we have preview data in the timeline item
            const hasPreviewInItem = !!item.preview;
            
            // Log details about the preview in the timeline item
            if (hasPreviewInItem) {
              serverLogger.info(`Timeline item update has preview for execution ${item.id}:`, {
                contentType: item.preview?.contentType,
                briefContentLength: item.preview?.briefContent?.length,
                fullContentLength: item.preview?.fullContent?.length,
                metadataKeys: item.preview?.metadata ? Object.keys(item.preview.metadata) : []
              });
            } else {
              serverLogger.debug(`Timeline item update has no preview for execution ${item.id}`);
            }
            
            // If this is a completed tool execution and we don't have content, try to get it
            if (item.toolExecution.status === 'completed') {
              const executionId = item.id;
              
              // Try to get the execution from agent service
              const execution = this.agentService.getToolExecution(executionId);
              
              if (execution && execution.result) {
                // Get or generate the preview - using the async method
                serverLogger.debug(`Attempting to get/generate preview for completed timeline item: ${executionId}`);
                const preview = await this.getPreviewForExecution(executionId);
                
                if (preview) {
                  // Convert to client format
                  const formattedPreview = this.convertPreviewToClientFormat(preview);
                  
                  if (formattedPreview) {
                    serverLogger.info(`Enhanced timeline preview for ${executionId}:`, {
                      contentType: preview.contentType,
                      briefContentLength: preview.briefContent?.length,
                      fullContentLength: preview.fullContent?.length
                    });
                    
                    // Send enhanced update with the properly generated preview
                    this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_UPDATED, {
                      sessionId,
                      toolExecution: {
                        id: item.id,
                        toolId: item.toolExecution.toolId,
                        toolName: item.toolExecution.toolName,
                        status: item.toolExecution.status,
                        args: item.toolExecution.args,
                        startTime: item.toolExecution.startTime,
                        endTime: item.toolExecution.endTime,
                        executionTime: item.toolExecution.executionTime,
                        result: item.toolExecution.result,
                        error: item.toolExecution.error,
                        // Include the enhanced preview
                        preview: formattedPreview,
                        hasPreview: true,
                        previewContentType: preview.contentType,
                        previewBriefContentLength: preview.briefContent?.length,
                        previewFullContentLength: preview.fullContent?.length,
                        previewMetadataKeys: preview.metadata ? Object.keys(preview.metadata) : []
                      }
                    });
                    
                    // We've sent the enhanced update, so return to avoid sending duplicate events
                    return;
                  }
                }
              }
            }
            
            // If we couldn't enhance the preview or it's not a completed tool, send with original preview
            this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_UPDATED, {
              sessionId,
              toolExecution: {
                id: item.id,
                toolId: item.toolExecution.toolId,
                toolName: item.toolExecution.toolName,
                status: item.toolExecution.status,
                args: item.toolExecution.args,
                startTime: item.toolExecution.startTime,
                endTime: item.toolExecution.endTime,
                executionTime: item.toolExecution.executionTime,
                result: item.toolExecution.result,
                error: item.toolExecution.error,
                // Include both the preview object and the hasPreview flag
                preview: item.preview,
                hasPreview: hasPreviewInItem,
                previewContentType: item.preview?.contentType,
                previewBriefContentLength: item.preview?.briefContent?.length,
                previewFullContentLength: item.preview?.fullContent?.length,
                previewMetadataKeys: item.preview?.metadata ? Object.keys(item.preview.metadata) : []
              }
            });
          } else {
            // For new items, also include preview information
            const hasPreview = !!item.preview;
            
            // Include preview information in the received event
            const toolExecution = {
              ...item.toolExecution,
              preview: item.preview,
              hasPreview: hasPreview,
              previewContentType: item.preview?.contentType
            };
            
            this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_RECEIVED, {
              sessionId,
              toolExecution
            });
          }
        } catch (error) {
          serverLogger.error(`Error handling timeline tool execution update for ${item.id}:`, error);
          // Send basic update without enhanced preview
          if (isUpdate) {
            this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_UPDATED, {
              sessionId,
              toolExecution: {
                id: item.id,
                toolId: item.toolExecution.toolId,
                toolName: item.toolExecution.toolName,
                status: item.toolExecution.status,
                args: item.toolExecution.args,
                startTime: item.toolExecution.startTime,
                endTime: item.toolExecution.endTime,
                executionTime: item.toolExecution.executionTime,
                result: item.toolExecution.result,
                error: item.toolExecution.error,
                preview: item.preview,
                hasPreview: !!item.preview
              }
            });
          } else {
            this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_RECEIVED, {
              sessionId,
              toolExecution: item.toolExecution
            });
          }
        }
      }
      
      serverLogger.debug(`Timeline item ${isUpdate ? 'updated' : 'received'} for session ${sessionId}, type: ${item.type}`);
    });
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
    
    // Convert to client format - using Promise.resolve to handle async/non-async implementation
    Promise.resolve(this.convertExecutionToClientFormat(execution))
      .then(clientData => {
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
        
        // Add debug logging to see if we have a preview at start time
        serverLogger.info(`Tool execution started with preview info for ${executionId}:`, {
          toolId: execution.toolId,
          toolName: execution.toolName,
          hasPreview: clientData && typeof clientData === 'object' ? !!clientData.hasPreview : false,
          previewContentType: clientData && typeof clientData === 'object' ? clientData.previewContentType : undefined,
          previewBriefContentLength: clientData && typeof clientData === 'object' && clientData.preview ? 
            (clientData.preview as any).briefContent?.length : undefined,
          previewFullContentLength: clientData && typeof clientData === 'object' && clientData.preview ? 
            (clientData.preview as any).fullContent?.length : undefined
        });
        
        // Emit both the original event for backward compatibility
        // and the new simplified event with the client data
        const enhancedData = {
          ...data,
          isActive: true, // Mark as active for UI
          // Include preview flags in the enhanced data for backward compatibility
          hasPreview: clientData && typeof clientData === 'object' ? !!clientData.hasPreview : false,
          previewContentType: clientData && typeof clientData === 'object' ? clientData.previewContentType : undefined
        };
        
        this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_STARTED, enhancedData);
      })
      .catch(error => {
        serverLogger.error(`Error processing tool execution start for ${executionId}:`, error);
        // In case of error, emit basic data without preview
        this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_STARTED, data);
      });
    // The emit is now handled inside the Promise callback above
  }
  
  /**
   * Handle tool execution updated event
   */
  private async handleToolExecutionUpdated(data: {
    sessionId: string;
    tool: { id: string; name: string; executionId: string };
    result?: unknown;
  }): Promise<void> {
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
    
    try {
      // Convert to client format - using await to handle async preview generation
      serverLogger.debug(`Converting execution to client format with awaitable preview generation: ${executionId}`);
      const clientData = await this.convertExecutionToClientFormat(execution);
      
      // Add debug logging to see the preview state in the client data
      serverLogger.info(`Tool execution updated with preview info for ${executionId}:`, {
        toolId: execution.toolId,
        toolName: execution.toolName,
        hasPreview: clientData && typeof clientData === 'object' ? !!clientData.hasPreview : false,
        previewContentType: clientData && typeof clientData === 'object' ? clientData.previewContentType : undefined,
        previewBriefContentLength: clientData && typeof clientData === 'object' && clientData.preview ? 
          (clientData.preview as any).briefContent?.length : undefined,
        previewFullContentLength: clientData && typeof clientData === 'object' && clientData.preview ? 
          (clientData.preview as any).fullContent?.length : undefined
      });
      
      // Only emit the WebSocket events once we have the complete data with preview
      this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION, data);
      
      // If we have a preview, also send a separate update to ensure clients catch it
      if (clientData && typeof clientData === 'object' && clientData.hasPreview) {
        serverLogger.info(`Sending dedicated preview update for ${executionId}`);
        this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_UPDATED, {
          sessionId,
          toolExecution: clientData
        });
      }
    } catch (error) {
      serverLogger.error(`Error handling tool execution update for ${executionId}:`, error);
      // Emit minimal data in case of error
      this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION, data);
    }
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
      
      try {
        // Convert to client format - use await to properly handle async preview generation
        serverLogger.debug(`Converting completed execution to client format with awaitable preview: ${executionId}`);
        const clientData = await this.convertExecutionToClientFormat(execution);
        
        // Add debug logging to see the preview state in the client data
        serverLogger.info(`Tool execution completed with preview info for ${executionId}:`, {
          toolId: execution.toolId,
          toolName: execution.toolName,
          hasPreview: clientData && typeof clientData === 'object' ? !!clientData.hasPreview : false,
          previewContentType: clientData && typeof clientData === 'object' ? clientData.previewContentType : undefined,
          previewBriefContentLength: clientData && typeof clientData === 'object' && clientData.preview ? 
            (clientData.preview as any).briefContent?.length : undefined,
          previewFullContentLength: clientData && typeof clientData === 'object' && clientData.preview ? 
            (clientData.preview as any).fullContent?.length : undefined
        });
        
        // Emit completion event with proper preview data
        this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_COMPLETED, {
          ...data,
          preview: clientData && typeof clientData === 'object' ? clientData.preview : undefined,
          hasPreview: clientData && typeof clientData === 'object' ? !!clientData.hasPreview : false,
          previewContentType: clientData && typeof clientData === 'object' ? clientData.previewContentType : undefined
        });
        
        
        // If we have a preview, also send a dedicated update event
        if (clientData.hasPreview) {
          serverLogger.info(`Sending dedicated preview update for completed tool ${executionId}`);
          this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_UPDATED, {
            sessionId,
            toolExecution: clientData
          });
        }
      } catch (error) {
        serverLogger.error(`Error handling tool execution completion for ${executionId}:`, error);
        // Emit basic completion event in case of error
        this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_COMPLETED, data);
      }
    } else {
      // Use the legacy behavior for backward compatibility with tests
      // Get tool args from the stored data in AgentService
      const args = this.agentService.getToolArgs(sessionId, tool.id) || {};
      
      // Check if we have a stored preview from a permission request
      let preview: ToolPreviewData | null = null;
      
      // Fall back to generating a new preview if no permission request occurred
      try {
        // Use PreviewService to generate the preview
        serverLogger.debug(`Generating legacy preview for tool ${tool.id} completion...`);
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
        
        if (preview) {
          serverLogger.info(`Generated legacy preview for tool ${tool.id}:`, {
            contentType: preview.contentType,
            hasFullContent: preview.hasFullContent,
            briefContentLength: preview.briefContent.length,
            metadataKeys: Object.keys(preview.metadata || {})
          });
        }
      } catch (error) {
        serverLogger.error(`Error generating legacy preview for tool ${tool.id}:`, error);
      }
      
      // Forward the event to clients with preview data if available
      const completionEvent = {
        sessionId,
        tool,
        result,
        paramSummary,
        executionTime,
        timestamp,
        isActive: false,
        // Include preview data if available
        preview,
        hasPreview: !!preview,
        previewContentType: preview?.contentType
      };
      
      // Log the event we're sending
      serverLogger.info(`Sending legacy tool completion event for ${tool.id}:`, {
        hasPreview: !!preview,
        previewContentType: preview?.contentType,
        briefContentLength: preview?.briefContent?.length,
        hasResult: !!result
      });
      
      this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_COMPLETED, completionEvent);
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
    executionId: string; // Required field
    args?: Record<string, unknown>;
    timestamp?: string;
  }): void {
    const { sessionId, executionId } = data;
    
    // Get the full execution state
    const execution = this.agentService.getToolExecution(executionId);
    
    if (!execution) {
      serverLogger.warn(`Tool execution not found for permission request: ${executionId}`);
      return;
    }
    
    // Convert to client format
    const clientData = this.convertExecutionToClientFormat(execution);
    
    // Send permission requested event with the execution ID
    this.io.to(sessionId).emit(WebSocketEvent.PERMISSION_REQUESTED, {
      sessionId,
      permission: {
        ...data,
        executionId: executionId
      }
    });
    
  }
  
  /**
   * Handle permission resolved event
   */
  private handlePermissionResolved(data: {
    sessionId: string;
    permissionId: string;
    toolId: string;
    executionId: string; // Required field
    granted: boolean;
    timestamp?: string;
  }): void {
    const { sessionId, executionId, granted } = data;
    
    // Get the full execution state
    const execution = this.agentService.getToolExecution(executionId);
    
    if (!execution) {
      serverLogger.warn(`Tool execution not found for permission resolution: ${executionId}`);
      return;
    }
    
    // Convert to client format
    const clientData = this.convertExecutionToClientFormat(execution);
    
    // Emit consistent events using executionId
    this.io.to(sessionId).emit(WebSocketEvent.PERMISSION_RESOLVED, {
      sessionId,
      executionId,
      resolution: granted
    });
    
  }
  
  /**
   * Convert a tool execution state to the format expected by clients
   * Now async to properly handle preview generation
   */
  private async convertExecutionToClientFormat(execution: ToolExecutionState): Promise<Record<string, unknown>> {
    // Add extra logging for debugging
    serverLogger.debug(`Converting execution to client format: ${execution.id}`, {
      status: execution.status,
      toolId: execution.toolId,
      hasPreviewId: !!execution.previewId,
      previewId: execution.previewId
    });
    
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
    
    // Add preview if available - now with proper async handling
    // First, try to use the preview ID if it exists
    if (execution.previewId) {
      try {
        serverLogger.debug(`Execution ${execution.id} has previewId: ${execution.previewId}`);
        // Properly await the preview retrieval
        const preview = await this.getPreviewForExecution(execution.id);
        if (preview) {
          serverLogger.info(`Preview found for execution ${execution.id}:`, {
            previewId: preview.id,
            contentType: preview.contentType,
            briefContentLength: preview.briefContent?.length,
            fullContentLength: preview.fullContent?.length
          });
          
          // Convert preview to client format with validation
          const formattedPreview = this.convertPreviewToClientFormat(preview);
          
          // Only set preview data if we have valid preview content
          if (formattedPreview) {
            clientData.preview = formattedPreview;
            
            // These are important for the client to know there's a preview available
            clientData.hasPreview = true;
            clientData.previewContentType = preview.contentType;
            clientData.previewBriefContentLength = preview.briefContent?.length;
            clientData.previewFullContentLength = preview.fullContent?.length;
            clientData.previewMetadataKeys = preview.metadata ? Object.keys(preview.metadata) : [];
            
            // Log detailed preview content to help diagnose potential issues
            serverLogger.info(`Adding preview to client data for ${execution.id}:`, {
              hasPreview: true,
              contentType: preview.contentType,
              briefContent: preview.briefContent?.substring(0, 50) + (preview.briefContent?.length > 50 ? '...' : ''),
              briefContentLength: preview.briefContent?.length,
              fullContentLength: preview.fullContent?.length,
              metadataKeys: preview.metadata ? Object.keys(preview.metadata) : []
            });
          } else {
            serverLogger.warn(`Invalid preview data for execution ${execution.id}: missing required fields`);
            clientData.hasPreview = false;
          }
        } else {
          serverLogger.warn(`No preview found for execution ${execution.id} despite having previewId: ${execution.previewId}`);
          clientData.hasPreview = false;
        }
      } catch (error) {
        serverLogger.error(`Error getting preview for execution ${execution.id}:`, error);
        clientData.hasPreview = false;
      }
    } else {
      // Try to get preview even if there's no previewId - sometimes it might exist
      try {
        serverLogger.debug(`Execution ${execution.id} has no previewId, trying to find preview anyway`);
        // Properly await the preview generation
        const preview = await this.getPreviewForExecution(execution.id);
        if (preview) {
          serverLogger.info(`Preview generated for execution ${execution.id} despite no previewId:`, {
            previewId: preview.id,
            contentType: preview.contentType,
            briefContentLength: preview.briefContent?.length,
            fullContentLength: preview.fullContent?.length
          });
          
          // Convert preview to client format with validation
          const formattedPreview = this.convertPreviewToClientFormat(preview);
          
          // Only set preview data if we have valid preview content
          if (formattedPreview) {
            clientData.preview = formattedPreview;
            
            // These are important for the client to know there's a preview available
            clientData.hasPreview = true;
            clientData.previewContentType = preview.contentType;
            clientData.previewBriefContentLength = preview.briefContent?.length;
            clientData.previewFullContentLength = preview.fullContent?.length;
            clientData.previewMetadataKeys = preview.metadata ? Object.keys(preview.metadata) : [];
            
            // Log detailed preview content to help diagnose potential issues
            serverLogger.info(`Adding generated preview to client data for ${execution.id}:`, {
              hasPreview: true,
              contentType: preview.contentType,
              briefContent: preview.briefContent?.substring(0, 50) + (preview.briefContent?.length > 50 ? '...' : ''),
              briefContentLength: preview.briefContent?.length,
              fullContentLength: preview.fullContent?.length,
              metadataKeys: preview.metadata ? Object.keys(preview.metadata) : []
            });
          } else {
            serverLogger.warn(`Invalid generated preview data for execution ${execution.id}: missing required fields`);
            clientData.hasPreview = false;
          }
        } else {
          clientData.hasPreview = false;
        }
      } catch (error) {
        // Log more details about the error
        serverLogger.warn(`Error generating preview for execution ${execution.id} without previewId:`, error);
        clientData.hasPreview = false;
      }
    }
    
    return clientData;
  }
  
  /**
   * Convert a preview state to the format expected by clients
   */
  private convertPreviewToClientFormat(preview: ToolPreviewState): Record<string, unknown> | null {
    // Validate that the preview has required fields
    if (!preview.contentType) {
      serverLogger.warn(`Invalid preview data for ${preview.id}: missing contentType`);
      return null;
    }
    
    // Ensure briefContent is not empty or undefined
    if (!preview.briefContent || preview.briefContent.trim() === '') {
      serverLogger.warn(`Preview ${preview.id} has empty briefContent - adding placeholder`);
      
      // Set a placeholder message based on content type
      let placeholderContent = '[Preview content unavailable]';
      
      if (preview.contentType === 'directory') {
        placeholderContent = `Directory listing preview:\n\nFiles and directories will be shown here`;
      } else if (preview.contentType === 'code') {
        placeholderContent = `Code preview:\n\nFile contents will be shown here`;
      } else if (preview.contentType === 'diff') {
        placeholderContent = `Diff preview:\n\nChanges will be shown here`;
      }
      
      // Log that we're adding placeholder content
      serverLogger.info(`Adding placeholder content for preview ${preview.id} of type ${preview.contentType}`);
      
      // Return preview with placeholder content
      return {
        contentType: preview.contentType,
        briefContent: placeholderContent,
        fullContent: preview.fullContent || placeholderContent,
        metadata: preview.metadata
      };
    }
    
    // Normal case - return the preview with its content
    return {
      contentType: preview.contentType,
      briefContent: preview.briefContent,
      fullContent: preview.fullContent,
      metadata: preview.metadata
    };
  }
  
  /**
   * Get a preview for an execution
   * Retrieves the preview associated with a tool execution from the AgentService
   * 
   * This is now an async method to properly handle preview generation
   */
  /**
   * Get a preview for a tool execution.
   * Try to get an existing preview first, then use ToolExecutionManager to generate 
   * one if not already available.
   */
  private async getPreviewForExecution(executionId: string): Promise<ToolPreviewState | null> {
    try {
      // First check if preview already exists
      const preview = this.agentService.getPreviewForExecution(executionId);
      
      if (preview) {
        serverLogger.debug(`Found existing preview for execution ${executionId}`, {
          previewId: preview.id,
          contentType: preview.contentType,
          hasFullContent: !!preview.fullContent
        });
        return preview;
      } 
      
      // No preview found, request generation from the tool execution manager
      serverLogger.debug(`No preview found for execution ${executionId}, requesting generation from ToolExecutionManager`);
      
      // Get the execution
      const execution = this.agentService.getToolExecution(executionId);
      if (!execution) {
        serverLogger.error(`Cannot generate preview - execution ${executionId} not found`);
        return null;
      }
      
      // Get the tool execution manager
      const toolExecutionManager = this.agentService.getToolExecutionManager();
      if (!toolExecutionManager) {
        serverLogger.error(`Cannot get tool execution manager to generate preview for ${executionId}`);
        return null;
      }
      
      // Get the tool execution manager and cast to appropriate type that has the method
      const typedManager = toolExecutionManager as unknown as { 
        generatePreviewForExecution: (id: string) => Promise<ToolPreviewState | null> 
      };
      
      // Generate the preview using the tool execution manager
      const generatedPreview = await typedManager.generatePreviewForExecution(executionId);
      
      if (generatedPreview) {
        serverLogger.info(`Successfully generated preview for execution ${executionId} via ToolExecutionManager`, {
          previewId: generatedPreview.id,
          contentType: generatedPreview.contentType,
          briefContentLength: generatedPreview.briefContent?.length || 0
        });
      } else {
        serverLogger.debug(`No preview could be generated for execution ${executionId}`);
      }
      
      return generatedPreview;
    } catch (error) {
      serverLogger.error(`Error getting/generating preview for execution ${executionId}:`, error);
      return null;
    }
  }
}