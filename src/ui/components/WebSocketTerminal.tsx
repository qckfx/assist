/**
 * WebSocket-enhanced Terminal Component
 */
import React, { useState, useEffect } from 'react';
import Terminal from './Terminal/Terminal';
import { useWebSocketTerminal } from '@/context/WebSocketTerminalContext';
import { useTerminal } from '@/context/TerminalContext';
import { usePermissionKeyboardHandler } from '@/hooks/usePermissionKeyboardHandler';
import { useAbortShortcuts } from '@/hooks/useAbortShortcuts';
import { useExecutionEnvironment } from '@/hooks/useExecutionEnvironment';
import { TimelineProvider } from '@/context/TimelineContext';
import { getSocketConnectionManager } from '@/utils/websocket';

interface WebSocketTerminalProps {
  className?: string;
  fullScreen?: boolean;
  autoConnect?: boolean;
  showConnectionStatus?: boolean;
  showTypingIndicator?: boolean;
  showNewSessionHint?: boolean;
  onUserInput?: () => void;
}

/**
 * WebSocket-enhanced Terminal Component with real-time updates
 */
export function WebSocketTerminal({
  className,
  fullScreen = false,
  autoConnect = true,
  showConnectionStatus = true,
  showTypingIndicator = true,
  showNewSessionHint = false,
  onUserInput,
}: WebSocketTerminalProps) {
  const {
    handleCommand,
    connectionStatus,
    isConnected,
    sessionId
  } = useWebSocketTerminal();
  
  // Get environment information
  const { isDocker, isEnvironmentReady, dockerStatus } = useExecutionEnvironment();
  
  // Get both state and the typing indicator state directly from TerminalContext
  const { state, clearMessages } = useTerminal();
  const [hasConnected, setHasConnected] = useState(false);
  
  // Add keyboard handler for permission requests
  usePermissionKeyboardHandler();
  
  // Add keyboard handler for abort operations
  useAbortShortcuts(isConnected);
  
  // Check if we've ever connected and store the sessionId
  useEffect(() => {
    if (isConnected && !hasConnected) {
      setHasConnected(true);
      
      // Store the sessionId in sessionStorage for use by other components
      if (sessionId) {
        sessionStorage.setItem('currentSessionId', sessionId);
        console.log('Session ID stored in sessionStorage:', sessionId);
      }
    }
  }, [isConnected, hasConnected, sessionId]);
  
  // Auto-connect if enabled
  useEffect(() => {
    if (autoConnect && !hasConnected) {
      // This will happen automatically via the WebSocketTerminalProvider
    }
  }, [autoConnect, hasConnected]);
  
  // Create a wrapper for handleCommand that notifies parent component of user input
  const handleCommandWithNotification = (command: string) => {
    // Call the parent's onUserInput callback if provided
    if (onUserInput) {
      onUserInput();
    }
    
    // Call the original handleCommand function
    handleCommand(command);
  };
  
  // Determine if input should be disabled based on WebSocket connection and environment readiness
  const isInputDisabled = () => {
    // If not connected to WebSocket at all, disable input
    if (!isConnected && hasConnected) {
      return true;
    }
    
    // For all environments (Docker, local, E2B), only check the environment ready flag
    // Log the environment ready status for debugging
    console.log(`WebSocketTerminal: Environment ready check - isEnvironmentReady=${isEnvironmentReady}, connected=${isConnected}, sessionId=${sessionId || 'none'}`);
    
    // Only enable input when:
    // 1. We're connected to WebSocket
    // 2. We have a valid session ID 
    // 3. The environment is ready
    const inputEnabled = isConnected && sessionId && isEnvironmentReady;
    
    return !inputEnabled;
  };
  
  // Get a message to show when input is disabled
  const getDisabledMessage = () => {
    if (!isConnected) {
      return "Input disabled: WebSocket disconnected";
    }
    
    if (isDocker) {
      if (!isEnvironmentReady) {
        return "Input disabled: Docker container initializing...";
      }
    }
    
    // Generic message for all other cases
    return "Input disabled: Environment not ready";
  };

  // Add logging for debugging timeline issues and handle session initialization
  useEffect(() => {
    if (sessionId) {
      console.log(`WebSocketTerminal has sessionId: ${sessionId} - passing to nested TimelineProvider`);
      
      // When we have a session ID on mount or change, inform components to refresh their data
      try {
        // Use WebSocketContext directly instead of global property which isn't typed properly
        const connectionManager = getSocketConnectionManager();
        const socket = connectionManager.getSocket();
        if (socket && connectionManager.isConnected()) {
          socket.emit('SESSION_LOADED', { sessionId });
          console.log(`Emitted SESSION_LOADED event for ${sessionId} from WebSocketTerminal`);
        }
      } catch (error) {
        console.error('Error emitting SESSION_LOADED event:', error);
      }
    }
  }, [sessionId]);

  return (
    <div className="relative w-full max-w-full flex flex-col" style={{ height: "calc(100% - 20px)" }} data-testid="websocket-terminal">
      {/* Wrap Terminal in TimelineProvider to ensure it gets the latest sessionId */}
      <TimelineProvider sessionId={sessionId || null}>
        <Terminal
          className={className}
          messages={state.messages}
          onCommand={handleCommandWithNotification}
          inputDisabled={isInputDisabled()}
          inputDisabledMessage={getDisabledMessage()}
          fullScreen={fullScreen}
          onClear={clearMessages}
          sessionId={sessionId}
          showConnectionIndicator={showConnectionStatus}
          showTypingIndicator={showTypingIndicator}
          connectionStatus={connectionStatus}
          showNewSessionHint={showNewSessionHint}
        />
      </TimelineProvider>
    </div>
  );
}

export default WebSocketTerminal;