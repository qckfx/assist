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
import { useToolVisualization } from '@/hooks/useToolVisualization';
import { useExecutionEnvironment } from '@/hooks/useExecutionEnvironment';
import { ConnectionStatus, WebSocketEvent } from '@/types/api';
import apiClient from '@/services/apiClient';
import { getWebSocketService } from '@/services/WebSocketService';
import { getSocketConnectionManager } from '@/utils/websocket';
import { useModelContext } from './ModelContext';

interface WebSocketTerminalContextProps {
  // Connection state
  connectionStatus: ConnectionStatus;
  isConnected: boolean;
  
  // Session management
  sessionId: string | undefined;
  createSessionWithEnvironment: (
    environment: 'docker' | 'local' | 'remote', 
    remoteId?: string
  ) => Promise<string | undefined>;
  
  // Command handling
  handleCommand: (command: string) => Promise<void>;
  
  // Processing state
  isProcessing: boolean;
  abortProcessing: () => Promise<void>;
  
  // Streaming state
  isStreaming: boolean;
  
  // Permission management
  hasPendingPermissions: boolean;
  resolvePermission: (executionId: string, granted: boolean) => Promise<boolean>;
}

/**
 * Get tools that were aborted for a specific session
 * @param sessionId The session ID
 * @returns Set of aborted tool IDs
 */
export function getAbortedTools(sessionId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  
  const abortedToolsJson = window.sessionStorage.getItem(`aborted_tools_${sessionId}`);
  if (!abortedToolsJson) return new Set();
  
  try {
    const abortedTools = JSON.parse(abortedToolsJson) as string[];
    return new Set(abortedTools);
  } catch {
    return new Set();
  }
}

/**
 * Get abort timestamp for a specific session
 * @param sessionId The session ID
 * @returns Abort timestamp or null if not found
 */
export function getAbortTimestamp(sessionId: string): number | null {
  if (typeof window === 'undefined') return null;
  
  const timestamp = window.sessionStorage.getItem(`abort_timestamp_${sessionId}`);
  return timestamp ? parseInt(timestamp, 10) : null;
}

/**
 * Check if an event happened after the abort
 * @param sessionId The session ID
 * @param timestamp The event timestamp
 * @returns True if event happened after abort
 */
