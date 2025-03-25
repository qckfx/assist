/**
 * FileReadTool - Reads the contents of files
 */

import { createTool } from './createTool';
import { Tool, ToolContext, ValidationResult, ToolCategory } from '../types/tool';

// Interface for the arguments accepted by the FileReadTool
// Used for type checking and documentation
export interface FileReadToolArgs {
  path: string;
  encoding?: string;
  maxSize?: number;
  lineOffset?: number;
  lineCount?: number;
}

export interface FileReadToolSuccessResult {
  success: true;
  path: string;
  content: string;
  size: number;
  encoding: string;
  pagination?: {
    totalLines: number;
    startLine: number;
    endLine: number;
    hasMore: boolean;
  };
}

export interface FileReadToolErrorResult {
  success: false;
  path: string;
  error: string;
}

export type FileReadToolResult = FileReadToolSuccessResult | FileReadToolErrorResult;

/**
 * Creates a tool for reading file contents
 * @returns The file read tool interface
 */
export const createFileReadTool = (): Tool => {
  return createTool({
    id: 'file_read',
    name: 'FileReadTool',
    description: '- Reads the contents of files in the filesystem\n- Handles text files with various encodings\n- Supports partial file reading with line offset and count\n- Limits file size for performance and safety\n- Use this tool to examine file contents\n- Use LSTool to explore directories before reading specific files\n\nUsage notes:\n- Provide the exact file path to read\n- Files larger than the maxSize will be truncated\n- Use lineOffset and lineCount to read specific portions of large files\n- Returns raw file content as text without line numbers\n- Returns metadata including file size and encoding\n- File content is returned according to the specified encoding',
    requiresPermission: false, // Reading files is generally safe
    category: ToolCategory.READONLY
    
    // Enhanced parameter descriptions
    parameters: {
      path: {
        type: "string",
        description: "Path to the file to read. Can be relative like 'src/index.js', '../README.md' or absolute"
      },
      encoding: {
        type: "string",
        description: "File encoding to use. Default: 'utf8'"
      },
      maxSize: {
        type: "number",
        description: "Maximum file size in bytes to read. Default: 1048576 (1MB)"
      },
      lineOffset: {
        type: "number",
        description: "Line number to start reading from (0-based). Default: 0"
      },
      lineCount: {
        type: "number",
        description: "Maximum number of lines to read. Default: all lines"
      }
    },
    requiredParameters: ["path"],
    
    validateArgs: (args: Record<string, unknown>): ValidationResult => {
      if (!args.path || typeof args.path !== 'string') {
        return { 
          valid: false, 
          reason: 'File path must be a string' 
        };
      }
      return { valid: true };
    },
    
    execute: async (args: Record<string, unknown>, context: ToolContext): Promise<FileReadToolResult> => {
      // Extract and type-cast each argument individually
      const filePath = args.path as string;
      const encoding = args.encoding as string || 'utf8';
      const maxSize = args.maxSize as number || 1048576;
      const lineOffset = args.lineOffset as number || 0;
      const lineCount = args.lineCount !== undefined ? args.lineCount as number : undefined;

      const executionAdapter = context.executionAdapter;
      const { readFile } = executionAdapter;
      
      try {
        return await readFile(filePath, maxSize, lineOffset, lineCount, encoding);
      } catch (error: unknown) {
        const err = error as Error;
        context.logger?.error(`Error reading file: ${err.message}`);
        return {
          success: false,
          path: filePath,
          error: err.message
        };
      }
    }
  });
};
        