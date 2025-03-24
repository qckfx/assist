/**
 * Types and interfaces for the tool registry
 */

import { Tool, ParameterSchema, ToolContext } from './tool';

export interface ToolDescription {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, ParameterSchema>;
  requiredParameters: string[];
  requiresPermission: boolean;
}

export interface ToolRegistry {
  registerTool(tool: Tool): void;
  getTool(toolId: string): Tool | undefined;
  getAllTools(): Tool[];
  getToolDescriptions(): ToolDescription[];
  
  // New methods for tool execution event handling
  onToolExecutionStart(callback: (toolId: string, args: Record<string, unknown>, context: ToolContext) => void): () => void;
  onToolExecutionComplete(callback: (toolId: string, args: Record<string, unknown>, result: unknown, executionTime: number) => void): () => void;
  onToolExecutionError(callback: (toolId: string, args: Record<string, unknown>, error: Error) => void): () => void;
  
  // Function to execute a tool with callback notifications
  executeToolWithCallbacks(toolId: string, args: Record<string, unknown>, context: ToolContext): Promise<unknown>;
}