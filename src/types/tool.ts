/**
 * Types and interfaces for tools
 */

export interface ParameterSchema {
  type: string;
  description?: string;
  items?: ParameterSchema;
  properties?: Record<string, ParameterSchema>;
  required?: string[];
  [key: string]: unknown;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface ToolConfig {
  id: string;
  name: string;
  description: string;
  requiresPermission?: boolean;
  parameters?: Record<string, ParameterSchema>;
  requiredParameters?: string[];
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<unknown>;
  validateArgs?: (args: Record<string, unknown>) => ValidationResult;
}

export interface ToolContext {
  permissionManager?: {
    hasPermission: (toolId: string) => boolean;
    requestPermission: (toolId: string, args: Record<string, unknown>) => Promise<boolean>;
  };
  logger?: {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };
  [key: string]: unknown;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  requiresPermission: boolean;
  parameters: Record<string, ParameterSchema>;
  requiredParameters: string[];
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<unknown>;
}