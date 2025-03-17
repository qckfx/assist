/**
 * Types and interfaces for the tool registry
 */

import { Tool, ParameterSchema } from './tool';

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
}