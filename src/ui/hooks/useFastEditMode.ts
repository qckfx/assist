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
    
    const handleFastEditModeEnabled = () => {
      setFastEditMode(true);
    };
    
    const handleFastEditModeDisabled = () => {
      setFastEditMode(false);
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
      
      // State will be updated via WebSocket event
      return true;
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