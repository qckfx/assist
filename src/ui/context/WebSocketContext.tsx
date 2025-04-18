/**
 * WebSocket Context for React components
 * 
 * This file provides a React Context that manages WebSocket connections,
 * using the SocketConnectionManager and WebSocketMessageBufferManager
 * to handle connections outside of React's render cycle.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { 
  ConnectionStatus, 
  WebSocketEvent,
  WebSocketEventMap
} from '../types/api';
import {
  SocketConnectionManager,
  getSocketConnectionManager,
  WebSocketMessageBufferManager,
  getWebSocketMessageBufferManager
} from '../utils/websocket';

// Type definitions for the context
export interface WebSocketContextValue {
  // Connection state
  connectionStatus: ConnectionStatus;
  isConnected: boolean;
  reconnectAttempts: number;
  
  // Session management
  currentSessionId: string | null;
  joinSession: (sessionId: string) => void;
  leaveSession: (sessionId: string) => void;
  
  // Connection management
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
  
  // Event subscriptions
  on: <T extends WebSocketEvent>(event: T, callback: (data: WebSocketEventMap[T]) => void) => () => void;
  onBatch: <T extends WebSocketEvent>(event: T, callback: (data: Array<{ timestamp: number; data: WebSocketEventMap[T] }>) => void) => () => void;
  
  // For debugging/testing
  socket: Socket | null;
}

// Default context value
const defaultContextValue: WebSocketContextValue = {
  connectionStatus: ConnectionStatus.DISCONNECTED,
  isConnected: false,
  reconnectAttempts: 0,
  currentSessionId: null,
  joinSession: () => {},
  leaveSession: () => {},
  connect: () => {},
  disconnect: () => {},
  reconnect: () => {},
  on: () => () => {},
  onBatch: () => () => {},
  socket: null,
};

// Create the context
export const WebSocketContext = createContext<WebSocketContextValue>(defaultContextValue);

// Custom hook to use the WebSocket context
export const useWebSocketContext = () => useContext(WebSocketContext);

// Provider props
interface WebSocketProviderProps {
  children: React.ReactNode;
  testMode?: boolean;
  mockSocket?: Socket;
}

/**
 * WebSocket Provider component
 * 
 * Provides a React interface to SocketConnectionManager functionality.
 * Keeps reactive state synchronized with ConnectionManager.
 */
