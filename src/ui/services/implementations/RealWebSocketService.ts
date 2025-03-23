/**
 * Real WebSocket service implementation that connects to the server
 */
import { EventEmitter } from 'events';
import { io, Socket } from 'socket.io-client';
import { IWebSocketService } from '../interfaces/IWebSocketService';
import { 
  WebSocketEvent, 
  WebSocketEventMap,
  ConnectionStatus,
  SessionData
} from '@/types/api';
import { 
  SOCKET_URL, 
  SOCKET_RECONNECTION_ATTEMPTS, 
  SOCKET_RECONNECTION_DELAY,
  SOCKET_RECONNECTION_DELAY_MAX,
  SOCKET_TIMEOUT
} from '@/config/api';
import { throttle } from '@/utils/performance';

export class RealWebSocketService extends EventEmitter implements IWebSocketService {
  private socket: Socket | null = null;
  private connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private reconnectAttempts = 0;
  private currentSessionId: string | null = null;
  private messageBuffer: Map<string, any[]> = new Map();
  private flushIntervalTimer: NodeJS.Timeout | null = null;
  
  // Message buffer for tool execution results
  private toolResultBuffer: Record<string, any[]> = {};
  // Last time tool results were flushed
  private lastToolFlush: Record<string, number> = {};
  // Max buffer size before forcing a flush
  private readonly maxBufferSize = 50;
  // Auto-flush interval in ms
  private readonly flushIntervalMs = 500;
  // Throttle event emission for frequently updated tools
  private readonly throttleInterval = 100;

  // Throttled event emitter for high-frequency events
  private throttledEmit = throttle(
    (event: string, data: any) => {
      super.emit(event, data);
    },
    this.throttleInterval
  );

  constructor() {
    super();
    this.initializeSocket();
  }
  
  /**
   * Override the emit method to handle buffering
   */
  public emit(event: string, ...args: any[]): boolean {
    // For tool execution events, use buffering
    if (event === WebSocketEvent.TOOL_EXECUTION) {
      const data = args[0];
      const toolId = data.tool?.id;
      
      if (toolId) {
        this.bufferToolResult(toolId, data);
        return true;
      }
    }
    
    // Use throttled emit for high-frequency events
    if (
      event === WebSocketEvent.PROCESSING_STARTED ||
      event === WebSocketEvent.SESSION_UPDATED
    ) {
      this.throttledEmit(event, ...args);
      return true;
    }
    
    // Default behavior for other events
    return super.emit(event, ...args);
  }

  /**
   * Initialize the Socket.io connection
   */
  private initializeSocket(): void {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.updateConnectionStatus(ConnectionStatus.CONNECTING);

    this.socket = io(SOCKET_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: SOCKET_RECONNECTION_ATTEMPTS,
      reconnectionDelay: SOCKET_RECONNECTION_DELAY,
      reconnectionDelayMax: SOCKET_RECONNECTION_DELAY_MAX,
      timeout: SOCKET_TIMEOUT,
      forceNew: true,
    });

