/**
 * React hook for WebSocket connectivity using React Context
 * 
 * This hook provides a stable interface for components to interact with the WebSocketContext.
 * It is a thin wrapper around the WebSocketContext that provides event subscription methods
 * without attempting to manage sessions.
 * 
 * IMPORTANT: This hook no longer attempts to join/leave sessions based on the sessionId prop.
 * Session management is now handled by the SocketConnectionManager directly, which
 * maintains state independently from React's render cycle.
 */
import { useCallback } from 'react';
import { useWebSocketContext } from '../context/WebSocketContext';
import { WebSocketEvent, WebSocketEventMap } from '../types/api';
import { getSocketConnectionManager } from '@/utils/websocket';

/**
 * Hook for WebSocket event subscription
 * Provides a simple interface for interacting with WebSockets
 */
export function useWebSocket() {
  // Get WebSocket context for connection status and event methods
  const context = useWebSocketContext();
  
  // Get connection manager for direct operations (if needed)
  const connectionManager = getSocketConnectionManager();
  
  // Subscribe to a WebSocket event with a stable callback reference
  const subscribe = useCallback(<T extends WebSocketEvent>(
    event: T, 
    callback: (data: WebSocketEventMap[T]) => void
  ) => {
    return context.on(event, callback);
  }, [context.on]); // Only depend on the stable on() method
  
  // Subscribe to a batch of WebSocket events with a stable callback reference
  const subscribeToBatch = useCallback(<T extends WebSocketEvent>(
    event: T, 
    callback: (data: Array<{ timestamp: number; data: WebSocketEventMap[T] }>) => void
  ) => {
    return context.onBatch(event, callback);
  }, [context.onBatch]); // Only depend on the stable onBatch() method
  
  // Return a stable API object with just connection status and event subscription methods
  // Note: No longer including methods for joining/leaving sessions - use SocketConnectionManager directly
  return {
    // Connection status information
    connectionStatus: context.connectionStatus,
    isConnected: context.isConnected,
    reconnectAttempts: context.reconnectAttempts,
    
    // Current session information from the connection manager (not context)
    currentSessionId: connectionManager.getCurrentSessionId(),
    
    // Event subscription methods
    subscribe,
    subscribeToBatch,
    
    // Connection management methods
    reconnect: context.reconnect,
    
    // No longer exposing session management methods directly
    // but keeping them for backward compatibility
    joinSession: connectionManager.joinSession.bind(connectionManager),
    leaveSession: connectionManager.leaveSession.bind(connectionManager),
  };
}

export default useWebSocket;