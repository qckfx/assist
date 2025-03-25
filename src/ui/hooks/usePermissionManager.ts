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
  
  // Subscribe to permission request events
  useEffect(() => {
    const handlePermissionRequested = (data: { sessionId: string; permission: Record<string, unknown> }) => {
      const { permission } = data;
      
      console.log('[usePermissionManager] Permission request received:', data);
      
      // Check if this tool should be auto-approved
      if (autoApproveTools.includes(permission.toolId as string)) {
        console.log('[usePermissionManager] Auto-approving tool:', permission.toolId);
        // Auto-approve the permission without showing system messages
        resolvePermission(permission.id as string, true)
          .then(() => {
            console.log(`Auto-approved permission for ${permission.toolId as string}`);
          })
          .catch(error => {
            console.error(`Failed to auto-approve permission:`, error);
          });
        return;
      }
      
      // Add to pending permissions
      setPendingPermissions(prev => {
        const newPermissions = [
          ...prev,
          {
            id: permission.id as string,
            toolId: permission.toolId as string,
            toolName: (permission.toolName as string) || (permission.toolId as string),
            args: (permission.args as Record<string, unknown>) || {},
            timestamp: (permission.timestamp as string) || new Date().toISOString(),
          },
        ];
        
        console.log('[usePermissionManager] Updated pending permissions:', newPermissions);
        return newPermissions;
      });
    };
    
    const handlePermissionResolved = (data: { 
      sessionId: string; 
      permissionId: string; 
      resolution: boolean;
    }) => {
      console.log('[usePermissionManager] Permission resolved:', data);
      
      // Remove from pending permissions
      setPendingPermissions(prev => {
        const filteredPermissions = prev.filter(p => p.id !== data.permissionId);
        console.log('[usePermissionManager] Removed permission from pending list, remaining:', filteredPermissions);
        return filteredPermissions;
      });
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
  }, [subscribe, autoApproveTools]);
  
  // Resolve a permission request
  const resolvePermission = useCallback(async (
    permissionId: string,
    granted: boolean
  ): Promise<boolean> => {
    // If sessionId is not provided as a prop, try to get it from sessionStorage
    if (!sessionId) {
      // Try to get from sessionStorage
      const storedSessionId = sessionStorage.getItem('currentSessionId');
      if (!storedSessionId) {
        console.error('No active session ID provided or found in storage');
        // Don't show error message to user to minimize system messages
        return false;
      }
    }
    
    try {
      const response = await apiClient.resolvePermission(permissionId, granted);
      
      if (!response.success) {
        // Just log to console, don't show error message to user
        console.error('Failed to resolve permission:', response.error);
        return false;
      }
      
      // Remove from pending permissions
      setPendingPermissions(prev => 
        prev.filter(p => p.id !== permissionId)
      );
      
      return true;
    } catch (error) {
      // Log to console but don't show error message to user to minimize system messages
      console.error('Error resolving permission:', error);
      return false;
    }
  }, [sessionId]);
  
  return {
    pendingPermissions,
    hasPendingPermissions: pendingPermissions.length > 0,
    resolvePermission,
  };
}

export default usePermissionManager;