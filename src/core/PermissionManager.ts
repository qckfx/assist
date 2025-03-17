/**
 * PermissionManager - Handles permission requests for tools that require user approval
 */

import { PermissionManager, PermissionManagerConfig, UIHandler } from '../types/permission';

/**
 * Creates a permission manager to handle tool permission requests
 * @param config - Configuration options
 * @returns The permission manager interface
 */
export const createPermissionManager = (config: PermissionManagerConfig = {}): PermissionManager => {
  // Track granted permissions
  const grantedPermissions = new Map<string, boolean>();
  
  // UI handler for requesting permissions
  const uiHandler: UIHandler = config.uiHandler || {
    async requestPermission(toolId: string, args: Record<string, unknown>): Promise<boolean> {
      // Default implementation could be console-based
      console.log(`Tool ${toolId} wants to execute with args:`, args);
      return true; // Always grant in default implementation
    }
  };
  
  return {
    /**
     * Check if a tool has been granted permission
     * @param toolId - The ID of the tool to check
     * @returns Whether permission has been granted
     */
    hasPermission(toolId: string): boolean {
      return grantedPermissions.has(toolId);
    },
    
    /**
     * Request permission for a tool
     * @param toolId - The ID of the tool requesting permission
     * @param args - The arguments the tool will use
     * @returns Whether permission was granted
     */
    async requestPermission(toolId: string, args: Record<string, unknown>): Promise<boolean> {
      const granted = await uiHandler.requestPermission(toolId, args);
      if (granted) {
        grantedPermissions.set(toolId, true);
      }
      return granted;
    },
    
    /**
     * Revoke permission for a tool
     * @param toolId - The ID of the tool to revoke permission for
     */
    revokePermission(toolId: string): void {
      grantedPermissions.delete(toolId);
    },
    
    /**
     * Clear all granted permissions
     */
    clearAllPermissions(): void {
      grantedPermissions.clear();
    }
  };
};