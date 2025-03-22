/**
 * React hook for WebSocket connectivity
 */
import { useState, useEffect, useCallback } from 'react';
import { webSocketService } from '../services/WebSocketService';
import { ConnectionStatus, WebSocketEvent, WebSocketEventMap } from '../types/api';

/**
 * Hook for WebSocket connection management
 */
export function useWebSocket(sessionId?: string) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    webSocketService.getConnectionStatus()
  );
  
  // Join session if provided
  useEffect(() => {
    if (sessionId) {
      webSocketService.joinSession(sessionId);
      
      // Clean up when unmounting or when sessionId changes
      return () => {
        webSocketService.leaveSession(sessionId);
      };
    }
  }, [sessionId]);
  
  // Listen for connection status changes
  useEffect(() => {
    const handleConnectionStatusChange = (status: ConnectionStatus) => {
      setConnectionStatus(status);
    };
    
    webSocketService.on('connectionStatusChanged', handleConnectionStatusChange);
    
    // Clean up event listener
    return () => {
      webSocketService.off('connectionStatusChanged', handleConnectionStatusChange);
    };
  }, []);
  
  // Subscribe to a WebSocket event
  const subscribe = useCallback(<T extends WebSocketEvent>(
    event: T, 
    callback: (data: WebSocketEventMap[T]) => void
  ) => {
    webSocketService.on(event, callback);
    return () => {
      webSocketService.off(event, callback);
    };
  }, []);
  
  // Subscribe to a batch of WebSocket events
  const subscribeToBatch = useCallback(<T extends WebSocketEvent>(
    event: T, 
    callback: (data: Array<{ timestamp: number; data: WebSocketEventMap[T] }>) => void
  ) => {
    const batchEvent = `${event}:batch`;
    webSocketService.on(batchEvent, callback);
    return () => {
      webSocketService.off(batchEvent, callback);
    };
  }, []);
  
  // Manually reconnect
  const reconnect = useCallback(() => {
    webSocketService.reconnect();
  }, []);
  
  // Join a session
  const joinSession = useCallback((id: string) => {
    webSocketService.joinSession(id);
  }, []);
  
  // Leave a session
  const leaveSession = useCallback((id: string) => {
    webSocketService.leaveSession(id);
  }, []);
  
  return {
    connectionStatus,
    isConnected: connectionStatus === ConnectionStatus.CONNECTED,
    subscribe,
    subscribeToBatch,
    reconnect,
    joinSession,
    leaveSession,
  };
}

export default useWebSocket;