/**
 * PermissionManager - Handles permission requests for tools that require user approval
 */

import { PermissionManager, PermissionManagerConfig, UIHandler } from '../types/permission';
import { ToolRegistry } from '../types/registry';
import { ToolCategory } from '../types/tool';
import { LogCategory } from '../utils/logger';

/**
 * Creates a permission manager to handle tool permission requests
 * @param toolRegistry - The tool registry to use for tool lookups
 * @param config - Configuration options
 * @returns The permission manager interface
 */
export const createPermissionManager = (
  toolRegistry: ToolRegistry,
  config: PermissionManagerConfig = {}
): PermissionManager => {
  const logger = config.logger;
  
  // Track granted permissions
  const grantedPermissions = new Map<string, boolean>();
  
  // Fast Edit Mode state - when enabled, file operations don't require permission
  let fastEditMode = config.initialFastEditMode || false;
  
  // UI handler for requesting permissions
  const uiHandler: UIHandler = config.uiHandler || {
    async requestPermission(toolId: string, args: Record<string, unknown>): Promise<boolean> {
      // Default implementation could be console-based
      logger?.info(`Tool ${toolId} wants to execute with args:`, LogCategory.PERMISSIONS, args);
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
      const tool = toolRegistry.getTool(toolId);
      
      // Handle unknown tools - require permission by default
      if (!tool) {
        return await uiHandler.requestPermission(toolId, args);
      }
      
      // If tool always requires permission, always prompt regardless of mode
      if (tool.alwaysRequirePermission) {
        return await uiHandler.requestPermission(toolId, args);
      }
      
      // If we're in fast edit mode and this is a file operation, auto-approve
      if (fastEditMode && toolRegistry.isToolInCategory(toolId, ToolCategory.FILE_OPERATION)) {
        logger?.info(`Fast Edit Mode enabled, auto-approving file operation: ${toolId}`, LogCategory.PERMISSIONS);
        return true;
      }
      
      // If the tool doesn't require permission, auto-approve
      if (!tool.requiresPermission) {
        return true;
      }
      
      // Otherwise, request permission normally
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
    },
    
    /**
     * Set the fast edit mode
     * @param enabled - Whether fast edit mode should be enabled
     */
    setFastEditMode(enabled: boolean): void {
      fastEditMode = enabled;
      logger?.info(`Fast Edit Mode ${enabled ? 'enabled' : 'disabled'}`, LogCategory.PERMISSIONS);
    },
    
    /**
     * Check if fast edit mode is enabled
     * @returns Whether fast edit mode is enabled
     */
    isFastEditMode(): boolean {
      return fastEditMode;
    },
    
    /**
     * Check if a tool should require permission based on its category and current mode
     * @param toolId - The ID of the tool to check
     * @returns Whether the tool should require permission
     */
    shouldRequirePermission(toolId: string): boolean {
      const tool = toolRegistry.getTool(toolId);
      
      // If we don't know the tool, require permission by default
      if (!tool) {
        return true;
      }
      
      // If the tool doesn't require permission at all, return false
      if (!tool.requiresPermission) {
        return false;
      }
      
      // Tools that always require permission, regardless of mode
      if (tool.alwaysRequirePermission) {
        return true;
      }
      
      // In fast edit mode, don't require permission for file operations
      if (fastEditMode && toolRegistry.isToolInCategory(toolId, ToolCategory.FILE_OPERATION)) {
        return false;
      }
      
      // Default to the tool's own requiresPermission value
      return tool.requiresPermission;
    }
  };
};