    this.setupSocketEventHandlers();
    this.startBufferFlushInterval();
  }

  /**
   * Set up handlers for socket events
   */
  private setupSocketEventHandlers(): void {
    if (!this.socket) return;

    // Connection established
    this.socket.on(WebSocketEvent.CONNECT, () => {
      console.log('WebSocket connected');
      this.updateConnectionStatus(ConnectionStatus.CONNECTED);
      this.reconnectAttempts = 0;
      
      // Rejoin the session if there was one active
      if (this.currentSessionId) {
        this.joinSession(this.currentSessionId);
      }
      
      this.emit('connection', { status: ConnectionStatus.CONNECTED });
    });

    // Connection error
    this.socket.on(WebSocketEvent.ERROR, (error: any) => {
      console.error('WebSocket error:', error);
      this.updateConnectionStatus(ConnectionStatus.ERROR);
      this.emit('connection', { 
        status: ConnectionStatus.ERROR, 
        error: error.message || 'Unknown socket error' 
      });
    });

    // Disconnection
    this.socket.on(WebSocketEvent.DISCONNECT, (reason: string) => {
      console.log('WebSocket disconnected:', reason);
      this.updateConnectionStatus(ConnectionStatus.DISCONNECTED);
      this.emit('connection', { 
        status: ConnectionStatus.DISCONNECTED, 
        reason 
      });
    });

    // Reconnection attempt
    this.socket.io.on('reconnect_attempt', (attempt: number) => {
      console.log(`WebSocket reconnection attempt ${attempt}`);
      this.reconnectAttempts = attempt;
      this.updateConnectionStatus(ConnectionStatus.RECONNECTING);
      this.emit('connection', { 
        status: ConnectionStatus.RECONNECTING, 
        attempt 
      });
    });

    // Agent events
    this.socket.on(WebSocketEvent.PROCESSING_STARTED, (data: WebSocketEventMap[WebSocketEvent.PROCESSING_STARTED]) => {
      this.bufferEvent(WebSocketEvent.PROCESSING_STARTED, data);
      this.emit(WebSocketEvent.PROCESSING_STARTED, data);
    });

    this.socket.on(WebSocketEvent.PROCESSING_COMPLETED, (data: WebSocketEventMap[WebSocketEvent.PROCESSING_COMPLETED]) => {
      this.bufferEvent(WebSocketEvent.PROCESSING_COMPLETED, data);
      this.emit(WebSocketEvent.PROCESSING_COMPLETED, data);
    });

    this.socket.on(WebSocketEvent.PROCESSING_ERROR, (data: WebSocketEventMap[WebSocketEvent.PROCESSING_ERROR]) => {
      this.bufferEvent(WebSocketEvent.PROCESSING_ERROR, data);
      this.emit(WebSocketEvent.PROCESSING_ERROR, data);
    });

    this.socket.on(WebSocketEvent.PROCESSING_ABORTED, (data: WebSocketEventMap[WebSocketEvent.PROCESSING_ABORTED]) => {
      this.bufferEvent(WebSocketEvent.PROCESSING_ABORTED, data);
      this.emit(WebSocketEvent.PROCESSING_ABORTED, data);
    });

    this.socket.on(WebSocketEvent.TOOL_EXECUTION, (data: WebSocketEventMap[WebSocketEvent.TOOL_EXECUTION]) => {
      this.bufferEvent(WebSocketEvent.TOOL_EXECUTION, data);
      this.emit(WebSocketEvent.TOOL_EXECUTION, data);
    });

    this.socket.on(WebSocketEvent.PERMISSION_REQUESTED, (data: WebSocketEventMap[WebSocketEvent.PERMISSION_REQUESTED]) => {
      this.bufferEvent(WebSocketEvent.PERMISSION_REQUESTED, data);
      this.emit(WebSocketEvent.PERMISSION_REQUESTED, data);
    });

    this.socket.on(WebSocketEvent.PERMISSION_RESOLVED, (data: WebSocketEventMap[WebSocketEvent.PERMISSION_RESOLVED]) => {
      this.bufferEvent(WebSocketEvent.PERMISSION_RESOLVED, data);
      this.emit(WebSocketEvent.PERMISSION_RESOLVED, data);
    });

    this.socket.on(WebSocketEvent.SESSION_UPDATED, (data: WebSocketEventMap[WebSocketEvent.SESSION_UPDATED]) => {
      this.bufferEvent(WebSocketEvent.SESSION_UPDATED, data);
      this.emit(WebSocketEvent.SESSION_UPDATED, data);
    });
  }

  /**
   * Join a session to receive events for that session
   */
  public joinSession(sessionId: string): void {
    if (!this.socket || !this.isConnected()) {
      console.warn('Cannot join session: socket not connected');
      this.currentSessionId = sessionId; // Store for reconnection
      return;
    }

    // If we're already in a session, leave it first
    if (this.currentSessionId && this.currentSessionId !== sessionId) {
      this.leaveSession(this.currentSessionId);
    }

    this.socket.emit(WebSocketEvent.JOIN_SESSION, sessionId);
    this.currentSessionId = sessionId;
    console.log(`Joined session ${sessionId}`);
  }

  /**
   * Leave a session to stop receiving events for that session
   */
  public leaveSession(sessionId: string): void {
    if (!this.socket || !this.isConnected()) {
      console.warn('Cannot leave session: socket not connected');
      return;
    }

    this.socket.emit(WebSocketEvent.LEAVE_SESSION, sessionId);
    
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }
    
    console.log(`Left session ${sessionId}`);
  }

  /**
   * Connect to the WebSocket server
   */
  public connect(): void {
    this.initializeSocket();
  }

  /**
   * Check if the socket is currently connected
   */
  public isConnected(): boolean {
    return this.connectionStatus === ConnectionStatus.CONNECTED;
  }

  /**
   * Get the current connection status
   */
  public getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Get the current session ID
   */
  public getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Add an event to the buffer for batch processing
   */
  private bufferEvent(event: string, data: any): void {
    if (!this.messageBuffer.has(event)) {
      this.messageBuffer.set(event, []);
    }
    
    const buffer = this.messageBuffer.get(event);
    if (buffer) {
      buffer.push({
        timestamp: Date.now(),
        data
      });
    }
  }

  /**
   * Start interval for flushing buffered events
   */
  private startBufferFlushInterval(): void {
    if (this.flushIntervalTimer) {
      clearInterval(this.flushIntervalTimer);
    }
    
    this.flushIntervalTimer = setInterval(() => {
      this.flushBuffers();
    }, 100); // Flush every 100ms
  }

  /**
   * Flush all buffered events
   */
  private flushBuffers(): void {
    this.messageBuffer.forEach((messages, event) => {
      if (messages.length > 0) {
        this.emit(`${event}:batch`, messages);
        this.messageBuffer.set(event, []);
      }
    });
    
    // Also flush tool buffers
    this.flushAllToolBuffers();
  }
  
  /**
   * Buffer tool results and flush when appropriate
   */
  private bufferToolResult(toolId: string, data: any): void {
    // Initialize buffer if needed
    if (!this.toolResultBuffer[toolId]) {
      this.toolResultBuffer[toolId] = [];
      this.lastToolFlush[toolId] = Date.now();
    }
    
    // Add to buffer
    this.toolResultBuffer[toolId].push(data);
    
    // Check if we should flush
    const bufferSize = this.toolResultBuffer[toolId].length;
    const timeSinceLastFlush = Date.now() - this.lastToolFlush[toolId];
    
    // Flush if buffer is full or enough time has passed
    if (bufferSize >= this.maxBufferSize || timeSinceLastFlush >= this.flushIntervalMs) {
      this.flushToolBuffer(toolId);
    } else {
      // Schedule a flush after the interval
      setTimeout(() => {
        if (this.toolResultBuffer[toolId]?.length > 0) {
          this.flushToolBuffer(toolId);
        }
      }, this.flushIntervalMs - timeSinceLastFlush);
    }
  }
  
  /**
   * Flush the buffer for a specific tool
   */
  private flushToolBuffer(toolId: string): void {
    if (!this.toolResultBuffer[toolId] || this.toolResultBuffer[toolId].length === 0) {
      return;
    }
    
    // Create a batched event with all buffered data
    const batchedData = {
      toolId,
      results: [...this.toolResultBuffer[toolId]],
      isBatched: true,
      batchSize: this.toolResultBuffer[toolId].length,
    };
    
    // Emit the batched event
    super.emit(WebSocketEvent.TOOL_EXECUTION_BATCH, batchedData);
    
    // Clear buffer and update last flush time
    this.toolResultBuffer[toolId] = [];
    this.lastToolFlush[toolId] = Date.now();
  }
  
  /**
   * Flush all tool buffers
   */
  public flushAllToolBuffers(): void {
    Object.keys(this.toolResultBuffer).forEach(toolId => {
      this.flushToolBuffer(toolId);
    });
  }

  /**
   * Update the connection status and emit an event
   */
  private updateConnectionStatus(status: ConnectionStatus): void {
    this.connectionStatus = status;
    this.emit('connectionStatusChanged', status);
  }

  /**
   * Manually reconnect the socket
   */
  public reconnect(): void {
    if (this.socket) {
      this.socket.connect();
    } else {
      this.initializeSocket();
    }
  }

  /**
   * Close the WebSocket connection
   */
  public disconnect(): void {
    // Flush any pending buffers
    this.flushBuffers();
    this.flushAllToolBuffers();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    if (this.flushIntervalTimer) {
      clearInterval(this.flushIntervalTimer);
      this.flushIntervalTimer = null;
    }
    
    this.updateConnectionStatus(ConnectionStatus.DISCONNECTED);
  }
  
  /**
   * Reset the service - completely clean up all resources
   * Used primarily for testing and cleanup
   */
  public reset(): void {
    console.log('RealWebSocketService: Performing thorough cleanup and reset');
    
    // 1. Properly disconnect and clean up socket.io resources
    if (this.socket) {
      try {
        // Remove all socket event listeners first
        const socketEvents = [
          WebSocketEvent.CONNECT,
          WebSocketEvent.ERROR,
          WebSocketEvent.DISCONNECT,
          WebSocketEvent.PROCESSING_STARTED,
          WebSocketEvent.PROCESSING_COMPLETED,
          WebSocketEvent.PROCESSING_ERROR,
          WebSocketEvent.PROCESSING_ABORTED,
          WebSocketEvent.TOOL_EXECUTION,
          WebSocketEvent.PERMISSION_REQUESTED,
          WebSocketEvent.PERMISSION_RESOLVED,
          WebSocketEvent.SESSION_UPDATED
        ];
        
        socketEvents.forEach(event => {
          if (this.socket) {
            this.socket.off(event);
            console.log(`RealWebSocketService: Removed socket event listener for ${event}`);
          }
        });
        
        // Make sure reconnection is disabled before disconnecting
        if (this.socket.io && typeof this.socket.io.reconnection === 'function') {
          this.socket.io.reconnection(false);
          console.log('RealWebSocketService: Disabled socket reconnection');
        }
        
        // Also clear any reconnection listeners on the manager
        if (this.socket.io) {
          this.socket.io.off('reconnect_attempt');
          console.log('RealWebSocketService: Removed reconnect_attempt listeners');
        }
        
        // Disconnect the socket
        this.socket.disconnect();
        console.log('RealWebSocketService: Socket disconnected');
        
        // Close and cleanup manager if possible
        if (this.socket.io && typeof this.socket.io.engine === 'object' && this.socket.io.engine) {
          if (typeof this.socket.io.engine.close === 'function') {
            this.socket.io.engine.close();
            console.log('RealWebSocketService: Socket engine closed');
          }
        }
      } catch (err) {
        console.error('RealWebSocketService: Error during socket cleanup:', err);
      }
      
      // Clear the socket reference
      this.socket = null;
    }
    
    // 2. Clear all timers and intervals
    if (this.flushIntervalTimer) {
      clearInterval(this.flushIntervalTimer);
      this.flushIntervalTimer = null;
      console.log('RealWebSocketService: Cleared flush interval');
    }
    
    // 3. Clear all data structures
    this.messageBuffer.clear();
    this.toolResultBuffer = {};
    this.lastToolFlush = {};
    console.log('RealWebSocketService: Cleared message buffers');
    
    // 4. Reset all state variables
    this.currentSessionId = null;
    this.reconnectAttempts = 0;
    this.connectionStatus = ConnectionStatus.DISCONNECTED;
    console.log('RealWebSocketService: Reset state variables');
    
    // 5. Remove all EventEmitter listeners (our custom ones)
    this.removeAllListeners();
    console.log('RealWebSocketService: Removed all event listeners');
    
    // 6. Force a garbage collection hint (only in testing environments)
    if (process && process.env && process.env.NODE_ENV === 'test') {
      // This explicit null assignment can help with garbage collection
      Object.keys(this).forEach(key => {
        const k = key as keyof this;
        if (typeof this[k] === 'object' && this[k] !== null) {
          // @ts-ignore - Intentionally setting to null for GC
          this[k] = null;
        }
      });
      console.log('RealWebSocketService: Applied garbage collection hints');
      
      // In Node.js testing environments, we could force GC if available
      // This is commented out because it requires special Node.js flags
      // if (global.gc) {
      //   global.gc();
      // }
    }
    
    console.log('RealWebSocketService: Reset complete');
  }
}