/**
 * WebSocket-enhanced Terminal Component
 */
import React, { useState, useEffect } from 'react';
import Terminal from './Terminal/Terminal';
import { PermissionRequest } from './PermissionRequest';
// ConnectionIndicator is included in Terminal
import { ConnectionIndicator as _ConnectionIndicator } from './ConnectionIndicator';
// TypingIndicator is included in Terminal
import { TypingIndicator as _TypingIndicator } from './TypingIndicator';
import { useWebSocketTerminal } from '@/context/WebSocketTerminalContext';
import { useTerminal } from '@/context/TerminalContext';

interface WebSocketTerminalProps {
  className?: string;
  fullScreen?: boolean;
  autoConnect?: boolean;
  showConnectionStatus?: boolean;
  showTypingIndicator?: boolean;
  showPermissionRequests?: boolean;
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
  showPermissionRequests = true,
}: WebSocketTerminalProps) {
  const {
    handleCommand,
    connectionStatus,
    isConnected,
    isProcessing,
    isStreaming,
    hasPendingPermissions,
    resolvePermission,
    abortProcessing,
    sessionId
  } = useWebSocketTerminal();
  
  // Get both state and the typing indicator state directly from TerminalContext
  const { state, clearMessages } = useTerminal();
  const [hasConnected, setHasConnected] = useState(false);
  
  // Check if we've ever connected
  useEffect(() => {
    if (isConnected && !hasConnected) {
      setHasConnected(true);
    }
  }, [isConnected, hasConnected]);
  
  // Auto-connect if enabled
  useEffect(() => {
    if (autoConnect && !hasConnected) {
      // This will happen automatically via the WebSocketTerminalProvider
    }
  }, [autoConnect, hasConnected]);
  
  return (
    <div className="relative w-full max-w-full flex flex-col" style={{ height: "calc(100% - 20px)" }} data-testid="websocket-terminal">
      {/* Connection indicator now integrated directly in the Terminal title bar */}
      
      <Terminal
        className={className}
        messages={state.messages}
        onCommand={handleCommand}
        inputDisabled={!isConnected && hasConnected}
        fullScreen={fullScreen}
        onClear={clearMessages}
        sessionId={sessionId}
        showConnectionIndicator={showConnectionStatus}
        showTypingIndicator={showTypingIndicator}
        showToolVisualizations={true}
        connectionStatus={connectionStatus}
      />
      
      {/* Typing indicator is now handled inside the Terminal component */}
      
      {showPermissionRequests && hasPendingPermissions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-lg w-full max-h-[80vh] overflow-auto">
            <h2 className="text-xl font-bold mb-4">Permission Request</h2>
            <PermissionRequest
              onResolved={(permissionId, granted) => {
                resolvePermission(permissionId, granted);
                return true;
              }}
            />
          </div>
        </div>
      )}
      
      {(isProcessing || isStreaming) && (
        <div className="absolute bottom-14 right-4">
          <button
            onClick={() => abortProcessing()}
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
            aria-label="Abort processing"
          >
            Abort
          </button>
        </div>
      )}
    </div>
  );
}

export default WebSocketTerminal;