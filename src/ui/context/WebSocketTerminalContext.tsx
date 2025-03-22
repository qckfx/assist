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
      
      const response = await apiClient.startSession();
      if (response.success && response.data?.sessionId) {
        setSessionId(response.data.sessionId);
        addSystemMessage(`Connected to session: ${response.data.sessionId}`);
        return response.data.sessionId;
      } else {
        throw new Error('Failed to create session');
      }
    } catch (error) {
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
  
  // Automatically create a session on mount if none provided
  useEffect(() => {
    if (!initialSessionId && !sessionId) {
      createSession();
    }
  }, [initialSessionId, sessionId, createSession]);
  
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