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
  
  /**
   * Session management state
   * 
   * This state is maintained independently from React's render cycle to ensure
   * stability and prevent unnecessary joins/leaves during React re-renders.
   * 
   * - currentSessionId: The current session this connection is joined to
   * - hasJoined: Whether we've successfully joined the session
   * - pendingSession: Session waiting to be joined once connection is established
   */
  private sessionState = {
    currentSessionId: null as string | null,
    hasJoined: false,
    pendingSession: null as string | null
  };
  
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
   * 
   * @returns The ID of the session that is currently joined, or null if no session is joined
   */
  public getCurrentSessionId(): string | null {
    return this.sessionState.currentSessionId;
  }
  
  /**
   * Get detailed session state information
   * 
   * @returns An object containing the current session state
   */
  public getSessionState(): {
    currentSessionId: string | null;
    hasJoined: boolean;
    pendingSession: string | null;
  } {
    return { ...this.sessionState };
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
      
      // Check if we have a pending session to join
      if (this.sessionState.pendingSession) {
        console.log(`SocketConnectionManager: Connecting to pending session ${this.sessionState.pendingSession}`);
        this.joinSession(this.sessionState.pendingSession);
      } else if (this.sessionState.currentSessionId && !this.sessionState.hasJoined) {
        // Re-join current session if we have one but haven't joined yet
        console.log(`SocketConnectionManager: Reconnecting to session ${this.sessionState.currentSessionId}`);
        this.joinSession(this.sessionState.currentSessionId);
      }
    });
    
    this.socket.on(WebSocketEvent.DISCONNECT, (reason: string) => {
      console.log(`SocketConnectionManager: Disconnected: ${reason}`);
      this.setStatus(ConnectionStatus.DISCONNECTED);
    });
    
    this.socket.on(WebSocketEvent.ERROR, (error: Error | string | Record<string, unknown>) => {
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
      
      this.socket.io.on('reconnect_error', (error: Error | string | Record<string, unknown>) => {
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
   * 
   * This method is idempotent - calling it multiple times with the same sessionId
   * will only join the session once. This prevents unnecessary WebSocket traffic
   * when React components re-render.
   * 
   * If not currently connected, the session ID is stored and joined automatically
   * once the connection is established.
   * 
   * @param sessionId The ID of the session to join
   * @emits 'session_change' when the session changes successfully
   * @emits 'session_join_attempt' when attempting to join a session
   * @emits 'session_join_success' when successfully joining a session
   * @emits 'session_join_failure' when failing to join a session
   */
  public joinSession(sessionId: string): void {
    // Emit attempt event for tracking/debugging
    this.emit('session_join_attempt', sessionId);
    
    // If we're already in this session, do nothing to prevent unnecessary traffic
    if (this.sessionState.currentSessionId === sessionId && this.sessionState.hasJoined) {
      console.log(`SocketConnectionManager: Already joined session ${sessionId}, ignoring duplicate join request`);
      return;
    }
    
    if (!this.socket || !this.isConnected()) {
      console.log(`SocketConnectionManager: Cannot join session ${sessionId} immediately: not connected`);
      // Store for later when we connect
      this.sessionState.pendingSession = sessionId;
      return;
    }
    
    // Leave current session if different
    if (this.sessionState.currentSessionId && 
        this.sessionState.currentSessionId !== sessionId && 
        this.sessionState.hasJoined) {
      // Emit leave event for current session
      this.socket.emit(WebSocketEvent.LEAVE_SESSION, this.sessionState.currentSessionId);
      console.log(`SocketConnectionManager: Left previous session ${this.sessionState.currentSessionId}`);
    }
    
    // Set session ID before emitting to ensure state consistency
    const previousSession = this.sessionState.currentSessionId;
    this.sessionState.currentSessionId = sessionId;
    
    // Join new session via WebSocket
    try {
      this.socket.emit(WebSocketEvent.JOIN_SESSION, sessionId);
      this.sessionState.hasJoined = true;
      
      // Clear pending session since we've joined successfully
      this.sessionState.pendingSession = null;
      
      // Emit events
      this.emit('session_join_success', sessionId);
      
      // Only emit session_change if the session actually changed
      if (previousSession !== sessionId) {
        this.emit('session_change', sessionId);
      }
      
      console.log(`SocketConnectionManager: Joined session ${sessionId}`);
    } catch (error) {
      console.error(`SocketConnectionManager: Failed to join session ${sessionId}:`, error);
      this.emit('session_join_failure', { sessionId, error });
      
      // Reset session state on failure
      this.sessionState.hasJoined = false;
      this.sessionState.currentSessionId = previousSession;
    }
  }
  
  /**
   * Leave a session
   * 
   * This method is idempotent - calling it multiple times with the same sessionId
   * or when not in a session will not cause errors. This prevents issues during
   * React component lifecycle changes.
   * 
   * @param sessionId The ID of the session to leave
   * @emits 'session_change' when the session changes successfully
   * @emits 'session_leave_attempt' when attempting to leave a session
   * @emits 'session_leave_success' when successfully leaving a session
   */
  public leaveSession(sessionId: string): void {
    // Emit attempt event for tracking/debugging
    this.emit('session_leave_attempt', sessionId);
    
    // If we're not in this session, do nothing
    if (this.sessionState.currentSessionId !== sessionId || !this.sessionState.hasJoined) {
      console.log(`SocketConnectionManager: Not in session ${sessionId}, ignoring leave request`);
      return;
    }
    
    if (!this.socket || !this.isConnected()) {
      console.log(`SocketConnectionManager: Cannot leave session ${sessionId} via WebSocket: not connected`);
      // Still update the internal state
      this.sessionState.currentSessionId = null;
      this.sessionState.hasJoined = false;
      this.emit('session_change', null);
      this.emit('session_leave_success', sessionId);
      return;
    }
    
    // Emit leave event for current session
    try {
      this.socket.emit(WebSocketEvent.LEAVE_SESSION, sessionId);
      
      // Update session state
      this.sessionState.currentSessionId = null;
      this.sessionState.hasJoined = false;
      
      // Emit events
      this.emit('session_change', null);
      this.emit('session_leave_success', sessionId);
      
      console.log(`SocketConnectionManager: Left session ${sessionId}`);
    } catch (error) {
      console.error(`SocketConnectionManager: Error leaving session ${sessionId}:`, error);
      
      // Force state update even on error
      this.sessionState.currentSessionId = null;
      this.sessionState.hasJoined = false;
      this.emit('session_change', null);
    }
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
   * Reset the connection manager (for testing or recovery)
   * 
   * Completely resets all state and connection information.
   */
  public reset(): void {
    this.disconnect();
    this.removeAllListeners();
    this.connectionStatus = ConnectionStatus.DISCONNECTED;
    this.reconnectAttempts = 0;
    
    // Reset session state
    this.sessionState = {
      currentSessionId: null,
      hasJoined: false,
      pendingSession: null
    };
    
    // Emit session change event
    this.emit('session_change', null);
  }
}

// Export a utility function to get the instance
export const getSocketConnectionManager = (): SocketConnectionManager => {
  return SocketConnectionManager.getInstance();
};

// Default export for simplicity
export default SocketConnectionManager;