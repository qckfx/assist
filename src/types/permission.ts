/**
 * Types and interfaces for permission management
 */

export interface UIHandler {
  requestPermission(toolId: string, args: Record<string, unknown>): Promise<boolean>;
}

export interface PermissionManagerConfig {
  uiHandler?: UIHandler;
  logger?: {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };
}

export interface PermissionManager {
  hasPermission(toolId: string): boolean;
  requestPermission(toolId: string, args: Record<string, unknown>): Promise<boolean>;
  revokePermission(toolId: string): void;
  clearAllPermissions(): void;
}