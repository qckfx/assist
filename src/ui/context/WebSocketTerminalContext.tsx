/**
 * WebSocket-enhanced Terminal Context
 * 
 * Provides a context for Terminal UI components to interact with WebSocket
 * functionality, managing sessions and event subscriptions.
 */
import React, { createContext, useContext, ReactNode, useCallback, useEffect, useState, useRef } from 'react';
import { useTerminal } from './TerminalContext';
import { useTerminalWebSocket } from '@/hooks/useTerminalWebSocket';
import { useStreamingMessages } from '@/hooks/useStreamingMessages';
import { useTerminalCommands } from '@/hooks/useTerminalCommands';
import { usePermissionManager } from '@/hooks/usePermissionManager';
import { ConnectionStatus } from '@/types/api';
import apiClient from '@/services/apiClient';

interface WebSocketTerminalContextProps {
  // Connection state
  connectionStatus: ConnectionStatus;
  isConnected: boolean;
  
  // Session management
  sessionId: string | undefined;
  createSession: () => Promise<string | undefined>;
  
  // Command handling
  handleCommand: (command: string) => Promise<void>;
  
  // Processing state
  isProcessing: boolean;
  abortProcessing: () => Promise<void>;
  
  // Streaming state
  isStreaming: boolean;
  
  // Permission management
  hasPendingPermissions: boolean;
  resolvePermission: (permissionId: string, granted: boolean) => Promise<boolean>;
}

// Create the context
const WebSocketTerminalContext = createContext<WebSocketTerminalContextProps | undefined>(undefined);

// Provider component
export function WebSocketTerminalProvider({
  children,
  initialSessionId
}: {
  children: ReactNode;
  initialSessionId?: string;
}) {
  // Get terminal methods from context
  const { addSystemMessage, addErrorMessage, setProcessing, isProcessing } = useTerminal();
  
  // Track session ID with both state and ref
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const sessionIdRef = useRef<string | undefined>(initialSessionId);
  
  // Track initialization state
  const isInitializedRef = useRef<boolean>(false);
  
  // Initialize WebSocket connection with the session ID
  // The hook does not reconnect unless the session ID actually changes
  const { 
    connectionStatus, 
    isConnected, 
    connect: connectToSession,
  } = useTerminalWebSocket(sessionId) || {};
  
  // Initialize feature hooks with stable sessionId reference
  const { isStreaming } = useStreamingMessages({ 
    sessionId: sessionIdRef.current 
  });
  
  const { handleCommand } = useTerminalCommands({ 
    sessionId: sessionIdRef.current 
  });
  
  const { hasPendingPermissions, resolvePermission } = usePermissionManager({ 
    sessionId: sessionIdRef.current 
  });
  
  // Update ref when state changes
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  
  // Create a new session with retry logic
  const createSession = useCallback(async () => {
    try {
      // Update UI state
      setProcessing(true);
      addSystemMessage('Creating new session...');
      
      console.log('[WebSocketTerminalContext] Requesting new session from API...');
      
      // Create session via API
      const response = await apiClient.startSession();
      console.log('[WebSocketTerminalContext] Session creation response:', response);
      
      // Handle successful response
      if (response.success && response.data?.sessionId) {
        const newSessionId = response.data.sessionId;
        console.log(`[WebSocketTerminalContext] Session created successfully: ${newSessionId}`);
        
        // Update session state
        setSessionId(newSessionId);
        sessionIdRef.current = newSessionId;
        
        // Connect to the session via WebSocket if possible
        if (isConnected && typeof connectToSession === 'function') {
          connectToSession(newSessionId);
        }
        
        addSystemMessage(`Session created: ${newSessionId}`);
        return newSessionId;
      } else {
        console.error('[WebSocketTerminalContext] Failed to create session - invalid response:', response);
        throw new Error('Failed to create session: Invalid response from server');
      }
    } catch (error) {
      console.error('[WebSocketTerminalContext] Failed to create session:', error);
      addErrorMessage(`Failed to create session: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    } finally {
      setProcessing(false);
    }
  }, [addSystemMessage, addErrorMessage, setProcessing, isConnected, connectToSession]);
  
  // Abort processing with error handling
  const abortProcessing = useCallback(async () => {
    const currentSessionId = sessionIdRef.current;
    
    if (!currentSessionId) {
      addErrorMessage('No active session to abort');
      return;
    }
    
    try {
      setProcessing(false);
      addSystemMessage('Aborting operation...');
      
      const response = await apiClient.abortOperation();
      if (response.success) {
        addSystemMessage('Operation aborted');
      } else {
        throw new Error(response.error?.message || 'Failed to abort operation');
      }
    } catch (error) {
      addErrorMessage(`Failed to abort: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [addSystemMessage, addErrorMessage, setProcessing]);
  
  // Automatically create a session on mount if none provided, with retries
  useEffect(() => {
    // Only run initialization once
    if (isInitializedRef.current) {
      return;
    }
    
    // Only create session if we don't have one and we haven't tried yet
    if (!initialSessionId && !sessionId) {
      isInitializedRef.current = true;
      
      // Add retry logic with backoff
      let retryAttempt = 0;
      const maxRetries = 3;
      let isMounted = true; // Track component mount state
      
      const attemptSessionCreation = async () => {
        if (!isMounted) return;
        
        try {
          console.log(`[WebSocketTerminalContext] Attempting to create session (attempt ${retryAttempt + 1}/${maxRetries})`);
          const newSessionId = await createSession();
          
          if (newSessionId && isMounted) {
            console.log(`[WebSocketTerminalContext] Successfully created session: ${newSessionId}`);
          } else if (isMounted) {
            handleSessionCreationError(new Error("Failed to create session: No session ID returned"));
          }
        } catch (error) {
          if (isMounted) {
            handleSessionCreationError(error);
          }
        }
      };
      
      const handleSessionCreationError = (error: Error | unknown) => {
        console.error("[WebSocketTerminalContext] Session creation failed:", error);
        
        // Immediately show error message
        addErrorMessage(`Failed to create session: ${error instanceof Error ? error.message : String(error)}`);
        
        // Retry with exponential backoff
        if (retryAttempt < maxRetries && isMounted) {
          retryAttempt++;
          const backoffTime = 1000 * Math.pow(2, retryAttempt);
          console.log(`[WebSocketTerminalContext] Retrying in ${backoffTime}ms...`);
          
          setTimeout(attemptSessionCreation, backoffTime);
        } else if (isMounted) {
          addErrorMessage(`Failed to create session after ${maxRetries} attempts. Please try again later.`);
        }
      };
      
      // Start the first attempt
      attemptSessionCreation();
      
      // Cleanup function
      return () => {
        isMounted = false;
      };
    } else {
      // Mark as initialized if we already have a session
      isInitializedRef.current = true;
    }
  }, [initialSessionId, sessionId, createSession, addErrorMessage]);
  
  // Build the context value with stable references
  const value: WebSocketTerminalContextProps = {
    connectionStatus,
    isConnected,
    sessionId,
    createSession,
    handleCommand,
    isProcessing, // Use the value from TerminalContext
    abortProcessing,
    isStreaming,
    hasPendingPermissions,
    resolvePermission,
  };
  
  return (
    <WebSocketTerminalContext.Provider value={value}>
      {children}
    </WebSocketTerminalContext.Provider>
  );
}

// Custom hook to use the WebSocket terminal context
export function useWebSocketTerminal() {
  const context = useContext(WebSocketTerminalContext);
  
  if (context === undefined) {
    throw new Error('useWebSocketTerminal must be used within a WebSocketTerminalProvider');
  }
  
  return context;
}