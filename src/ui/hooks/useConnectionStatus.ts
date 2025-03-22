/**
 * React hook for connection status management
 */
import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { ConnectionStatus } from '../types/api';

/**
 * Hook for monitoring connection status
 */
export function useConnectionStatus() {
  const { connectionStatus, reconnect } = useWebSocket();
  const [hasBeenConnected, setHasBeenConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [reconnectMessage, setReconnectMessage] = useState<string | null>(null);
  
  // Track connection status changes
  useEffect(() => {
    if (connectionStatus === ConnectionStatus.CONNECTED) {
      setHasBeenConnected(true);
      setReconnectAttempts(0);
      setReconnectMessage(null);
    } else if (connectionStatus === ConnectionStatus.RECONNECTING) {
      setReconnectAttempts((prev) => prev + 1);
      setReconnectMessage(`Reconnecting... Attempt ${reconnectAttempts + 1}`);
    } else if (connectionStatus === ConnectionStatus.ERROR) {
      setReconnectMessage('Connection error. Click to reconnect.');
    } else if (connectionStatus === ConnectionStatus.DISCONNECTED && hasBeenConnected) {
      setReconnectMessage('Disconnected. Click to reconnect.');
    }
  }, [connectionStatus, hasBeenConnected, reconnectAttempts]);
  
  // Function to attempt manual reconnection
  const attemptReconnect = useCallback(() => {
    setReconnectMessage('Reconnecting...');
    reconnect();
  }, [reconnect]);
  
  // Format a user-friendly status message
  const getStatusMessage = useCallback(() => {
    switch (connectionStatus) {
      case ConnectionStatus.CONNECTING:
        return 'Connecting...';
      case ConnectionStatus.CONNECTED:
        return 'Connected';
      case ConnectionStatus.DISCONNECTED:
        return hasBeenConnected ? 'Disconnected' : 'Not connected';
      case ConnectionStatus.RECONNECTING:
        return `Reconnecting (Attempt ${reconnectAttempts + 1})`;
      case ConnectionStatus.ERROR:
        return 'Connection error';
      default:
        return 'Unknown status';
    }
  }, [connectionStatus, hasBeenConnected, reconnectAttempts]);
  
  return {
    connectionStatus,
    isConnected: connectionStatus === ConnectionStatus.CONNECTED,
    isReconnecting: connectionStatus === ConnectionStatus.RECONNECTING,
    hasError: connectionStatus === ConnectionStatus.ERROR,
    statusMessage: getStatusMessage(),
    reconnectMessage,
    reconnectAttempts,
    attemptReconnect,
  };
}

export default useConnectionStatus;