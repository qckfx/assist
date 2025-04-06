/**
 * WebSocket-enhanced Terminal Component
 */
import React, { useState, useEffect } from 'react';
import Terminal from './Terminal/Terminal';
import { useWebSocketTerminal } from '@/context/WebSocketTerminalContext';
import { useTerminal } from '@/context/TerminalContext';
import { usePermissionKeyboardHandler } from '@/hooks/usePermissionKeyboardHandler';
import { useAbortShortcuts } from '@/hooks/useAbortShortcuts';
import { TimelineProvider } from '@/context/TimelineContext';

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

  // Add logging for debugging timeline issues
  useEffect(() => {
    if (sessionId) {
      console.log(`WebSocketTerminal has sessionId: ${sessionId} - passing to nested TimelineProvider`);
    }
  }, [sessionId]);

  return (
    <div className="relative w-full max-w-full flex flex-col" style={{ height: "calc(100% - 20px)" }} data-testid="websocket-terminal">
      {/* Connection indicator now integrated directly in the Terminal title bar */}
      
      {/* Wrap Terminal in TimelineProvider to ensure it gets the latest sessionId */}
      <TimelineProvider sessionId={sessionId}>
        <Terminal
          className={className}
          messages={state.messages}
          onCommand={handleCommandWithNotification}
          inputDisabled={!isConnected && hasConnected}
          fullScreen={fullScreen}
          onClear={clearMessages}
          sessionId={sessionId}
          showConnectionIndicator={showConnectionStatus}
          showTypingIndicator={showTypingIndicator}
          connectionStatus={connectionStatus}
          showNewSessionHint={showNewSessionHint}
        />
      </TimelineProvider>
      
      {/* Typing indicator is now handled inside the Terminal component */}
      
      {/* Permissions are now handled through the ToolVisualization component */}
      
      {/* Abort button is now integrated into the Terminal component */}
    </div>
  );
}

export default WebSocketTerminal;