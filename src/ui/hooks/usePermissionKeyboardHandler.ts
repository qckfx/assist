import { useEffect, useCallback, useRef } from 'react';
import { useToolVisualization } from './useToolVisualization';
import apiClient from '../services/apiClient';
import { useWebSocketTerminal } from '../context/WebSocketTerminalContext';
import { usePermissionManager } from './usePermissionManager';

/**
 * Hook for handling keyboard events for permission requests
 */
export function usePermissionKeyboardHandler() {
  const { activeTools } = useToolVisualization();
  const { isConnected, sessionId, resolvePermission: wsResolvePermission } = useWebSocketTerminal();
  // Get pending permissions directly from usePermissionManager
  const { pendingPermissions, hasPendingPermissions } = usePermissionManager({ 
    // Pass the current session ID 
    sessionId
  });
  
  // Track if we're currently processing a permission
  const isProcessingPermissionRef = useRef(false);
  
  // Set up the key event listener for when permissions are pending
  useEffect(() => {
    // Only add listener if we have pending permissions and aren't already processing one
    if (pendingPermissions.length === 0 || isProcessingPermissionRef.current) {
      return; // Don't set up listener if no permissions pending or already processing
    }
    
    // Create key handler function
    const keyHandler = (e: KeyboardEvent) => {
      // Ignore keypresses if we're processing or no longer have pending permissions
      if (isProcessingPermissionRef.current || pendingPermissions.length === 0) {
        return;
      }
      
      // Only process keypress if we have pending permissions
      if (pendingPermissions.length > 0) {
        // Only check for 'y' or single characters
        if (e.key.toLowerCase() === 'y' || e.key.length === 1) {
          e.preventDefault();
          
          // Get the first pending permission
          const permission = pendingPermissions[0];
          
          // Mark as processing to prevent further event handling
          isProcessingPermissionRef.current = true;
          
          // Remove the event listener immediately to prevent capturing further keypresses
          window.removeEventListener('keydown', keyHandler, true);
          
          // If 'y' is pressed, grant permission
          if (e.key.toLowerCase() === 'y') {
            // Display visual feedback that the key was pressed
            const permissionElement = document.querySelector('[data-testid="permission-banner"]');
            if (permissionElement) {
              permissionElement.classList.add('bg-green-200', 'dark:bg-green-900');
              permissionElement.textContent = 'Permission granted - processing...';
            }
            
            wsResolvePermission(permission.executionId, true)
              .then(() => {
                // Reset processing flag after completion
                isProcessingPermissionRef.current = false;
              })
              .catch(err => {
                console.error('Error in permission grant:', err);
                // Revert visual feedback if there was an error
                if (permissionElement) {
                  permissionElement.classList.remove('bg-green-200', 'dark:bg-green-900');
                  permissionElement.textContent = 'Permission Required - Type \'y\' to allow';
                }
                // Reset processing flag after error
                isProcessingPermissionRef.current = false;
              });
          } 
          // For any other key, deny permission
          else if (e.key.length === 1) {
            // Display visual feedback that the key was pressed
            const permissionElement = document.querySelector('[data-testid="permission-banner"]');
            if (permissionElement) {
              permissionElement.classList.add('bg-red-200', 'dark:bg-red-900');
              permissionElement.textContent = 'Permission denied - canceling...';
            }
            
            wsResolvePermission(permission.executionId, false)
              .then(() => {
                // Reset processing flag after completion
                isProcessingPermissionRef.current = false;
              })
              .catch(err => {
                console.error('Error in permission denial:', err);
                // Revert visual feedback if there was an error
                if (permissionElement) {
                  permissionElement.classList.remove('bg-red-200', 'dark:bg-red-900');
                  permissionElement.textContent = 'Permission Required - Type \'y\' to allow';
                }
                // Reset processing flag after error
                isProcessingPermissionRef.current = false;
              });
          }
        }
      }
    };
    
    // Use capture phase to ensure our handler runs before others
    window.addEventListener('keydown', keyHandler, true);
    
    return () => {
      window.removeEventListener('keydown', keyHandler, true);
    };
  }, [pendingPermissions, hasPendingPermissions, wsResolvePermission]);

  return {
    hasPendingPermissions: pendingPermissions.length > 0,
  };
}

export default usePermissionKeyboardHandler;