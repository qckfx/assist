import { useState, useEffect } from 'react';
import { useWebSocketContext } from '../context/WebSocketContext';
import { ConnectionStatus } from '../types/api';

/**
 * Hook to provide connection status and visual indicators
 * This is now a wrapper around the WebSocketContext to maintain API compatibility
 */
export function useConnectionStatus() {
  const { 
    connectionStatus, 
    isConnected, 
    reconnectAttempts, 
    connect: contextConnect, 
    disconnect: contextDisconnect 
  } = useWebSocketContext();
  
  const [lastError, setLastError] = useState<Error | null>(null);
  
  // Set up error tracking from the connection status
  useEffect(() => {
    if (connectionStatus === ConnectionStatus.ERROR) {
      setLastError(new Error('WebSocket connection error'));
    } else if (connectionStatus === ConnectionStatus.CONNECTED) {
      setLastError(null); // Clear error when connected
    }
  }, [connectionStatus]);
  
  // Map context's Promise-based connect to this hook's API
  const connect = () => {
    try {
      contextConnect();
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  };
  
  const disconnect = () => {
    contextDisconnect();
  };
  
  // Map the ConnectionStatus enum to the string values this hook used to return
  const mapStatus = (status: ConnectionStatus): 'connected' | 'disconnected' | 'connecting' | 'error' => {
    switch (status) {
      case ConnectionStatus.CONNECTED:
        return 'connected';
      case ConnectionStatus.DISCONNECTED:
        return 'disconnected';
      case ConnectionStatus.CONNECTING:
      case ConnectionStatus.RECONNECTING:
        return 'connecting';
      case ConnectionStatus.ERROR:
        return 'error';
      default:
        return 'disconnected';
    }
  };
  
  return {
    status: mapStatus(connectionStatus),
    reconnectAttempts,
    isConnected,
    isConnecting: connectionStatus === ConnectionStatus.CONNECTING || connectionStatus === ConnectionStatus.RECONNECTING,
    isDisconnected: connectionStatus === ConnectionStatus.DISCONNECTED,
    hasError: connectionStatus === ConnectionStatus.ERROR,
    error: lastError,
    // Expose direct methods to control connection
    connect,
    disconnect,
  };
}

export default useConnectionStatus;