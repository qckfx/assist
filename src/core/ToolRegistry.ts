/**
 * ToolRegistry - Manages the collection of available tools for the agent
 */

import { Tool, ToolContext } from '../types/tool';
import { ToolDescription, ToolRegistry } from '../types/registry';

/**
 * Creates a tool registry to manage available tools
 * @returns The tool registry interface
 */
export const createToolRegistry = (): ToolRegistry => {
  // Private storage for registered tools
  const tools = new Map<string, Tool>();
  const startCallbacks: Array<(toolId: string, args: Record<string, unknown>, context: ToolContext) => void> = [];
  const completeCallbacks: Array<(toolId: string, args: Record<string, unknown>, result: unknown, executionTime: number) => void> = [];
  const errorCallbacks: Array<(toolId: string, args: Record<string, unknown>, error: Error) => void> = [];
  
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
    },
    
    /**
     * Register a callback to be called when a tool execution starts
     * @param callback - The callback function to register
     * @returns A function to unregister the callback
     */
    onToolExecutionStart(callback: (toolId: string, args: Record<string, unknown>, context: ToolContext) => void): () => void {
      startCallbacks.push(callback);
      
      // Return unsubscribe function
      return () => {
        const index = startCallbacks.indexOf(callback);
        if (index !== -1) {
          startCallbacks.splice(index, 1);
        }
      };
    },
    
    /**
     * Register a callback to be called when a tool execution completes successfully
     * @param callback - The callback function to register
     * @returns A function to unregister the callback
     */
    onToolExecutionComplete(callback: (toolId: string, args: Record<string, unknown>, result: unknown, executionTime: number) => void): () => void {
      completeCallbacks.push(callback);
      
      // Return unsubscribe function
      return () => {
        const index = completeCallbacks.indexOf(callback);
        if (index !== -1) {
          completeCallbacks.splice(index, 1);
        }
      };
    },
    
    /**
     * Register a callback to be called when a tool execution encounters an error
     * @param callback - The callback function to register
     * @returns A function to unregister the callback
     */
    onToolExecutionError(callback: (toolId: string, args: Record<string, unknown>, error: Error) => void): () => void {
      errorCallbacks.push(callback);
      
      // Return unsubscribe function
      return () => {
        const index = errorCallbacks.indexOf(callback);
        if (index !== -1) {
          errorCallbacks.splice(index, 1);
        }
      };
    },
    
    /**
     * Execute a tool with callback notifications
     * @param toolId - The ID of the tool to execute
     * @param args - The arguments to pass to the tool
     * @param context - The execution context
     * @returns The result of the tool execution
     */
    async executeToolWithCallbacks(toolId: string, args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
      const tool = tools.get(toolId);
      if (!tool) {
        throw new Error(`Tool ${toolId} not found`);
      }
      
      // Notify start callbacks
      startCallbacks.forEach(callback => callback(toolId, args, context));
      
      const startTime = Date.now();
      try {
        // Execute the tool
        const result = await tool.execute(args, context);
        
        // Calculate execution time
        const executionTime = Date.now() - startTime;
        
        // Notify complete callbacks
        completeCallbacks.forEach(callback => 
          callback(toolId, args, result, executionTime)
        );
        
        return result;
      } catch (error) {
        // Notify error callbacks
        errorCallbacks.forEach(callback => 
          callback(toolId, args, error instanceof Error ? error : new Error(String(error)))
        );
        
        // Re-throw the error
        throw error;
      }
    }
  };
};