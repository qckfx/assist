/**
 * Hook for connecting WebSocket to Terminal interface using React Context
 * 
 * This hook connects the WebSocket functionality to the Terminal UI,
 * handling session management and reflecting connection status in the UI.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import { useTerminal } from '@/context/TerminalContext';
import { ConnectionStatus } from '@/types/api';

/**
 * Hook that connects WebSocket events to Terminal UI
 * with improved session management and state tracking
 */
export function useTerminalWebSocket(sessionId?: string) {
  // Track session join state
  const [hasJoined, setHasJoined] = useState(false);
  
  // Track previous values to prevent unnecessary effects
  const prevSessionIdRef = useRef<string | undefined>(undefined);
  const prevConnectionStatusRef = useRef<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const currentSessionIdRef = useRef<string | undefined>(sessionId);
  
  // Use the base WebSocket hook with stable callbacks
  const { 
    connectionStatus, 
    isConnected, 
    currentSessionId: contextSessionId,
    joinSession, 
    leaveSession,
  } = useWebSocket();
  
  // Terminal UI methods for feedback
  const { addSystemMessage, addErrorMessage } = useTerminal();
  
  // Join the session when needed based on tracked state changes
  useEffect(() => {
    // Skip if no session ID provided
    if (!sessionId) return;
    
    // Get previous values for comparison
    const prevSessionId = prevSessionIdRef.current;
    const prevStatus = prevConnectionStatusRef.current;
    
    // Update refs for next render
    prevSessionIdRef.current = sessionId;
    prevConnectionStatusRef.current = connectionStatus;
    currentSessionIdRef.current = sessionId;
    
    // Determine if we need to join based on state changes
    const sessionIdChanged = sessionId !== prevSessionId;
    const justConnected = 
      connectionStatus === ConnectionStatus.CONNECTED && 
      prevStatus !== ConnectionStatus.CONNECTED;
    
    const shouldJoin = 
      isConnected && 
      !hasJoined && 
      (sessionIdChanged || justConnected);
    
    // Join session if needed
    if (shouldJoin) {
      console.log(`[useTerminalWebSocket] Joining session ${sessionId} (connected: ${isConnected})`);
      joinSession(sessionId);
      setHasJoined(true);
      addSystemMessage(`Connected to session: ${sessionId}`);
    }
    
    // Clean up when unmounting or when sessionId changes
    return () => {
      // Only leave if we're actually joined to this session
      if (hasJoined && sessionId === currentSessionIdRef.current) {
        console.log(`[useTerminalWebSocket] Leaving session ${sessionId}`);
        leaveSession(sessionId);
        setHasJoined(false);
        addSystemMessage('Disconnected from session');
      }
    };
  }, [
    sessionId, 
    hasJoined, 
    isConnected, 
    connectionStatus, 
    joinSession, 
    leaveSession, 
    addSystemMessage
  ]);
  
  // Track last notification time to prevent message spam
  const lastMessageRef = useRef<Record<ConnectionStatus, number>>({
    [ConnectionStatus.CONNECTED]: 0,
    [ConnectionStatus.CONNECTING]: 0,
    [ConnectionStatus.DISCONNECTED]: 0,
    [ConnectionStatus.ERROR]: 0,
    [ConnectionStatus.RECONNECTING]: 0,
  });
  
  // Monitor connection status changes with debounce to prevent message spam
  useEffect(() => {
    const now = Date.now();
    const minInterval = 2000; // 2 seconds between same status messages
    
    // Only show messages if we haven't shown this status recently
    if (now - lastMessageRef.current[connectionStatus] < minInterval) {
      return;
    }
    
    // Update last notification time
    lastMessageRef.current[connectionStatus] = now;
    
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
          
          // Reset join status when disconnected
          setHasJoined(false);
        }
        break;
    }
  }, [connectionStatus, hasJoined, addSystemMessage, addErrorMessage]);
  
  // Function to connect to a session with validation
  const connect = useCallback((sid: string) => {
    if (!sid) {
      addErrorMessage('Cannot connect: No session ID provided');
      return false;
    }
    
    if (hasJoined && sid === currentSessionIdRef.current) {
      console.log(`[useTerminalWebSocket] Already connected to session ${sid}`);
      return false;
    }
    
    if (!isConnected) {
      addSystemMessage('Waiting for WebSocket connection...');
      // The connection will be established when WebSocket connects
      currentSessionIdRef.current = sid;
      return false;
    }
    
    console.log(`[useTerminalWebSocket] Manually connecting to session ${sid}`);
    joinSession(sid);
    setHasJoined(true);
    currentSessionIdRef.current = sid;
    addSystemMessage(`Connected to session: ${sid}`);
    return true;
  }, [hasJoined, isConnected, joinSession, addSystemMessage, addErrorMessage]);
  
  // Function to disconnect from a session with validation
  const disconnect = useCallback(() => {
    const sid = currentSessionIdRef.current;
    
    if (!sid) {
      addErrorMessage('Cannot disconnect: No active session');
      return false;
    }
    
    if (!hasJoined) {
      console.log(`[useTerminalWebSocket] Not connected to any session`);
      return false;
    }
    
    console.log(`[useTerminalWebSocket] Manually disconnecting from session ${sid}`);
    leaveSession(sid);
    setHasJoined(false);
    currentSessionIdRef.current = undefined;
    addSystemMessage('Disconnected from session');
    return true;
  }, [hasJoined, leaveSession, addSystemMessage, addErrorMessage]);
  
  // Return a stable interface
  return {
    connectionStatus,
    isConnected,
    hasJoined,
    sessionId: currentSessionIdRef.current,
    contextSessionId, // The session ID from the WebSocket context
    connect,
    disconnect,
  };
}

export default useTerminalWebSocket;