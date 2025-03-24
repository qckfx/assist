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
  maxBackoffDelay?: number;
  healthCheckFailThreshold?: number; // How many health checks can fail before reconnecting
}

export class ConnectionManager extends EventEmitter {
  private webSocket = WebSocketServiceFactory.getInstance();
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private healthCheckFailCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private options: Required<ConnectionManagerOptions>;
  
  constructor(options: ConnectionManagerOptions = {}) {
    super();

    // Log initialization for debugging purposes
    console.log('ConnectionManager: Initializing');
    
    // Get the current stack trace to help debug multiple instances
    const stackTrace = new Error().stack;
    console.log('ConnectionManager initialization stack trace:', stackTrace);
    
    this.options = {
      autoReconnect: true,
      maxReconnectAttempts: 10,
      reconnectDelay: 1000,
      healthCheckInterval: 30000,
      maxBackoffDelay: 30000,
      healthCheckFailThreshold: 2,
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
    
    // Log the disconnect reason
    console.warn(`WebSocket disconnected: ${reason}`);
    
    // Transport close errors require special handling
    if (reason === 'transport close' || reason === 'transport error') {
      // Clear any existing reconnect timer
      this.clearReconnectTimer();
      
      // For transport issues, attempt immediate reconnection with a small delay
      if (this.options.autoReconnect) {
        console.info('Transport close detected, scheduling immediate reconnection attempt');
        this.reconnectTimer = setTimeout(() => {
          this.handleReconnect();
        }, 250); // Minimal delay for transport issues
      }
    } else {
      // For normal disconnects, use standard reconnection
      if (this.options.autoReconnect) {
        this.handleReconnect();
      }
    }
  }
  
  /**
   * Handle error events
   */
  private handleError(error: Error): void {
    this.setState(ConnectionState.ERROR);
    
    // Log the error details
    console.error('WebSocket error:', error);
    
    // Attempt to reconnect if enabled
    if (this.options.autoReconnect) {
      // For errors, clear any existing reconnect timer and try again
      this.clearReconnectTimer();
      this.reconnectTimer = setTimeout(() => {
        this.handleReconnect();
      }, 500); // Slightly longer delay for errors
    }
  }
  
  /**
   * Clear any existing reconnect timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
  
  /**
   * Handle reconnection attempts
   */
  private handleReconnect(): void {
    // Clear any existing reconnect timer
    this.clearReconnectTimer();
    
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.emit('reconnect_failed', 'Maximum reconnection attempts reached');
      
      // Even after max attempts, schedule a final retry with a longer delay
      // This helps with long-running dev sessions that might disconnect temporarily
      this.reconnectTimer = setTimeout(() => {
        console.log('Final reconnection attempt after max attempts reached');
        this.reconnectAttempts = 0; // Reset the counter for a fresh start
        this.webSocket.connect();
      }, 60000); // Try again after a minute
      
      return;
    }
    
    this.reconnectAttempts++;
    this.setState(ConnectionState.CONNECTING);
    
    // Calculate backoff delay with jitter to prevent reconnection storms
    // Base delay with exponential backoff
    const baseDelay = this.options.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
    // Add jitter (±20% randomness)
    const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
    // Apply final delay with max cap
    const delay = Math.min(
      baseDelay + jitter,
      this.options.maxBackoffDelay
    );
    
    console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts} in ${Math.round(delay)}ms`);
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });
    
    // Schedule reconnection
    this.reconnectTimer = setTimeout(() => {
      console.log(`Executing reconnection attempt ${this.reconnectAttempts}`);
      
      // Reset the WebSocket service before reconnecting
      if (this.reconnectAttempts > 2) {
        // For multiple failures, try a harder reset of the connection
        console.log('Performing hard reset of WebSocket connection before reconnecting');
        this.webSocket.reset();
      }
      
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
      const isWebSocketConnected = this.webSocket.isConnected();
      
      // Log health check status periodically
      if (process.env.NODE_ENV === 'development') {
        console.log(
          `Health check: WebSocket.isConnected=${isWebSocketConnected}, ` + 
          `ConnectionManager.state=${this.state}, ` +
          `failCount=${this.healthCheckFailCount}`
        );
      }
      
      if (!isWebSocketConnected && this.state === ConnectionState.CONNECTED) {
        // Socket says disconnected but we think we're connected
        this.healthCheckFailCount++;
        console.warn(`Health check failed (${this.healthCheckFailCount}/${this.options.healthCheckFailThreshold}): WebSocket reports disconnected`);
        
        // Only take action if we've failed enough checks in a row
        if (this.healthCheckFailCount >= this.options.healthCheckFailThreshold) {
          console.error(`Health check threshold reached after ${this.healthCheckFailCount} failures, reconnecting`);
          this.setState(ConnectionState.DISCONNECTED);
          this.healthCheckFailCount = 0; // Reset counter
          
          if (this.options.autoReconnect) {
            this.handleReconnect();
          }
        }
      } else if (isWebSocketConnected && this.state !== ConnectionState.CONNECTED) {
        // Socket says connected but we think we're disconnected
        console.warn('Health check discrepancy: WebSocket reports connected but ConnectionManager shows disconnected');
        this.setState(ConnectionState.CONNECTED);
        this.healthCheckFailCount = 0; // Reset counter
      } else {
        // State is consistent, reset failure counter
        this.healthCheckFailCount = 0;
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
    // Stop all timers
    this.stopHealthCheck();
    this.clearReconnectTimer();
    
    // Disconnect from WebSocket
    this.disconnect();
    
    // Reset all state
    this.reconnectAttempts = 0;
    this.healthCheckFailCount = 0;
    
    // Remove all event listeners
    this.webSocket.removeAllListeners(WebSocketEvent.CONNECT);
    this.webSocket.removeAllListeners(WebSocketEvent.DISCONNECT);
    this.webSocket.removeAllListeners(WebSocketEvent.ERROR);
    
    // Clear this instance's event listeners too
    this.removeAllListeners();
  }
}

export default ConnectionManager;