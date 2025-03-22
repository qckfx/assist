/**
 * React hook for WebSocket connectivity using React Context
 */
import { useCallback } from 'react';
import { useWebSocketContext } from '../context/WebSocketContext';
import { WebSocketEvent, WebSocketEventMap } from '../types/api';

/**
 * Hook for WebSocket connection management
 * Provides a simple interface for interacting with WebSockets
 */
export function useWebSocket(sessionId?: string) {
  // Get WebSocket context
  const context = useWebSocketContext();
  
  // Subscribe to a WebSocket event
  const subscribe = useCallback(<T extends WebSocketEvent>(
    event: T, 
    callback: (data: WebSocketEventMap[T]) => void
  ) => {
    return context.on(event, callback);
  }, [context]);
  
  // Subscribe to a batch of WebSocket events
  const subscribeToBatch = useCallback(<T extends WebSocketEvent>(
    event: T, 
    callback: (data: Array<{ timestamp: number; data: WebSocketEventMap[T] }>) => void
  ) => {
    return context.onBatch(event, callback);
  }, [context]);
  
  // Join a session if provided
  if (sessionId && context.currentSessionId !== sessionId) {
    context.joinSession(sessionId);
  }
  
  return {
    connectionStatus: context.connectionStatus,
    isConnected: context.isConnected,
    reconnectAttempts: context.reconnectAttempts,
    subscribe,
    subscribeToBatch,
    reconnect: context.reconnect,
    joinSession: context.joinSession,
    leaveSession: context.leaveSession,
  };
}

export default useWebSocket;