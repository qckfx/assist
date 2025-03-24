/**
 * React hook for WebSocket connectivity using React Context
 * 
 * This hook provides a stable interface for components to interact with the WebSocketContext.
 * It uses refs to track previous values and prevent unnecessary re-renders.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useWebSocketContext } from '../context/WebSocketContext';
import { WebSocketEvent, WebSocketEventMap } from '../types/api';

/**
 * Hook for WebSocket connection management
 * Provides a simple interface for interacting with WebSockets
 */
export function useWebSocket(sessionId?: string) {
  // Get WebSocket context
  const context = useWebSocketContext();
  
  // Use refs to track previous values to prevent unnecessary effects
  const prevSessionIdRef = useRef<string | undefined>(undefined);
  const prevCurrentSessionIdRef = useRef<string | null>(null);
  const prevIsConnectedRef = useRef<boolean>(false);
  
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
  
  // Join a session if provided
  // Using multiple conditions to prevent excessive effect triggering
  useEffect(() => {
    // Update refs to track current values
    const prevSessionId = prevSessionIdRef.current;
    const prevCurrentSessionId = prevCurrentSessionIdRef.current;
    const prevIsConnected = prevIsConnectedRef.current;
    
    // Store current values for next render
    prevSessionIdRef.current = sessionId;
    prevCurrentSessionIdRef.current = context.currentSessionId;
    prevIsConnectedRef.current = context.isConnected;
    
    // Check if we need to join session
    const sessionIdChanged = sessionId !== prevSessionId;
    const currentSessionIdChanged = context.currentSessionId !== prevCurrentSessionId;
    const isConnectedChanged = context.isConnected !== prevIsConnected;
    
    // Only join if we have a session ID that differs from current and we're connected
    if (
      sessionId && 
      context.isConnected && 
      context.currentSessionId !== sessionId &&
      // Only trigger if something relevant changed
      (sessionIdChanged || currentSessionIdChanged || (isConnectedChanged && context.isConnected))
    ) {
      console.log(`[useWebSocket] Joining session ${sessionId} (connected: ${context.isConnected})`);
      context.joinSession(sessionId);
    }
  }, [sessionId, context.currentSessionId, context.isConnected, context.joinSession]);
  
  // Return a stable API object with only the necessary methods
  return {
    connectionStatus: context.connectionStatus,
    isConnected: context.isConnected,
    reconnectAttempts: context.reconnectAttempts,
    currentSessionId: context.currentSessionId,
    subscribe,
    subscribeToBatch,
    reconnect: context.reconnect,
    joinSession: context.joinSession,
    leaveSession: context.leaveSession,
  };
}

export default useWebSocket;