/**
 * Hook for connecting WebSocket to Terminal interface using React Context
 */
import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { useTerminal } from '@/context/TerminalContext';
import { ConnectionStatus } from '@/types/api';

/**
 * Hook that connects WebSocket events to Terminal UI
 */
export function useTerminalWebSocket(sessionId?: string) {
  const [hasJoined, setHasJoined] = useState(false);
  const { connectionStatus, isConnected, joinSession, leaveSession } = useWebSocket();
  const { addSystemMessage, addErrorMessage } = useTerminal();
  
  // Join the session when sessionId changes and we're connected
  useEffect(() => {
    if (!sessionId || !isConnected) return;
    
    // Don't attempt to join if we've already joined
    if (!hasJoined) {
      console.log(`[useTerminalWebSocket] Joining session ${sessionId} (connected: ${isConnected})`);
      
      // Directly join the session without delay
      joinSession(sessionId);
      setHasJoined(true);
      addSystemMessage(`Connected to session: ${sessionId}`);
    }
    
    // Clean up when unmounting or when sessionId changes
    return () => {
      if (hasJoined && sessionId) {
        console.log(`[useTerminalWebSocket] Leaving session ${sessionId}`);
        leaveSession(sessionId);
        setHasJoined(false);
        addSystemMessage('Disconnected from session');
      }
    };
  }, [sessionId, hasJoined, isConnected, joinSession, leaveSession, addSystemMessage]);
  
  // Monitor connection status changes
  useEffect(() => {
    // Always handle connection status changes, even if we don't have a session
    // This ensures tests work correctly too
    switch (connectionStatus) {
      case ConnectionStatus.CONNECTED:
        if (hasJoined) {
          addSystemMessage('WebSocket connection established');
        }
        break;
        
      case ConnectionStatus.RECONNECTING:
        addSystemMessage('Reconnecting WebSocket...');
        break;
        
      case ConnectionStatus.ERROR:
        addErrorMessage('WebSocket connection error');
        break;
        
      case ConnectionStatus.DISCONNECTED:
        if (hasJoined) {
          addErrorMessage('WebSocket disconnected');
        }
        break;
    }
  }, [connectionStatus, hasJoined, addSystemMessage, addErrorMessage]);
  
  // Function to connect to a session
  const connect = useCallback((sid: string) => {
    if (!sid || hasJoined) return false;
    
    joinSession(sid);
    setHasJoined(true);
    addSystemMessage(`Connected to session: ${sid}`);
    return true;
  }, [hasJoined, joinSession, addSystemMessage]);
  
  // Function to disconnect from a session
  const disconnect = useCallback(() => {
    if (!sessionId || !hasJoined) return false;
    
    leaveSession(sessionId);
    setHasJoined(false);
    addSystemMessage('Disconnected from session');
    return true;
  }, [sessionId, hasJoined, leaveSession, addSystemMessage]);
  
  return {
    connectionStatus,
    isConnected,
    hasJoined,
    connect,
    disconnect,
  };
}

export default useTerminalWebSocket;