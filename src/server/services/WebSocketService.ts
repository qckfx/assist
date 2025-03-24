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
  PERMISSION_REQUESTED = 'permission_requested',
  PERMISSION_RESOLVED = 'permission_resolved',
  SESSION_UPDATED = 'session_updated',
}

/**
 * Singleton service to manage WebSocket connections and events
 */
export class WebSocketService {
  private static instance: WebSocketService;
  private io: SocketIOServer;
  private agentService: AgentService;
  private sessionManager: SessionManager;

  private constructor(server: HTTPServer) {
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
        // Use standard event listeners for logging instead of modifying private properties
        const originalOn = socket.on;
        socket.on = function(event: string, listener: (...args: any[]) => void) {
          // Wrap each event listener with logging
          const wrappedListener = (...args: any[]) => {
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
      socket.conn.on('packet', (packet: any) => {
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

    // Tool execution
    this.agentService.on(AgentServiceEvent.TOOL_EXECUTION, ({ sessionId, tool, result }) => {
      this.io.to(sessionId).emit(WebSocketEvent.TOOL_EXECUTION, { 
        sessionId,
        tool,
        result, 
      });
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