export function isEventAfterAbort(sessionId: string, timestamp: number): boolean {
  const abortTimestamp = getAbortTimestamp(sessionId);
  if (!abortTimestamp) return false;
  
  return timestamp > abortTimestamp;
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
  const { isStreaming } = useStreamingMessages();
  
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
  
  // Create a new session with specific environment settings
  const createSessionWithEnvironment = useCallback(async (
    environment: 'docker' | 'local' | 'remote',
    remoteId?: string
  ) => {
    try {
      // Update UI state
      setProcessing(true);
      
      console.log(`[WebSocketTerminalContext] Requesting new session with environment: ${environment}...`);

      // Create session via API with environment settings
      const response = await apiClient.startSessionWithEnvironment(environment, remoteId);
      console.log('[WebSocketTerminalContext] Session with environment creation response:', response);
      
      const sessionData = response.data || response;
      
      // Safely access sessionId with type checking
      const newSessionId = sessionData && 
        (typeof sessionData === 'object') && 
        'sessionId' in sessionData && 
        typeof sessionData.sessionId === 'string' 
          ? sessionData.sessionId 
          : undefined;
          
      if (newSessionId) {
        console.log(`[WebSocketTerminalContext] Session with environment created: ${newSessionId}`);
        
        // Store only environment settings in localStorage, not sessionId
        localStorage.setItem('sessionEnvironment', environment);
        if (remoteId) {
          localStorage.setItem('sessionRemoteId', remoteId);
        }
        
        // Update session state
        setSessionId(newSessionId);
        sessionIdRef.current = newSessionId;
        
        // Connect the WebSocket
        const connectionManager = getSocketConnectionManager();
        connectionManager.joinSession(newSessionId);
        
        // URL updates are now handled by the Terminal component with React Router
        
        return newSessionId;
      } else {
        console.error('[WebSocketTerminalContext] Failed to create session with environment:', response);
        throw new Error('Failed to create session: Invalid response from server');
      }
    } catch (error) {
      console.error('[WebSocketTerminalContext] Failed to create session with environment:', error);
      addErrorMessage(`Failed to set up environment: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    } finally {
      setProcessing(false);
    }
  }, [addErrorMessage, setProcessing]);
  
  // Get the tool visualization hook for abort processing
  const toolVisualization = useToolVisualization();

  // Abort processing with error handling
  const abortProcessing = useCallback(async () => {
    const currentSessionId = sessionIdRef.current;
    
    if (!currentSessionId) {
      addErrorMessage('No active session to abort');
      return;
    }
    
    try {
      // Immediately update UI state
      setProcessing(false);
      
      // Get active tools before aborting to find which ones to mark
      const activeTools = toolVisualization?.activeTools || [];
      const activeToolIds = new Set(activeTools.map(tool => tool.id));
      
      // Create a timestamp for the abort event 
      const abortTimestamp = Date.now();
      
      // Use the API client to abort the operation
      const response = await apiClient.abortOperation(currentSessionId);
      
      if (response.success) {
        // Don't add system messages - rely on visual indicators only
        
        // Get the WebSocket service to emit events
        const wsService = getWebSocketService();
        
        // Add an aborted result to each active tool
        if (activeTools.length > 0) {
          for (const tool of activeTools) {
            // Create abort result event
            const abortEvent = {
              sessionId: currentSessionId,
              tool: {
                id: tool.id,
                name: tool.toolName || 'Tool',
              },
              result: {
                aborted: true,
                abortTimestamp
              },
              timestamp: Date.now(),
              executionTime: 0, // No execution time for aborted operations
            };
            
            // Emit tool completion with abort result
            wsService.emit(WebSocketEvent.TOOL_EXECUTION_COMPLETED, abortEvent);
          }
          
          // Remember aborted tools to ignore late events
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(
              `aborted_tools_${currentSessionId}`, 
              JSON.stringify([...activeToolIds])
            );
            
            window.sessionStorage.setItem(
              `abort_timestamp_${currentSessionId}`,
              abortTimestamp.toString()
            );
          }
        }
      } else {
        throw new Error(response.error?.message || 'Failed to abort operation');
      }
    } catch (error) {
      addErrorMessage(`Failed to abort: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [addSystemMessage, addErrorMessage, setProcessing, toolVisualization]);
  
  // Check for an existing valid session on mount, but DON'T create a new one automatically
  useEffect(() => {
    // Store the initialization state in a ref to prevent duplicate initializations
    if (isInitializedRef.current) {
      return;
    }
    
    // Immediately set initialization flag to prevent multiple session creations
    isInitializedRef.current = true;
    
    // Only check for existing session if we don't have one
    if (!initialSessionId && !sessionId) {
      let isMounted = true; // Track component mount state
      
      const checkExistingSession = async () => {
        if (!isMounted) return;
        
        try {
          console.log('[WebSocketTerminalContext] Checking for existing session...');
          
          // Skip localStorage session checking to allow new sessions to work properly
          // Don't create a new session automatically, let the user select environment first
          
          // Do NOT create a new session automatically
          // The EnvironmentSelector will be shown by the Terminal component
        } catch (error) {
          if (isMounted) {
            console.error('[WebSocketTerminalContext] Session check failed:', error);
            addErrorMessage(`Failed to check for existing session: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      };
      
      // Check for existing session immediately
      checkExistingSession();
      
      // Cleanup function
      return () => {
        isMounted = false;
      };
    } else {
      // Log we're using provided sessionId
      console.log(`[WebSocketTerminalContext] Using provided session ID: ${initialSessionId || sessionId}`);
    }
  }, [initialSessionId, sessionId, addErrorMessage]);
  
  // Build the context value with stable references
  const value: WebSocketTerminalContextProps = {
    connectionStatus,
    isConnected,
    sessionId,
    createSessionWithEnvironment,
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