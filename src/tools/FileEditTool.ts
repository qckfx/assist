/**
 * FileEditTool - Modifies the contents of existing files
 */

import { createTool } from './createTool';
import { Tool, ToolContext, ValidationResult } from '../types/tool';

// Interface for the arguments accepted by the FileEditTool
// Used for type checking and documentation
export interface FileEditToolArgs {
  path: string;
  searchCode: string;
  replaceCode: string;
  encoding?: string;
}

export interface FileEditToolSuccessResult {
  success: true;
  path: string;
  originalContent: string;
  newContent: string;
}

export interface FileEditToolErrorResult {
  success: false;
  path: string;
  error: string;
}

export type FileEditToolResult = FileEditToolSuccessResult | FileEditToolErrorResult;

/**
 * Creates a tool for editing file contents
 * @returns The file edit tool interface
 */
export const createFileEditTool = (): Tool => {
  return createTool({
    id: 'file_edit',
    name: 'FileEditTool',
    description: 'Modifies an existing file by replacing specific code with new content.',
    requiresPermission: true,
    
    // Enhanced parameter descriptions
    parameters: {
      path: {
        type: "string",
        description: "Path to the file to edit. Can be relative like 'src/index.js', '../README.md' or absolute"
      },
      searchCode: {
        type: "string",
        description: "The code snippet to search for in the file (must match exactly once)"
      },
      replaceCode: {
        type: "string",
        description: "The new code to replace the matched code with"
      },
      encoding: {
        type: "string",
        description: "File encoding to use. Default: 'utf8'"
      }
    },
    requiredParameters: ["path", "searchCode", "replaceCode"],
    
    validateArgs: (args: Record<string, unknown>): ValidationResult => {
      if (!args.path || typeof args.path !== 'string') {
        return { 
          valid: false, 
          reason: 'File path must be a string' 
        };
      }
      
      if (!args.searchCode || typeof args.searchCode !== 'string') {
        return {
          valid: false,
          reason: 'Search code must be provided as a string'
        };
      }
      
      if (!args.replaceCode || typeof args.replaceCode !== 'string') {
        return {
          valid: false,
          reason: 'Replace code must be provided as a string'
        };
      }
      
      return { valid: true };
    },
    
    execute: async (args: Record<string, unknown>, context: ToolContext): Promise<FileEditToolResult> => {
      // Extract and type-cast each argument individually
      const filePath = args.path as string;
      const searchCode = args.searchCode as string;
      const replaceCode = args.replaceCode as string;
      const encoding = args.encoding as string || 'utf8';

      const executionAdapter = context.executionAdapter;
      const { editFile } = executionAdapter;

      try {
        return await editFile(filePath, searchCode, replaceCode, encoding);
      } catch (error: unknown) {
        const err = error as Error;
        context.logger?.error(`Error editing file: ${err.message}`);
        return {
          success: false,
          path: filePath,
          error: err.message
        };
      }
    }
  });
};