export function WebSocketProvider({ 
  children, 
  testMode = false,
  mockSocket,
}: WebSocketProviderProps) {
  // Reference to the ConnectionManager and MessageBufferManager
  const connectionManager = useRef<SocketConnectionManager>(getSocketConnectionManager());
  const messageBuffer = useRef<WebSocketMessageBufferManager>(getWebSocketMessageBufferManager());
  
  // React state for UI updates
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    connectionManager.current.getStatus()
  );
  const [reconnectAttempts, setReconnectAttempts] = useState(
    connectionManager.current.getReconnectAttempts()
  );
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    connectionManager.current.getCurrentSessionId()
  );
  
  // One-time setup of ConnectionManager event listeners
  useEffect(() => {
    const manager = connectionManager.current;
    const buffer = messageBuffer.current;
    
    // Listen for connection status changes
    const handleStatusChange = (status: ConnectionStatus) => {
      console.log(`WebSocketContext: Connection status changed to ${status}`);
      setConnectionStatus(status);
      
      // Auto-reconnect when disconnected
      if (status === ConnectionStatus.DISCONNECTED) {
        console.log('WebSocketContext: Auto-reconnecting due to disconnection');
        // Add slight delay to avoid reconnection storm
        setTimeout(() => {
          manager.reconnect();
        }, 1000);
      }
    };
    
    // Listen for reconnect attempts
    const handleReconnectAttempt = (attempts: number) => {
      console.log(`WebSocketContext: Reconnect attempt ${attempts}`);
      setReconnectAttempts(attempts);
    };
    
    // Listen for session changes
    const handleSessionChange = (sessionId: string | null) => {
      console.log(`WebSocketContext: Session changed to ${sessionId}`);
      setCurrentSessionId(sessionId);
    };
    
    // Set up listeners
    manager.on('status_change', handleStatusChange);
    manager.on('reconnect_attempt', handleReconnectAttempt);
    manager.on('session_change', handleSessionChange);
    
    // Start message buffer
    buffer.start();
    
    // Initialize connection if not in test mode
    if (!testMode && !mockSocket) {
      console.log('WebSocketContext: Initializing connection');
      manager.connect();
    } else if (testMode) {
      console.log('WebSocketContext: Test mode, skipping connection');
      setConnectionStatus(ConnectionStatus.CONNECTED);
    }
    
    // Cleanup function
    return () => {
      console.log('WebSocketContext: Cleaning up');
      
      // Remove event listeners
      manager.off('status_change', handleStatusChange);
      manager.off('reconnect_attempt', handleReconnectAttempt);
      manager.off('session_change', handleSessionChange);
      
      // Stop message buffer
      buffer.stop();
      buffer.removeAllListeners();

      // Disconnect the manager when the provider unmounts
      manager.disconnect(); 
    };
  }, [testMode, mockSocket]); // Only dependencies that affect initialization
  
  // Join a session - stabilized with useCallback
  const joinSession = useCallback((sessionId: string) => {
    console.log(`WebSocketContext: Joining session ${sessionId}`);
    connectionManager.current.joinSession(sessionId);
  }, []);
  
  // Leave a session - stabilized with useCallback
  const leaveSession = useCallback((sessionId: string) => {
    console.log(`WebSocketContext: Leaving session ${sessionId}`);
    connectionManager.current.leaveSession(sessionId);
  }, []);
  
  // Connect to server - stabilized with useCallback
  const connect = useCallback(() => {
    console.log('WebSocketContext: Connecting');
    connectionManager.current.connect();
  }, []);
  
  // Disconnect from server - stabilized with useCallback
  const disconnect = useCallback(() => {
    console.log('WebSocketContext: Disconnecting');
    connectionManager.current.disconnect();
  }, []);
  
  // Manually reconnect - stabilized with useCallback
  const reconnect = useCallback(() => {
    console.log('WebSocketContext: Reconnecting');
    connectionManager.current.reconnect();
  }, []);
  
  // Subscribe to events - stabilized with useCallback
  const on = useCallback(<T extends WebSocketEvent>(
    event: T, 
    callback: (data: WebSocketEventMap[T]) => void
  ) => {
    const socket = connectionManager.current.getSocket();
    if (!socket) {
      console.warn(`WebSocketContext: Cannot subscribe to ${event}, no socket. Will attempt to auto-connect.`);
      
      // Attempt to reconnect if there's no socket
      // This helps in production environments where socket might not be initialized yet
      connectionManager.current.connect();
      
      // Return a dummy unsubscribe function that won't fail if called
      return () => {
        console.log(`Unsubscribing from ${event} (no-op because there was no socket when subscribed)`);
      };
    }
    
    // Set up the listener
    // We need to cast here because Socket.io typings don't match our WebSocketEvent enum perfectly
    socket.on(event as string, callback as (data: unknown) => void);
    
    // Return unsubscribe function
    return () => {
      // Check if socket is still available when unsubscribing
      const currentSocket = connectionManager.current.getSocket();
      if (currentSocket) {
        currentSocket.off(event as string, callback as (data: unknown) => void);
      } else {
        console.log(`Cannot unsubscribe from ${event}, socket no longer available`);
      }
    };
  }, []);
  
  // Subscribe to batch events - stabilized with useCallback
  const onBatch = useCallback(<T extends WebSocketEvent>(
    event: T, 
    callback: (data: Array<{ timestamp: number; data: WebSocketEventMap[T] }>) => void
  ) => {
    const buffer = messageBuffer.current;
    
    try {
      // Set up a buffer listener
      buffer.onFlush(event as string, callback as (items: Array<{ timestamp: number; data: unknown }>) => void);
      
      // Subscribe to raw events to add them to the buffer
      const unsubscribe = on(event, (data) => {
        try {
          buffer.add(event as string, data);
        } catch (error) {
          console.warn(`Error adding event to buffer (${event}):`, error);
        }
      });
      
      // Return combined unsubscribe function with error handling
      return () => {
        try {
          unsubscribe();
        } catch (error) {
          console.warn(`Error during raw event unsubscribe (${event}):`, error);
        }
        
        try {
          buffer.removeListener(event as string);
        } catch (error) {
          console.warn(`Error removing buffer listener (${event}):`, error);
        }
      };
    } catch (error) {
      console.warn(`Error setting up batch subscription (${event}):`, error);
      // Return no-op function that won't fail if called
      return () => {};
    }
  }, [on]);
  
  // Create context value with stable references
  const contextValue: WebSocketContextValue = {
    connectionStatus,
    isConnected: connectionStatus === ConnectionStatus.CONNECTED,
    reconnectAttempts,
    currentSessionId,
    joinSession,
    leaveSession,
    connect,
    disconnect,
    reconnect,
    on,
    onBatch,
    socket: connectionManager.current.getSocket(),
  };
  
  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}