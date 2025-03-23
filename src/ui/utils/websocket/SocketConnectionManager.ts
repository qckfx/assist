/**
 * SocketConnectionManager
 * 
 * Manages Socket.io connections outside of React's render cycle.
 * This prevents connection issues due to React component re-renders.
 */
import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import { 
  ConnectionStatus, 
  WebSocketEvent, 
  WebSocketEventMap 
} from '../../types/api';
import {
  SOCKET_RECONNECTION_ATTEMPTS,
  SOCKET_RECONNECTION_DELAY,
  SOCKET_RECONNECTION_DELAY_MAX,
  SOCKET_TIMEOUT
} from '../../config/api';

/**
 * ConnectionManager
 * 
 * Manages Socket.io connections outside of React's render cycle.
 * Uses the singleton pattern to ensure only one connection exists.
 * Emits events that React components can subscribe to.
 */
export class SocketConnectionManager extends EventEmitter {
  private static instance: SocketConnectionManager;
  
  // Socket.io connection
  private socket: Socket | null = null;
  
  // Connection state
  private connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private reconnectAttempts: number = 0;
  private currentSessionId: string | null = null;
  
  private constructor() {
    super();
  }
  
  /**
   * Get the singleton instance of SocketConnectionManager
   */
  public static getInstance(): SocketConnectionManager {
    if (!SocketConnectionManager.instance) {
      SocketConnectionManager.instance = new SocketConnectionManager();
    }
    return SocketConnectionManager.instance;
  }
  
  /**
   * Get the current connection status
   */
  public getStatus(): ConnectionStatus {
    return this.connectionStatus;
  }
  
