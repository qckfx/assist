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
  const { addSystemMessage } = useTerminal();

  // Handle keyboard events for permission requests
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!pendingPermissions.length) return;
      
      // Get the first pending permission
      const permission = pendingPermissions[0];
      
      // If 'y' is pressed, grant permission
      if (event.key.toLowerCase() === 'y') {
        resolvePermission(permission.id, true).then(() => {
          addSystemMessage(`Granted permission for ${permission.toolId}`);
        });
      } 
      // For any other key, deny permission
      else if (event.key.length === 1) { // Only handle printable characters
        resolvePermission(permission.id, false).then(() => {
          addSystemMessage(`Denied permission for ${permission.toolId}`);
        });
      }
    },
    [pendingPermissions, resolvePermission, addSystemMessage]
  );

  // Set up the key event listener
  useEffect(() => {
    // Only add listener if there are pending permissions
    if (pendingPermissions.length > 0) {
      window.addEventListener('keydown', handleKeyDown);
      
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [pendingPermissions, handleKeyDown]);

  return {
    hasPendingPermissions: pendingPermissions.length > 0,
  };
}

export default usePermissionKeyboardHandler;