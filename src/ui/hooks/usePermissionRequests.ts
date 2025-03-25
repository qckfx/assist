/**
 * React hook for handling permission requests
 */
import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { WebSocketEvent } from '../types/api';
import apiClient from '../services/apiClient';

/**
 * Interface for permission request data
 */
export interface PermissionRequestData {
  permissionId: string;
  toolId: string;
  args: Record<string, unknown>;
  timestamp: string;
}

/**
 * Hook for managing permission requests
 */
export function usePermissionRequests() {
  const { subscribe } = useWebSocket();
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequestData[]>([]);
  
  // Handle permission requested events
  useEffect(() => {
    const unsubscribe = subscribe(WebSocketEvent.PERMISSION_REQUESTED, (data) => {
      if (!data.permission) return;
      
      console.log('[usePermissionRequests] Permission request received:', data.permission);
      
      // Add the permission request to our state
      setPermissionRequests((prev) => {
        const newPermissions = [
          ...prev,
          {
            permissionId: data.permission.id, // Use 'id' instead of 'permissionId'
            toolId: data.permission.toolId,
            args: data.permission.args,
            timestamp: data.permission.timestamp,
          },
        ];
        
        console.log('[usePermissionRequests] Updated permission requests:', newPermissions);
        return newPermissions;
      });
    });
    
    return unsubscribe;
  }, [subscribe]);
  
  // Handle permission resolved events
  useEffect(() => {
    const unsubscribe = subscribe(WebSocketEvent.PERMISSION_RESOLVED, (data) => {
      // Remove the resolved permission request from our state
      setPermissionRequests((prev) => 
        prev.filter((req) => req.permissionId !== data.permissionId)
      );
    });
    
    return unsubscribe;
  }, [subscribe]);
  
  // Resolve a permission request
  const resolvePermission = useCallback(async (permissionId: string, granted: boolean) => {
    try {
      const response = await apiClient.resolvePermission(permissionId, granted);
      
      if (response.success) {
        // Remove from local state immediately for a responsive UI
        setPermissionRequests((prev) => 
          prev.filter((req) => req.permissionId !== permissionId)
        );
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to resolve permission:', error);
      return false;
    }
  }, []);
  
  // Fetch pending permission requests
  const fetchPermissionRequests = useCallback(async () => {
    try {
      const response = await apiClient.getPermissionRequests();
      
      if (response.success && response.data?.permissionRequests) {
        setPermissionRequests(response.data.permissionRequests.map((req) => ({
          permissionId: req.id,
          toolId: req.toolId,
          args: req.args,
          timestamp: req.timestamp,
        })));
      }
    } catch (error) {
      console.error('Failed to fetch permission requests:', error);
    }
  }, []);
  
  // Fetch permission requests on mount
  useEffect(() => {
    fetchPermissionRequests();
  }, [fetchPermissionRequests]);
  
  return {
    permissionRequests,
    resolvePermission,
    fetchPermissionRequests,
    hasPermissionRequests: permissionRequests.length > 0,
  };
}

export default usePermissionRequests;