/**
 * Utility to manage WebSocket connection stability
 */
import { EventEmitter } from 'events';
import { WebSocketEvent } from '@/types/api';
import { WebSocketServiceFactory } from '../services/factories/WebSocketServiceFactory';

export enum ConnectionState {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  ERROR = 'error',
}

export interface ConnectionManagerOptions {
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  healthCheckInterval?: number;
}

export class ConnectionManager extends EventEmitter {
  private webSocket = WebSocketServiceFactory.getInstance();
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private options: Required<ConnectionManagerOptions>;
  
  constructor(options: ConnectionManagerOptions = {}) {
    super();
    
    this.options = {
      autoReconnect: true,
      maxReconnectAttempts: 10,
      reconnectDelay: 1000,
      healthCheckInterval: 30000,
      ...options,
    };
    
    // Set up event listeners
    this.webSocket.on(WebSocketEvent.CONNECT, this.handleConnect.bind(this));
    this.webSocket.on(WebSocketEvent.DISCONNECT, this.handleDisconnect.bind(this));
    this.webSocket.on(WebSocketEvent.ERROR, this.handleError.bind(this));
    
    // Start health check
    this.startHealthCheck();
  }
  
  /**
   * Connect to the WebSocket server
   */
  public connect(): Promise<void> {
    if (this.state === ConnectionState.CONNECTED) {
      return Promise.resolve();
    }
    
    this.setState(ConnectionState.CONNECTING);
    
    return new Promise((resolve, reject) => {
      // Set up one-time connect listener
      const connectHandler = () => {
        this.setState(ConnectionState.CONNECTED);
        this.reconnectAttempts = 0;
        this.webSocket.off(WebSocketEvent.CONNECT, connectHandler);
        this.webSocket.off(WebSocketEvent.ERROR, errorHandler);
        resolve();
      };
      
      // Set up one-time error listener
      const errorHandler = (error: any) => {
        this.setState(ConnectionState.ERROR);
        this.webSocket.off(WebSocketEvent.CONNECT, connectHandler);
        this.webSocket.off(WebSocketEvent.ERROR, errorHandler);
        
        // Attempt reconnect if enabled
        if (this.options.autoReconnect) {
          this.handleReconnect();
        }
        
        reject(error);
      };
      
      // Add listeners
      this.webSocket.on(WebSocketEvent.CONNECT, connectHandler);
      this.webSocket.on(WebSocketEvent.ERROR, errorHandler);
      
      // Initialize connection
      this.webSocket.connect();
    });
  }
  
  /**
   * Disconnect from the WebSocket server
   */
  public disconnect(): void {
    this.stopHealthCheck();
    this.webSocket.disconnect();
    this.setState(ConnectionState.DISCONNECTED);
  }
  
  /**
   * Get the current connection state
   */
  public getState(): ConnectionState {
    return this.state;
  }
  
  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }
  
  /**
   * Handle connection events
   */
  private handleConnect(): void {
    this.setState(ConnectionState.CONNECTED);
    this.reconnectAttempts = 0;
  }
  
  /**
   * Handle disconnection events
   */
  private handleDisconnect(reason: string): void {
    this.setState(ConnectionState.DISCONNECTED);
    
    // Attempt to reconnect if enabled
    if (this.options.autoReconnect) {
      this.handleReconnect();
    }
  }
  
  /**
   * Handle error events
   */
  private handleError(error: Error): void {
    this.setState(ConnectionState.ERROR);
    
    // Attempt to reconnect if enabled
    if (this.options.autoReconnect) {
      this.handleReconnect();
    }
  }
  
  /**
   * Handle reconnection attempts
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.emit('reconnect_failed', 'Maximum reconnection attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    this.setState(ConnectionState.CONNECTING);
    
    // Calculate backoff delay
    const delay = Math.min(
      this.options.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
      30000 // max 30 seconds
    );
    
    this.emit('reconnecting', this.reconnectAttempts);
    
    setTimeout(() => {
      this.webSocket.connect();
    }, delay);
  }
  
  /**
   * Set the connection state and emit events
   */
  private setState(state: ConnectionState): void {
    if (this.state === state) {
      return;
    }
    
    this.state = state;
    this.emit('state_change', state);
    this.emit(state);
  }
  
  /**
   * Start health check interval
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    this.healthCheckTimer = setInterval(() => {
      if (!this.webSocket.isConnected() && this.state === ConnectionState.CONNECTED) {
        // Socket says disconnected but we think we're connected
        this.setState(ConnectionState.DISCONNECTED);
        
        if (this.options.autoReconnect) {
          this.handleReconnect();
        }
      }
    }, this.options.healthCheckInterval);
  }
  
  /**
   * Stop health check interval
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }
  
  /**
   * Clean up resources
   */
  public dispose(): void {
    this.stopHealthCheck();
    this.disconnect();
    
    this.webSocket.removeAllListeners(WebSocketEvent.CONNECT);
    this.webSocket.removeAllListeners(WebSocketEvent.DISCONNECT);
    this.webSocket.removeAllListeners(WebSocketEvent.ERROR);
  }
}

export default ConnectionManager;