/**
 * ThinkTool - Provides a dedicated space for Claude to think through complex problems
 */

import { createTool } from './createTool';
import { ToolContext, ValidationResult } from '../types/tool';

// Define types for the think tool
interface ThinkArgs {
  thought: string;
}

interface ThinkResult {
  success: boolean;
  thought: string;
}

/**
 * Creates a think tool that allows Claude to reason through complex problems
 * @returns The think tool interface
 */
export const createThinkTool = () => {
  return createTool({
    id: 'think',
    name: 'ThinkTool',
    description: 'Use this tool to think through complex problems. It provides a dedicated space for structured thinking during difficult tasks. Use it when you need to analyze tool outputs, follow detailed policies, or make sequential decisions where mistakes would be costly.',
    requiresPermission: false, // Core capability
    
    // Add schema information
    parameters: {
      thought: {
        type: "string",
        description: "Your detailed reasoning process. Use this space to break down problems, analyze options, and think step-by-step."
      }
    },
    requiredParameters: ["thought"],
    
    validateArgs: (args: Record<string, unknown>): ValidationResult => {
      if (typeof args.thought !== 'string' || args.thought.trim().length === 0) {
        return {
          valid: false,
          reason: "The 'thought' parameter is required and must be a non-empty string"
        };
      }
      
      return { valid: true };
    },
    
    execute: async (args: Record<string, unknown>, _context: ToolContext): Promise<ThinkResult> => {
      if (typeof args.thought !== 'string') {
        return {
          success: false,
          thought: "The 'thought' parameter is required and must be a string"
        };
      }
      
      const typedArgs = args as unknown as ThinkArgs;
      const { thought } = typedArgs;
      
      // Simply return the thought - this tool is just for structured thinking
      return {
        success: true,
        thought
      };
    }
  });
};