/**
 * WebSocket Context for React components
 * 
 * This file provides a React Context that manages WebSocket connections,
 * replacing the EventEmitter-based WebSocketService with a React-friendly approach.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  ConnectionStatus, 
  WebSocketEvent,
  WebSocketEventMap
} from '../types/api';
import {
  SOCKET_URL,
  SOCKET_RECONNECTION_ATTEMPTS,
  SOCKET_RECONNECTION_DELAY,
  SOCKET_RECONNECTION_DELAY_MAX,
  SOCKET_TIMEOUT
} from '../config/api';

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
 * Manages the WebSocket connection and provides access to WebSocket
 * functionality through React Context.
 */
export function WebSocketProvider({ 
  children, 
  testMode = false,
  mockSocket = null,
}: WebSocketProviderProps) {
  // Connection state
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  // Message buffer for batch processing
  const messageBufferRef = useRef<Map<string, Array<any>>>(new Map());
  const flushIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize socket connection
  const initializeSocket = useCallback(() => {
    // Skip for test mode
    if (testMode && !mockSocket) {
      console.log('WebSocketContext: Test mode enabled, using mock connection');
      setConnectionStatus(ConnectionStatus.CONNECTED);
      return;
    }

    // Clean up any existing socket
    if (socket) {
      socket.disconnect();
    }

    // Update status to connecting
    setConnectionStatus(ConnectionStatus.CONNECTING);

    // Create socket instance
    const newSocket = mockSocket || io(SOCKET_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: SOCKET_RECONNECTION_ATTEMPTS,
      reconnectionDelay: SOCKET_RECONNECTION_DELAY,
      reconnectionDelayMax: SOCKET_RECONNECTION_DELAY_MAX,
      timeout: SOCKET_TIMEOUT,
      forceNew: true,
    });

    // Set up socket event handlers
    newSocket.on(WebSocketEvent.CONNECT, () => {
      console.log('WebSocketContext: Connected to server');
      setConnectionStatus(ConnectionStatus.CONNECTED);
      setReconnectAttempts(0);
      
      // Rejoin session if needed
      if (currentSessionId) {
        newSocket.emit(WebSocketEvent.JOIN_SESSION, currentSessionId);
      }
    });

    newSocket.on(WebSocketEvent.DISCONNECT, (reason: string) => {
      console.log(`WebSocketContext: Disconnected: ${reason}`);
      setConnectionStatus(ConnectionStatus.DISCONNECTED);
    });

    newSocket.on(WebSocketEvent.ERROR, (error: any) => {
      console.error('WebSocketContext: Connection error:', error);
      setConnectionStatus(ConnectionStatus.ERROR);
    });

    newSocket.io.on('reconnect_attempt', (attempt: number) => {
      console.log(`WebSocketContext: Reconnection attempt ${attempt}`);
      setReconnectAttempts(attempt);
      setConnectionStatus(ConnectionStatus.RECONNECTING);
    });

    // Set the socket
    setSocket(newSocket);

    // Start buffer flush interval
    if (flushIntervalRef.current) {
      clearInterval(flushIntervalRef.current);
    }
    
    flushIntervalRef.current = setInterval(() => {
      flushBuffers();
    }, 100);

    // Clean up function
    return () => {
      console.log('WebSocketContext: Running socket initialization cleanup');
      
      if (newSocket) {
        // Remove all socket event listeners first
        newSocket.off();
        
        // Also clean up socket.io listeners
        if (newSocket.io) {
          newSocket.io.off();
        }
        
        // Disconnect
        newSocket.disconnect();
        
        console.log('WebSocketContext: Disconnected socket in cleanup');
      }
      
      if (flushIntervalRef.current) {
        clearInterval(flushIntervalRef.current);
        flushIntervalRef.current = null;
        console.log('WebSocketContext: Cleared flush interval in cleanup');
      }
      
      // Help with garbage collection by nullifying references
      // This is especially important for socket.io which can retain references
      if (socket) {
        setSocket(null);
      }
    };
  }, [testMode, mockSocket, socket, currentSessionId]);

  // Effect to initialize socket on mount
  useEffect(() => {
    const cleanup = initializeSocket();
    
    // Clean up when component unmounts
    return () => {
      if (cleanup) cleanup();
      
      // IMPORTANT: Thorough cleanup to prevent memory leaks
      
      // 1. Clear timers
      if (flushIntervalRef.current) {
        clearInterval(flushIntervalRef.current);
        flushIntervalRef.current = null;
      }
      
      // 2. Disconnect and clean up socket
      if (socket) {
        // Remove all socket event listeners
        socket.off();
        
        // Clean up socket.io reconnection listeners
        if (socket.io) {
          socket.io.off();
        }
        
        // Disconnect the socket
        socket.disconnect();
        
        // Clear reference
        setSocket(null);
      }
      
      // 3. Clear data structures
      messageBufferRef.current.clear();
      
      // 4. Reset state
      setConnectionStatus(ConnectionStatus.DISCONNECTED);
      setReconnectAttempts(0);
      setCurrentSessionId(null);
      
      console.log('WebSocketContext: Completed thorough cleanup on unmount');
    };
  }, [initializeSocket]);

  // Add an event to the buffer for batch processing
  const bufferEvent = useCallback((event: string, data: any) => {
    if (!messageBufferRef.current.has(event)) {
      messageBufferRef.current.set(event, []);
    }
    
    const buffer = messageBufferRef.current.get(event);
    if (buffer) {
      buffer.push({
        timestamp: Date.now(),
        data
      });
    }
  }, []);

  // Flush all buffered events
  const flushBuffers = useCallback(() => {
    if (!socket) return;
    
    messageBufferRef.current.forEach((messages, event) => {
      if (messages.length > 0) {
        socket.emit(`${event}:batch`, messages);
        messageBufferRef.current.set(event, []);
      }
    });
  }, [socket]);

  // Join a session
  const joinSession = useCallback((sessionId: string) => {
    if (!socket || connectionStatus !== ConnectionStatus.CONNECTED) {
      // Store for later use when connected
      setCurrentSessionId(sessionId);
      console.log(`WebSocketContext: Will join session ${sessionId} when connected`);
      return;
    }

    // Leave current session if different
    if (currentSessionId && currentSessionId !== sessionId) {
      socket.emit(WebSocketEvent.LEAVE_SESSION, currentSessionId);
    }

    // Join new session
    socket.emit(WebSocketEvent.JOIN_SESSION, sessionId);
    setCurrentSessionId(sessionId);
    console.log(`WebSocketContext: Joined session ${sessionId}`);
  }, [socket, connectionStatus, currentSessionId]);

  // Leave a session
  const leaveSession = useCallback((sessionId: string) => {
    if (!socket || connectionStatus !== ConnectionStatus.CONNECTED) {
      console.log(`WebSocketContext: Cannot leave session ${sessionId}: not connected`);
      return;
    }

    socket.emit(WebSocketEvent.LEAVE_SESSION, sessionId);
    
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
    }
    
    console.log(`WebSocketContext: Left session ${sessionId}`);
  }, [socket, connectionStatus, currentSessionId]);

  // Connect to server
  const connect = useCallback(() => {
    initializeSocket();
  }, [initializeSocket]);

  // Disconnect from server
  const disconnect = useCallback(() => {
    if (socket) {
      socket.disconnect();
      setConnectionStatus(ConnectionStatus.DISCONNECTED);
    }
    
    if (flushIntervalRef.current) {
      clearInterval(flushIntervalRef.current);
      flushIntervalRef.current = null;
    }
  }, [socket]);

  // Manually reconnect
  const reconnect = useCallback(() => {
    if (socket) {
      socket.connect();
    } else {
      initializeSocket();
    }
  }, [socket, initializeSocket]);

  // Subscribe to events
  const on = useCallback(<T extends WebSocketEvent>(
    event: T, 
    callback: (data: WebSocketEventMap[T]) => void
  ) => {
    if (!socket) return () => {};
    
    // Set up the listener
    socket.on(event, callback);
    
    // Return unsubscribe function
    return () => {
      socket.off(event, callback);
    };
  }, [socket]);

  // Subscribe to batch events
  const onBatch = useCallback(<T extends WebSocketEvent>(
    event: T, 
    callback: (data: Array<{ timestamp: number; data: WebSocketEventMap[T] }>) => void
  ) => {
    if (!socket) return () => {};
    
    const batchEvent = `${event}:batch`;
    socket.on(batchEvent, callback);
    
    return () => {
      socket.off(batchEvent, callback);
    };
  }, [socket]);

  // Create context value
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
    socket,
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}