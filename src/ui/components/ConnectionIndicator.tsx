/**
 * Connection status indicator component
 */
import React from 'react';
import { useConnectionStatus } from '../hooks/useConnectionStatus';
import { ConnectionStatus } from '../types/api';

/**
 * Props for the ConnectionIndicator component
 */
interface ConnectionIndicatorProps {
  showText?: boolean;
  className?: string;
}

/**
 * Connection indicator that shows the current WebSocket connection status
 */
export function ConnectionIndicator({ 
  showText = true,
  className = ''
}: ConnectionIndicatorProps) {
  const { 
    connectionStatus, 
    statusMessage, 
    attemptReconnect 
  } = useConnectionStatus();
  
  // Determine the color class based on connection status
  const getStatusColorClass = () => {
    switch (connectionStatus) {
      case ConnectionStatus.CONNECTED:
        return 'bg-green-500';
      case ConnectionStatus.CONNECTING:
      case ConnectionStatus.RECONNECTING:
        return 'bg-yellow-500 animate-pulse';
      case ConnectionStatus.DISCONNECTED:
        return 'bg-red-500';
      case ConnectionStatus.ERROR:
        return 'bg-red-600';
      default:
        return 'bg-gray-500';
    }
  };
  
  return (
    <div 
      className={`flex items-center gap-2 ${className}`}
      onClick={attemptReconnect}
      role="button"
      aria-label={`Connection status: ${statusMessage}. Click to reconnect.`}
    >
      <div
        className={`h-3 w-3 rounded-full ${getStatusColorClass()}`}
        title={statusMessage}
      />
      {showText && (
        <span className="text-xs font-medium">{statusMessage}</span>
      )}
    </div>
  );
}

export default ConnectionIndicator;