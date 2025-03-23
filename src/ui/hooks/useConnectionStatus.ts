import { useState, useEffect, useRef } from 'react';
import { 
  ConnectionManager, 
  ConnectionState,
  ConnectionManagerOptions
} from '../utils/ConnectionManager';

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

/**
 * Hook to provide connection status and visual indicators
 */
export function useConnectionStatus(options: ConnectionManagerOptions = {}) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastError, setLastError] = useState<Error | null>(null);
  const connectionManager = useRef<ConnectionManager | null>(null);
  
  // Effect to set up connection monitoring
  useEffect(() => {
    // Create the connection manager if it doesn't exist
    if (!connectionManager.current) {
      connectionManager.current = new ConnectionManager(options);
    }
    
    const manager = connectionManager.current;
    
    // Initial connection attempt
    manager.connect().catch((error) => {
      setLastError(error instanceof Error ? error : new Error(String(error)));
    });
    
    // Set up event handlers
    const handleStateChange = (state: ConnectionState) => {
      setStatus(state);
    };
    
    const handleReconnecting = (attempts: number) => {
      setReconnectAttempts(attempts);
    };
    
    const handleError = (error: Error) => {
      setLastError(error);
    };
    
    manager.on('state_change', handleStateChange);
    manager.on('reconnecting', handleReconnecting);
    manager.on('error', handleError);
    
    // Set initial state
    setStatus(manager.getState());
    
    // Clean up
    return () => {
      if (manager) {
        manager.removeListener('state_change', handleStateChange);
        manager.removeListener('reconnecting', handleReconnecting);
        manager.removeListener('error', handleError);
        manager.dispose();
        connectionManager.current = null;
      }
    };
  }, [options]);
  
  const connect = () => {
    if (connectionManager.current) {
      return connectionManager.current.connect();
    }
    return Promise.reject(new Error('Connection manager not initialized'));
  };
  
  const disconnect = () => {
    if (connectionManager.current) {
      connectionManager.current.disconnect();
    }
  };
  
  return {
    status,
    reconnectAttempts,
    isConnected: status === 'connected',
    isConnecting: status === 'connecting',
    isDisconnected: status === 'disconnected',
    hasError: status === 'error',
    error: lastError,
    // Expose direct methods to control connection
    connect,
    disconnect,
  };
}

export default useConnectionStatus;