  /**
   * Get the number of reconnection attempts
   */
  public getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }
  
  /**
   * Get the current session ID
   */
  public getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }
  
  /**
   * Get the Socket.io socket instance
   */
  public getSocket(): Socket | null {
    return this.socket;
  }
  
  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.connectionStatus === ConnectionStatus.CONNECTED;
  }
  
  /**
   * Set the connection status and emit an event
   */
  private setStatus(status: ConnectionStatus): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      this.emit('status_change', status);
    }
  }
  
  /**
   * Connect to the Socket.io server
   */
  public connect(): void {
    // If already connected or connecting, do nothing
    if (this.socket || this.connectionStatus === ConnectionStatus.CONNECTING) {
      console.log('SocketConnectionManager: Already connected or connecting, skipping');
      return;
    }
    
    console.log('SocketConnectionManager: Connecting to socket.io server');
    this.setStatus(ConnectionStatus.CONNECTING);
    
    // Explicitly use the current origin with /socket.io path
    const socketUrl = window.location.origin;
    console.log('SocketConnectionManager: Socket URL:', socketUrl);
    
    // Create socket with standardized configuration
    this.socket = io(socketUrl, {
      autoConnect: true,
      reconnection: true,
      path: '/socket.io',  // Explicitly set the path
      transports: ['websocket', 'polling'],
      upgrade: true,
      reconnectionAttempts: SOCKET_RECONNECTION_ATTEMPTS,
      reconnectionDelay: SOCKET_RECONNECTION_DELAY,
      reconnectionDelayMax: SOCKET_RECONNECTION_DELAY_MAX,
      timeout: SOCKET_TIMEOUT,
      forceNew: false
    });
    
    // Set up event listeners
    this.setupEventListeners();
  }
  
  /**
   * Set up Socket.io event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) {
      console.error('SocketConnectionManager: No socket to set up event listeners');
      return;
    }
    
    // Connection events
    this.socket.on(WebSocketEvent.CONNECT, () => {
      console.log('SocketConnectionManager: Connected to server');
      this.setStatus(ConnectionStatus.CONNECTED);
      this.reconnectAttempts = 0;
      this.emit('reconnect_attempt', 0);
      
      // Rejoin session if needed
      if (this.currentSessionId) {
        this.joinSession(this.currentSessionId);
      }
    });
    
    this.socket.on(WebSocketEvent.DISCONNECT, (reason: string) => {
      console.log(`SocketConnectionManager: Disconnected: ${reason}`);
      this.setStatus(ConnectionStatus.DISCONNECTED);
    });
    
    this.socket.on(WebSocketEvent.ERROR, (error: any) => {
      console.error('SocketConnectionManager: Connection error:', error);
      this.setStatus(ConnectionStatus.ERROR);
    });
    
    // Reconnection events
    this.socket.io.on('reconnect_attempt', (attempt: number) => {
      console.log(`SocketConnectionManager: Reconnection attempt ${attempt}`);
      this.reconnectAttempts = attempt;
      this.emit('reconnect_attempt', attempt);
      this.setStatus(ConnectionStatus.RECONNECTING);
    });
    
    // Debug events in development
    if (process.env.NODE_ENV === 'development') {
      this.socket.onAny((event, ...args) => {
        console.log(`SocketConnectionManager: Event ${event}`, args);
      });
      
      this.socket.io.on('reconnect', (attempt: number) => {
        console.log(`SocketConnectionManager: Reconnected after ${attempt} attempts`);
      });
      
      this.socket.io.on('reconnect_error', (error: any) => {
        console.error('SocketConnectionManager: Reconnection error:', error);
      });
      
      this.socket.io.on('reconnect_failed', () => {
        console.error('SocketConnectionManager: Reconnection failed');
      });
    }
  }
  
  /**
   * Disconnect from the Socket.io server
   */
  public disconnect(): void {
    if (!this.socket) {
      console.log('SocketConnectionManager: Not connected, nothing to disconnect');
      return;
    }
    
    console.log('SocketConnectionManager: Disconnecting from server');
    
    // Remove all socket event listeners to prevent memory leaks
    this.socket.offAny();
    if (this.socket.io) {
      this.socket.io.off();
    }
    
    // Disconnect the socket
    this.socket.disconnect();
    this.socket = null;
    
    // Update status
    this.setStatus(ConnectionStatus.DISCONNECTED);
  }
  
  /**
   * Reconnect to the Socket.io server
   */
  public reconnect(): void {
    if (this.socket) {
      console.log('SocketConnectionManager: Reconnecting existing socket');
      this.socket.connect();
    } else {
      console.log('SocketConnectionManager: No existing socket, connecting new one');
      this.connect();
    }
  }
  
  /**
   * Join a session
   */
  public joinSession(sessionId: string): void {
    if (!this.socket || !this.isConnected()) {
      console.log(`SocketConnectionManager: Cannot join session ${sessionId}: not connected`);
      // Store for later when we connect
      this.currentSessionId = sessionId;
      return;
    }
    
    // Leave current session if different
    if (this.currentSessionId && this.currentSessionId !== sessionId) {
      this.socket.emit(WebSocketEvent.LEAVE_SESSION, this.currentSessionId);
    }
    
    // Join new session
    this.socket.emit(WebSocketEvent.JOIN_SESSION, sessionId);
    this.currentSessionId = sessionId;
    this.emit('session_change', sessionId);
    console.log(`SocketConnectionManager: Joined session ${sessionId}`);
  }
  
  /**
   * Leave a session
   */
  public leaveSession(sessionId: string): void {
    if (!this.socket || !this.isConnected()) {
      console.log(`SocketConnectionManager: Cannot leave session ${sessionId}: not connected`);
      return;
    }
    
    this.socket.emit(WebSocketEvent.LEAVE_SESSION, sessionId);
    
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
      this.emit('session_change', null);
    }
    
    console.log(`SocketConnectionManager: Left session ${sessionId}`);
  }
  
  /**
   * Send an event to the server
   */
  public sendEvent<T extends WebSocketEvent>(event: T, data: WebSocketEventMap[T]): void {
    if (!this.socket || !this.isConnected()) {
      console.error(`SocketConnectionManager: Cannot send event ${event}: not connected`);
      return;
    }
    
    this.socket.emit(event, data);
  }
  
  /**
   * Reset the connection manager (for testing)
   */
  public reset(): void {
    this.disconnect();
    this.removeAllListeners();
    this.connectionStatus = ConnectionStatus.DISCONNECTED;
    this.reconnectAttempts = 0;
    this.currentSessionId = null;
  }
}

// Export a utility function to get the instance
export const getSocketConnectionManager = (): SocketConnectionManager => {
  return SocketConnectionManager.getInstance();
};

// Default export for simplicity
export default SocketConnectionManager;