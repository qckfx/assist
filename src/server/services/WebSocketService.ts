import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { AgentService, AgentServiceEvent, getAgentService } from './AgentService';
import { SessionManager, sessionManager } from './SessionManager';
import { serverLogger } from '../logger';

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
  PERMISSION_REQUESTED = 'permission_requested',
  PERMISSION_RESOLVED = 'permission_resolved',
  SESSION_UPDATED = 'session_updated',
  STREAM_CONTENT = 'stream_content',
}

/**
 * Interface for tracking active tool execution
 */
interface ActiveToolExecution {
  startTime: Date;
  tool: {
    id: string;
    name: string;
  };
  paramSummary: string;
}

/**
 * Singleton service to manage WebSocket connections and events
 */
export class WebSocketService {
  private static instance: WebSocketService;
  private io: SocketIOServer;
  private agentService: AgentService;
  private sessionManager: SessionManager;
  
  // Map of sessionId -> Map of toolId -> active tool execution
  private activeTools: Map<string, Map<string, ActiveToolExecution>> = new Map();

  private constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: '*', // Consider restricting this in production
        methods: ['GET', 'POST'],
      },
    });

    this.agentService = getAgentService();
    this.sessionManager = sessionManager;

    this.setupSocketHandlers();
    this.setupAgentEventListeners();

    serverLogger.info('WebSocketService initialized');
  }

  /**
   * Get the singleton instance of WebSocketService
   */
  public static getInstance(server?: HTTPServer): WebSocketService {
    if (!WebSocketService.instance) {
      if (!server) {
        throw new Error('Server instance required for first WebSocketService initialization');
      }
      WebSocketService.instance = new WebSocketService(server);
    }
    return WebSocketService.instance;
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
      this.io.close(() => {
        serverLogger.info('WebSocketService closed');
        resolve();
      });
    });
  }

  /**
   * Setup socket connection handling
   */
  private setupSocketHandlers(): void {
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
        // Use standard event listeners for logging instead of modifying private properties
        const originalOn = socket.on;
        socket.on = function(event: string, listener: (...args: unknown[]) => void) {
          // Wrap each event listener with logging
          const wrappedListener = (...args: unknown[]) => {
            serverLogger.debug(`Socket ${socket.id} received event '${event}' with data:`, args);
            return listener.apply(this, args);
          };
          return originalOn.call(this, event, wrappedListener);
        };
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
        } catch (error) {
          serverLogger.error(`Error in JOIN_SESSION handler:`, error);
          socket.emit(WebSocketEvent.ERROR, {
            message: `Session ${sessionId} not found`,
          });
          return;
        }

        // Join the session's room
        socket.join(sessionId);
        serverLogger.debug(`Client ${socket.id} joined session ${sessionId}`);

        // Send current session state
        const session = this.sessionManager.getSession(sessionId);
        socket.emit(WebSocketEvent.SESSION_UPDATED, session);

        // If there are pending permission requests, send them
        const pendingPermissions = this.agentService.getPermissionRequests(sessionId);
        if (pendingPermissions.length > 0) {
          socket.emit(WebSocketEvent.PERMISSION_REQUESTED, {
            sessionId,
            permissions: pendingPermissions,
          });
        }
      });

      // Handle leave session requests
      socket.on(WebSocketEvent.LEAVE_SESSION, (sessionId: string) => {
        socket.leave(sessionId);
        serverLogger.debug(`Client ${socket.id} left session ${sessionId}`);
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
  private setupAgentEventListeners(): void {
    // Processing started
    this.agentService.on(AgentServiceEvent.PROCESSING_STARTED, ({ sessionId }) => {
      this.io.to(sessionId).emit(WebSocketEvent.PROCESSING_STARTED, { sessionId });
      
      // Also send updated session
      const session = this.sessionManager.getSession(sessionId);
      this.io.to(sessionId).emit(WebSocketEvent.SESSION_UPDATED, session);
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
      
      // Also send updated session
      const session = this.sessionManager.getSession(sessionId);
      this.io.to(sessionId).emit(WebSocketEvent.SESSION_UPDATED, session);
    });

    // Processing aborted
    this.agentService.on(AgentServiceEvent.PROCESSING_ABORTED, ({ sessionId }) => {
      this.io.to(sessionId).emit(WebSocketEvent.PROCESSING_ABORTED, { sessionId });
      
      // Also send updated session
      const session = this.sessionManager.getSession(sessionId);
      this.io.to(sessionId).emit(WebSocketEvent.SESSION_UPDATED, session);
    });

    // Legacy tool execution (for backward compatibility)
    this.agentService.on(AgentServiceEvent.TOOL_EXECUTION, ({ sessionId, tool, result }) => {
      this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION, { 
        sessionId,
        tool,
        result, 
      });
    });
    
    // Tool execution started
    this.agentService.on(AgentServiceEvent.TOOL_EXECUTION_STARTED, ({ sessionId, tool, args, paramSummary, timestamp }) => {
      // Track active tool execution
      if (!this.activeTools.has(sessionId)) {
        this.activeTools.set(sessionId, new Map());
      }
      
      this.activeTools.get(sessionId)!.set(tool.id, {
        startTime: new Date(timestamp),
        tool,
        paramSummary
      });
      
      // Forward the event to clients
      this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_STARTED, { 
        sessionId,
        tool,
        args,
        paramSummary,
        timestamp,
        isActive: true,
      });
      
      serverLogger.debug(`Tool execution started: ${tool.name} (${tool.id}) in session ${sessionId}`);
    });
    
    // Tool execution completed
    this.agentService.on(AgentServiceEvent.TOOL_EXECUTION_COMPLETED, ({ sessionId, tool, result, paramSummary, executionTime, timestamp }) => {
      // Remove from active tools
      const activeToolData = this.activeTools.get(sessionId)?.get(tool.id);
      this.activeTools.get(sessionId)?.delete(tool.id);
      
      // Clean up empty maps
      if (this.activeTools.get(sessionId)?.size === 0) {
        this.activeTools.delete(sessionId);
      }
      
      // Forward the event to clients
      this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_COMPLETED, { 
        sessionId,
        tool,
        result,
        paramSummary,
        executionTime,
        timestamp,
        isActive: false,
        startTime: activeToolData?.startTime.toISOString(),
      });
      
      serverLogger.debug(`Tool execution completed: ${tool.name} (${tool.id}) in session ${sessionId}, took ${executionTime}ms`);
    });
    
    // Tool execution error
    this.agentService.on(AgentServiceEvent.TOOL_EXECUTION_ERROR, ({ sessionId, tool, error, paramSummary, timestamp }) => {
      // Remove from active tools
      const activeToolData = this.activeTools.get(sessionId)?.get(tool.id);
      this.activeTools.get(sessionId)?.delete(tool.id);
      
      // Clean up empty maps
      if (this.activeTools.get(sessionId)?.size === 0) {
        this.activeTools.delete(sessionId);
      }
      
      // Forward the event to clients
      this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION_ERROR, { 
        sessionId,
        tool,
        error,
        paramSummary,
        timestamp,
        isActive: false,
        startTime: activeToolData?.startTime.toISOString(),
      });
      
      serverLogger.debug(`Tool execution error: ${tool.name} (${tool.id}) in session ${sessionId}, error: ${error.message}`);
    });

    // Permission requested
    this.agentService.on(AgentServiceEvent.PERMISSION_REQUESTED, ({ sessionId, permission }) => {
      this.io.to(sessionId).emit(WebSocketEvent.PERMISSION_REQUESTED, { 
        sessionId,
        permission,
      });
    });

    // Permission resolved
    this.agentService.on(AgentServiceEvent.PERMISSION_RESOLVED, ({ sessionId, permissionId, resolution }) => {
      this.io.to(sessionId).emit(WebSocketEvent.PERMISSION_RESOLVED, { 
        sessionId,
        permissionId,
        resolution,
      });
    });
  }
}