/**
 * Hook for managing tool permission requests
 */
import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { useTerminal } from '@/context/TerminalContext';
import { WebSocketEvent } from '@/types/api';
import apiClient from '@/services/apiClient';

interface PermissionRequest {
  id: string;
  toolId: string;
  toolName?: string;
  args: Record<string, unknown>;
  timestamp: string;
}

interface UsePermissionManagerOptions {
  sessionId?: string;
  autoApproveTools?: string[];
}

/**
 * Hook that manages permission requests for tool execution
 */
export function usePermissionManager({
  sessionId,
  autoApproveTools = ['LS', 'View', 'GlobTool', 'GrepTool'],
}: UsePermissionManagerOptions = {}) {
  const [pendingPermissions, setPendingPermissions] = useState<PermissionRequest[]>([]);
  const { subscribe } = useWebSocket();
  const { addSystemMessage, addErrorMessage } = useTerminal();
  
  // Subscribe to permission request events
  useEffect(() => {
    const handlePermissionRequested = (data: { sessionId: string; permission: Record<string, unknown> }) => {
      const { permission } = data;
      
      // Check if this tool should be auto-approved
      if (autoApproveTools.includes(permission.toolId as string)) {
        // Auto-approve the permission
        resolvePermission(permission.id as string, true)
          .then(() => {
            addSystemMessage(`Auto-approved permission for ${permission.toolId as string}`);
          })
          .catch(error => {
            addErrorMessage(`Failed to auto-approve permission: ${
              error instanceof Error ? error.message : String(error)
            }`);
          });
        return;
      }
      
      // Add to pending permissions
      setPendingPermissions(prev => [
        ...prev,
        {
          id: permission.id as string,
          toolId: permission.toolId as string,
          toolName: (permission.toolName as string) || (permission.toolId as string),
          args: (permission.args as Record<string, unknown>) || {},
          timestamp: (permission.timestamp as string) || new Date().toISOString(),
        },
      ]);
    };
    
    const handlePermissionResolved = (data: { 
      sessionId: string; 
      permissionId: string; 
      resolution: boolean;
    }) => {
      // Remove from pending permissions
      setPendingPermissions(prev => 
        prev.filter(p => p.id !== data.permissionId)
      );
    };
    
    // Register event listeners
    const unsubscribeRequest = subscribe(
      WebSocketEvent.PERMISSION_REQUESTED,
      handlePermissionRequested
    );
    
    const unsubscribeResolved = subscribe(
      WebSocketEvent.PERMISSION_RESOLVED,
      handlePermissionResolved
    );
    
    // Cleanup on unmount
    return () => {
      unsubscribeRequest();
      unsubscribeResolved();
    };
  }, [subscribe, addSystemMessage, addErrorMessage, autoApproveTools]);
  
  // Resolve a permission request
  const resolvePermission = useCallback(async (
    permissionId: string,
    granted: boolean
  ): Promise<boolean> => {
    if (!sessionId) {
      throw new Error('No active session');
    }
    
    try {
      const response = await apiClient.resolvePermission(permissionId, granted);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to resolve permission');
      }
      
      // Remove from pending permissions
      setPendingPermissions(prev => 
        prev.filter(p => p.id !== permissionId)
      );
      
      return true;
    } catch (error) {
      addErrorMessage(`Error resolving permission: ${
        error instanceof Error ? error.message : String(error)
      }`);
      return false;
    }
  }, [sessionId, addErrorMessage]);
  
  return {
    pendingPermissions,
    hasPendingPermissions: pendingPermissions.length > 0,
    resolvePermission,
  };
}

export default usePermissionManager;