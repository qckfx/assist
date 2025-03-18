/**
 * LSTool - Lists directory contents
 */

import { createTool } from './createTool';
import { Tool, ToolContext, ValidationResult } from '../types/tool';


interface LSToolArgs {
  path?: string;
  showHidden?: boolean;
  details?: boolean;
}

export interface FileEntry {
  name: string;
  type?: string;
  size?: number;
  modified?: Date;
  created?: Date;
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink: boolean;
  error?: string;
}

export interface LSToolSuccessResult {
  success: true;
  path: string;
  entries: FileEntry[];
  count: number;
}

export interface LSToolErrorResult {
  success: false;
  path: string;
  error: string;
}

export type LSToolResult = LSToolSuccessResult | LSToolErrorResult;

/**
 * Creates a tool for listing directory contents
 * @returns The LS tool interface
 */
export const createLSTool = (): Tool => {
  return createTool({
    id: 'ls',
    name: 'LSTool',
    description: 'Lists the contents of a directory. Use this to explore the file structure.',
    requiresPermission: false, // Listing directories is generally safe
    
    // Add detailed parameter descriptions
    parameters: {
      path: {
        type: "string",
        description: "The directory to list contents from. Use relative paths like 'src', '../', 'docs/v2' or absolute paths. Default: current directory ('.')"
      },
      showHidden: {
        type: "boolean",
        description: "Whether to show hidden files (starting with '.'). Default: false"
      },
      details: {
        type: "boolean",
        description: "Whether to show detailed file information (size, dates, etc). Default: false"
      }
    },
    
    validateArgs: (args: Record<string, unknown>): ValidationResult => {
      const dirPath = args.path || '.';
      if (typeof dirPath !== 'string') {
        return { 
          valid: false, 
          reason: 'Directory path must be a string' 
        };
      }
      return { valid: true };
    },
    
    execute: async (args: LSToolArgs, context: ToolContext): Promise<LSToolResult> => {
      const { 
        path: dirPath = '.', 
        showHidden = false,
        details = false
      } = args;
      
      const executionAdapter = context.executionAdapter;
      const result = await executionAdapter.ls(dirPath, showHidden, details);
      return result;
    }
  });
};
