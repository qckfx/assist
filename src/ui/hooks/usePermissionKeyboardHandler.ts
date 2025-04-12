import { useEffect, useCallback } from 'react';
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
  
  // Debug websocket connection
  console.log('WebSocket connection status:', { 
    isConnected
  });
  
  // The active tools are already provided by useToolVisualization
  console.log('Active tools:', activeTools.map(t => ({ 
    id: t.id, 
    toolName: t.toolName, 
    status: t.status
  })));
  
  // Log both our own pendingPermissions state and what usePermissionManager reports
  console.log('Pending permissions from usePermissionManager:', { 
    hasPendingPermissions, 
    count: pendingPermissions.length,
    permissions: pendingPermissions
  });
  
  // Use the resolvePermission function provided by WebSocketTerminal context
  // This ensures the correct sessionId is always available

  // Handle keyboard events for permission requests
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!pendingPermissions.length) return;
      
      // Prevent default behavior for y/n keys in this context
      if (event.key.toLowerCase() === 'y' || event.key.length === 1) {
        event.preventDefault();
      }
      
      console.log('🔑 Keyboard event with pending permissions:', { 
        key: event.key, 
        pendingCount: pendingPermissions.length,
        pendingPermissions: pendingPermissions.map(p => ({ executionId: p.executionId, toolId: p.toolId }))
      });
      
      // Get the first pending permission
      const permission = pendingPermissions[0];
      
      // If 'y' is pressed, grant permission
      if (event.key.toLowerCase() === 'y') {
        console.log('🔑 Granting permission for execution', permission.executionId);
        
        // Display visual feedback that the key was pressed
        const permissionElement = document.querySelector(`[data-testid="permission-banner"]`);
        if (permissionElement) {
          permissionElement.classList.add('bg-green-200', 'dark:bg-green-900');
          permissionElement.textContent = 'Permission granted - processing...';
        }
        
        wsResolvePermission(permission.executionId, true)
          .then((success) => {
            console.log(`🔑 Permission granted for ${permission.toolId}, success: ${success}`);
          })
          .catch(err => {
            console.error('🔑 Error in permission grant:', err);
            // Revert visual feedback if there was an error
            if (permissionElement) {
              permissionElement.classList.remove('bg-green-200', 'dark:bg-green-900');
              permissionElement.textContent = 'Permission Required - Type \'y\' to allow';
            }
          });
      } 
      // For any other key, deny permission
      else if (event.key.length === 1) { // Only handle printable characters
        console.log('🔑 Denying permission for execution', permission.executionId);
        
        // Display visual feedback that the key was pressed
        const permissionElement = document.querySelector(`[data-testid="permission-banner"]`);
        if (permissionElement) {
          permissionElement.classList.add('bg-red-200', 'dark:bg-red-900');
          permissionElement.textContent = 'Permission denied - canceling...';
        }
        
        wsResolvePermission(permission.executionId, false)
          .then((success) => {
            console.log(`🔑 Permission denied for ${permission.toolId}, success: ${success}`);
          })
          .catch(err => {
            console.error('🔑 Error in permission denial:', err);
            // Revert visual feedback if there was an error
            if (permissionElement) {
              permissionElement.classList.remove('bg-red-200', 'dark:bg-red-900');
              permissionElement.textContent = 'Permission Required - Type \'y\' to allow';
            }
          });
      }
    },
    [pendingPermissions, wsResolvePermission]
  );

  // Set up the key event listener for when permissions are pending
  useEffect(() => {
    // Log whether we have pending permissions
    console.log('🔑 Permission keyboard handler setup with pendingPermissions from manager:', { 
      hasPendingPermissions,
      pendingCount: pendingPermissions.length,
      pendingDetails: pendingPermissions.map(p => ({
        executionId: p.executionId,
        toolId: p.toolId,
        toolName: p.toolName
      }))
    });
    
    // Create key handler function
    const keyHandler = (e: KeyboardEvent) => {
      console.log('🔑🔑 KEY EVENT:', { 
        key: e.key, 
        target: e.target,
        activeElement: document.activeElement?.tagName,
        hasPendingPermissions,
        pendingCount: pendingPermissions.length
      });
      
      // Only process keypress if we have pending permissions
      if (pendingPermissions.length > 0) {
        // Only check for 'y' or single characters
        if (e.key.toLowerCase() === 'y' || e.key.length === 1) {
          console.log('🔑 Processing key for permission:', e.key);
          e.preventDefault();
          
          // Get the first pending permission
          const permission = pendingPermissions[0];
          
          // If 'y' is pressed, grant permission
          if (e.key.toLowerCase() === 'y') {
            console.log('🔑 Granting permission for execution', permission.executionId);
            
            // Display visual feedback that the key was pressed
            const permissionElement = document.querySelector('[data-testid="permission-banner"]');
            if (permissionElement) {
              permissionElement.classList.add('bg-green-200', 'dark:bg-green-900');
              permissionElement.textContent = 'Permission granted - processing...';
            }
            
            wsResolvePermission(permission.executionId, true)
              .then((success) => {
                console.log(`🔑 Permission granted for ${permission.toolId}, success: ${success}`);
              })
              .catch(err => {
                console.error('🔑 Error in permission grant:', err);
                // Revert visual feedback if there was an error
                if (permissionElement) {
                  permissionElement.classList.remove('bg-green-200', 'dark:bg-green-900');
                  permissionElement.textContent = 'Permission Required - Type \'y\' to allow';
                }
              });
          } 
          // For any other key, deny permission
          else if (e.key.length === 1) {
            console.log('🔑 Denying permission for execution', permission.executionId);
            
            // Display visual feedback that the key was pressed
            const permissionElement = document.querySelector('[data-testid="permission-banner"]');
            if (permissionElement) {
              permissionElement.classList.add('bg-red-200', 'dark:bg-red-900');
              permissionElement.textContent = 'Permission denied - canceling...';
            }
            
            wsResolvePermission(permission.executionId, false)
              .then((success) => {
                console.log(`🔑 Permission denied for ${permission.toolId}, success: ${success}`);
              })
              .catch(err => {
                console.error('🔑 Error in permission denial:', err);
                // Revert visual feedback if there was an error
                if (permissionElement) {
                  permissionElement.classList.remove('bg-red-200', 'dark:bg-red-900');
                  permissionElement.textContent = 'Permission Required - Type \'y\' to allow';
                }
              });
          }
        }
      }
    };
    
    // Use capture phase to ensure our handler runs before others
    window.addEventListener('keydown', keyHandler, true);
    
    return () => {
      console.log('🔑 Removing keyboard handler for permissions');
      window.removeEventListener('keydown', keyHandler, true);
    };
  }, [pendingPermissions, hasPendingPermissions, wsResolvePermission]);

  return {
    hasPendingPermissions: pendingPermissions.length > 0,
  };
}

export default usePermissionKeyboardHandler;