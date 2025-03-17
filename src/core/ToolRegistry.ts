/**
 * ToolRegistry - Manages the collection of available tools for the agent
 */

import { Tool } from '../types/tool';
import { ToolDescription, ToolRegistry } from '../types/registry';

/**
 * Creates a tool registry to manage available tools
 * @returns The tool registry interface
 */
export const createToolRegistry = (): ToolRegistry => {
  // Private storage for registered tools
  const tools = new Map<string, Tool>();
  
  return {
    /**
     * Register a tool with the registry
     * @param tool - The tool to register
     */
    registerTool(tool: Tool): void {
      if (!tool || !tool.id) {
        throw new Error('Invalid tool: Tool must have an id');
      }
      
      tools.set(tool.id, tool);
    },
    
    /**
     * Get a tool by its ID
     * @param toolId - The ID of the tool to retrieve
     * @returns The requested tool or undefined if not found
     */
    getTool(toolId: string): Tool | undefined {
      return tools.get(toolId);
    },
    
    /**
     * Get all registered tools
     * @returns Array of all registered tools
     */
    getAllTools(): Tool[] {
      return Array.from(tools.values());
    },
    
    /**
     * Get descriptions of all tools for the model
     * @returns Array of tool descriptions
     */
    getToolDescriptions(): ToolDescription[] {
      return Array.from(tools.values()).map(tool => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        requiredParameters: tool.requiredParameters,
        requiresPermission: tool.requiresPermission
      }));
    }
  };
};