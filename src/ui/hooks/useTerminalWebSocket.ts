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
  
  // Join the session when sessionId changes
  useEffect(() => {
    if (!sessionId) return;
    
    if (!hasJoined) {
      joinSession(sessionId);
      setHasJoined(true);
      
      // Log connection info
      addSystemMessage(`Connected to session: ${sessionId}`);
    }
    
    // Clean up when unmounting or when sessionId changes
    return () => {
      if (hasJoined && sessionId) {
        leaveSession(sessionId);
        setHasJoined(false);
        addSystemMessage('Disconnected from session');
      }
    };
  }, [sessionId, hasJoined, joinSession, leaveSession, addSystemMessage]);
  
  // Monitor connection status changes
  useEffect(() => {
    if (!sessionId || !hasJoined) return;
    
    // Handle different connection states
    switch (connectionStatus) {
      case ConnectionStatus.CONNECTED:
        addSystemMessage('WebSocket connection established');
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
  }, [connectionStatus, hasJoined, sessionId, addSystemMessage, addErrorMessage]);
  
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