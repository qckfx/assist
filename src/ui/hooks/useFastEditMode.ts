/**
 * React hook for managing Fast Edit Mode
 */
import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { WebSocketEvent } from '../types/api';
import apiClient from '../services/apiClient';

/**
 * Hook for managing Fast Edit Mode
 * @param sessionId - Optional session ID to manage Fast Edit Mode for a specific session
 * @returns Fast Edit Mode state and methods to toggle, enable, and disable Fast Edit Mode
 */
export function useFastEditMode(sessionId?: string) {
  const [fastEditMode, setFastEditMode] = useState(false);
  const { subscribe } = useWebSocket();
  
  // Subscribe to fast edit mode events
  useEffect(() => {
    if (!sessionId) return;
    
    const handleFastEditModeEnabled = (data: { sessionId: string; enabled: boolean }) => {
      console.log('Fast Edit Mode enabled event received:', data);
      setFastEditMode(true);
    };
    
    const handleFastEditModeDisabled = (data: { sessionId: string; enabled: boolean }) => {
      console.log('Fast Edit Mode disabled event received:', data);
      setFastEditMode(false);
    };
    
    // Handle permission resolution (might be auto-approved through Fast Edit Mode)
    const handlePermissionResolved = (data: { sessionId: string; executionId: string; resolution: boolean }) => {
      console.log('Permission resolved:', data);
      // No direct action needed, will be handled by the permission hooks
    };
    
    // Register event listeners
    const unsubscribeEnabled = subscribe(
      WebSocketEvent.FAST_EDIT_MODE_ENABLED,
      handleFastEditModeEnabled
    );
    
    const unsubscribeDisabled = subscribe(
      WebSocketEvent.FAST_EDIT_MODE_DISABLED,
      handleFastEditModeDisabled
    );
    
    const unsubscribePermissionResolved = subscribe(
      WebSocketEvent.PERMISSION_RESOLVED,
      handlePermissionResolved
    );
    
    // Fetch initial state
    apiClient.getFastEditMode(sessionId)
      .then(response => {
        if (response.success) {
          setFastEditMode(response.data?.fastEditMode || false);
        }
      })
      .catch(error => {
        console.error('Failed to fetch fast edit mode state:', error);
      });
    
    // Cleanup on unmount
    return () => {
      unsubscribeEnabled();
      unsubscribeDisabled();
      unsubscribePermissionResolved();
    };
  }, [sessionId, subscribe]);
  
  // Toggle fast edit mode
  const toggleFastEditMode = useCallback(async (
    enabled: boolean = !fastEditMode
  ): Promise<boolean> => {
    if (!sessionId) {
      console.error('No active session');
      return false;
    }
    
    try {
      const response = await apiClient.toggleFastEditMode(sessionId, enabled);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to toggle fast edit mode');
      }
      
      // Update state locally for immediate feedback
      // WebSocket event will update it later to ensure consistency
      setFastEditMode(enabled);
      
      // Return the new state
      return enabled;
    } catch (error) {
      console.error('Error toggling Fast Edit Mode:', error);
      return false;
    }
  }, [sessionId, fastEditMode]);
  
  return {
    fastEditMode,
    enableFastEditMode: useCallback(() => toggleFastEditMode(true), [toggleFastEditMode]),
    disableFastEditMode: useCallback(() => toggleFastEditMode(false), [toggleFastEditMode]),
    toggleFastEditMode: useCallback(() => toggleFastEditMode(), [toggleFastEditMode]),
  };
}

export default useFastEditMode;