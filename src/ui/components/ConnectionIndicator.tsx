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
    status, 
    error,
    connect
  } = useConnectionStatus();
  
  // Get the appropriate status message
  const getStatusMessage = () => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
        return 'Disconnected';
      case 'error':
        return `Error: ${error?.message || 'Connection failed'}`;
      default:
        return 'Unknown status';
    }
  };
  
  // Determine the color class based on connection status
  const getStatusColorClass = () => {
    switch (status) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500 animate-pulse';
      case 'disconnected':
        return 'bg-red-500';
      case 'error':
        return 'bg-red-600';
      default:
        return 'bg-gray-500';
    }
  };
  
  const statusMessage = getStatusMessage();
  
  return (
    <div 
      className={`flex items-center gap-2 ${className}`}
      onClick={() => connect()}
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