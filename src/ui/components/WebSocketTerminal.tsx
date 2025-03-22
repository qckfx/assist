/**
 * WebSocket-enhanced Terminal Component
 */
import React, { useState, useEffect } from 'react';
import Terminal from './Terminal/Terminal';
import { PermissionRequest } from './PermissionRequest';
import { ConnectionIndicator } from './ConnectionIndicator';
import { TypingIndicator } from './TypingIndicator';
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
    abortProcessing
  } = useWebSocketTerminal();
  
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
    <div className="relative">
      {showConnectionStatus && (
        <div className="absolute top-2 right-2 z-10">
          <ConnectionIndicator />
        </div>
      )}
      
      <Terminal
        className={className}
        messages={state.messages}
        onCommand={handleCommand}
        inputDisabled={!isConnected && hasConnected}
        fullScreen={fullScreen}
        onClear={clearMessages}
      />
      
      {showTypingIndicator && (isProcessing || isStreaming) && (
        <div className="absolute bottom-14 left-4">
          <TypingIndicator />
        </div>
      )}
      
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