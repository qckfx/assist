import { useEffect, useCallback } from 'react';
import { useToolStream } from './useToolStream';
import apiClient from '../services/apiClient';

/**
 * Hook for handling keyboard events for permission requests
 */
export function usePermissionKeyboardHandler() {
  const { getActiveTools } = useToolStream();
  
  // Get pending permissions from active tools
  const activeTools = getActiveTools();
  console.log('Active tools:', activeTools.map(t => ({ 
    id: t.id, 
    toolName: t.toolName, 
    status: t.status
  })));
  
  const pendingPermissions = activeTools
    .filter(tool => {
      const isPending = tool.status === 'awaiting-permission';
      console.log(`Tool ${tool.id} (${tool.toolName}) permission check:`, { 
        status: tool.status, 
        isPending 
      });
      return isPending;
    })
    .map(tool => ({
      executionId: tool.id,
      toolId: tool.tool,
      toolName: tool.toolName
    }));
  
  // Resolve permission on the server - use apiClient instead of socket.emit
  const resolvePermission = useCallback(async (executionId: string, granted: boolean) => {
    try {
      console.log('Using apiClient to resolve permission for execution:', { executionId, granted });
      const response = await apiClient.resolvePermission(executionId, granted);
      return response.success;
    } catch (error) {
      console.error('Error resolving permission via apiClient:', error);
      return false;
    }
  }, []);

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
        
        resolvePermission(permission.executionId, true)
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
        
        resolvePermission(permission.executionId, false)
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
    [pendingPermissions, resolvePermission]
  );

  // Set up the key event listener
  useEffect(() => {
    // Only add listener if there are pending permissions
    if (pendingPermissions.length > 0) {
      console.log('🔑 Adding keyboard handler for permissions', { 
        pendingCount: pendingPermissions.length
      });
      
      // Use capture phase to ensure our handler runs before others
      window.addEventListener('keydown', handleKeyDown, true);
      
      return () => {
        console.log('🔑 Removing keyboard handler for permissions');
        window.removeEventListener('keydown', handleKeyDown, true);
      };
    }
  }, [pendingPermissions, handleKeyDown]);

  return {
    hasPendingPermissions: pendingPermissions.length > 0,
  };
}

export default usePermissionKeyboardHandler;