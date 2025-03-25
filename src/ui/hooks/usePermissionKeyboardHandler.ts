import { useEffect, useCallback } from 'react';
import { usePermissionManager } from './usePermissionManager';
import { useTerminal } from '@/context/TerminalContext';

/**
 * Hook for handling keyboard events for permission requests
 */
export function usePermissionKeyboardHandler({
  sessionId,
}: {
  sessionId?: string;
}) {
  const { pendingPermissions, resolvePermission } = usePermissionManager({ sessionId });

  // Handle keyboard events for permission requests
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!pendingPermissions.length) return;
      
      console.log('Keyboard event with pending permissions:', 
        { key: event.key, pendingCount: pendingPermissions.length, permissions: pendingPermissions });
      
      // Get the first pending permission
      const permission = pendingPermissions[0];
      
      // If 'y' is pressed, grant permission
      if (event.key.toLowerCase() === 'y') {
        console.log('Granting permission for', permission.id);
        resolvePermission(permission.id, true)
          .then((success) => {
            console.log('Permission granted for', permission.toolId, 'success:', success);
          })
          .catch(err => {
            console.error('Error in permission grant:', err);
          });
      } 
      // For any other key, deny permission
      else if (event.key.length === 1) { // Only handle printable characters
        console.log('Denying permission for', permission.id);
        resolvePermission(permission.id, false)
          .then((success) => {
            console.log('Permission denied for', permission.toolId, 'success:', success);
          })
          .catch(err => {
            console.error('Error in permission denial:', err);
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
        pendingCount: pendingPermissions.length,
        pendingPermissions: pendingPermissions.map(p => ({ id: p.id, toolId: p.toolId }))
      });
      
      window.addEventListener('keydown', handleKeyDown);
      
      return () => {
        console.log('🔑 Removing keyboard handler for permissions');
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [pendingPermissions, handleKeyDown]);

  return {
    hasPendingPermissions: pendingPermissions.length > 0,
  };
}

export default usePermissionKeyboardHandler;