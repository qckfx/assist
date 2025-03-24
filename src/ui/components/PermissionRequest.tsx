/**
 * Permission request component for tool execution permissions
 */
import React from 'react';
import { usePermissionRequests } from '../hooks/usePermissionRequests';

/**
 * Props for the PermissionRequest component
 */
interface PermissionRequestProps {
  sessionId?: string;
  className?: string;
  onResolved?: (permissionId: string, granted: boolean) => void;
}

/**
 * Component that displays and handles tool permission requests
 */
export function PermissionRequest({ 
  sessionId: _sessionId, // Parameter renamed to mark as unused
  className = '',
  onResolved
}: PermissionRequestProps) {
  const { 
    permissionRequests, 
    resolvePermission, 
    hasPermissionRequests 
  } = usePermissionRequests();
  
  if (!hasPermissionRequests) {
    return null;
  }
  
  const handleResolve = async (permissionId: string, granted: boolean) => {
    const resolved = await resolvePermission(permissionId, granted);
    if (resolved && onResolved) {
      onResolved(permissionId, granted);
    }
  };
  
  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString();
    } catch {
      return timestamp;
    }
  };
  
  const formatArgs = (args: Record<string, unknown>) => {
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return Object.keys(args).join(', ');
    }
  };
  
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <h3 className="text-lg font-semibold">Permission Requests</h3>
      
      {permissionRequests.map((request) => (
        <div 
          key={request.permissionId}
          className="border border-gray-200 dark:border-gray-700 rounded-md p-4"
        >
          <div className="flex justify-between items-start mb-2">
            <div className="font-medium">{request.toolId}</div>
            <div className="text-xs text-gray-500">
              {formatTimestamp(request.timestamp)}
            </div>
          </div>
          
          <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded mb-4 overflow-auto max-h-32">
            {formatArgs(request.args)}
          </pre>
          
          <div className="flex justify-end gap-2">
            <button
              onClick={() => handleResolve(request.permissionId, false)}
              className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded"
            >
              Deny
            </button>
            <button
              onClick={() => handleResolve(request.permissionId, true)}
              className="px-3 py-1 text-sm bg-blue-500 text-white hover:bg-blue-600 rounded"
            >
              Allow
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default PermissionRequest;