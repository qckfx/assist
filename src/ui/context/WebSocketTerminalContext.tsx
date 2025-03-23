/**
 * WebSocket-enhanced Terminal Context
 */
import React, { createContext, useContext, ReactNode, useCallback, useEffect, useState } from 'react';
import { useTerminal, TerminalProvider } from './TerminalContext';
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
  const { addSystemMessage, addErrorMessage, setProcessing } = useTerminal();
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  
  // Initialize hooks
  const { connectionStatus, isConnected } = useTerminalWebSocket(sessionId);
  const { isStreaming } = useStreamingMessages({ sessionId });
  const { handleCommand } = useTerminalCommands({ sessionId });
  const { hasPendingPermissions, resolvePermission } = usePermissionManager({ sessionId });
  
  // Create a new session
  const createSession = useCallback(async () => {
    try {
      setProcessing(true);
      addSystemMessage('Creating new session...');
      
      console.log('Requesting new session from API...');
      
      const response = await apiClient.startSession();
      console.log('Session creation response:', response);
      
      if (response.success && response.data?.sessionId) {
        const newSessionId = response.data.sessionId;
        console.log(`Session created successfully: ${newSessionId}`);
        
        setSessionId(newSessionId);
        addSystemMessage(`Connected to session: ${newSessionId}`);
        return newSessionId;
      } else {
        console.error('Failed to create session - invalid response:', response);
        throw new Error('Failed to create session: Invalid response from server');
      }
    } catch (error) {
      console.error('Failed to create session:', error);
      addErrorMessage(`Failed to create session: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    } finally {
      setProcessing(false);
    }
  }, [addSystemMessage, addErrorMessage, setProcessing]);
  
  // Abort processing
  const abortProcessing = useCallback(async () => {
    if (!sessionId) {
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
  }, [sessionId, addSystemMessage, addErrorMessage, setProcessing]);
  
  // Automatically create a session on mount if none provided, with retries
  useEffect(() => {
    // Only create session if we don't have one and we haven't tried yet
    if (!initialSessionId && !sessionId) {
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
        
        // Immediately show error message for test environment
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
    }
  }, [initialSessionId, sessionId, createSession, addErrorMessage]);
  
  // Context value
  const value: WebSocketTerminalContextProps = {
    connectionStatus,
    isConnected,
    sessionId,
    createSession,
    handleCommand,
    isProcessing: false, // This will be managed by TerminalContext
    abortProcessing,
    isStreaming,
    hasPendingPermissions,
    resolvePermission,
  };
  
  return (
    <TerminalProvider>
      <WebSocketTerminalContext.Provider value={value}>
        {children}
      </WebSocketTerminalContext.Provider>
    </TerminalProvider>
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