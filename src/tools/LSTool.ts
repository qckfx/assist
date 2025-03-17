/**
 * LSTool - Lists directory contents
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { createTool } from './createTool';
import { Tool, ToolContext, ValidationResult } from '../types/tool';

// Promisify fs functions for async/await usage
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);

interface LSToolArgs {
  path?: string;
  showHidden?: boolean;
  details?: boolean;
}

interface FileEntry {
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

interface LSToolSuccessResult {
  success: true;
  path: string;
  entries: FileEntry[];
  count: number;
}

interface LSToolErrorResult {
  success: false;
  path: string;
  error: string;
}

type LSToolResult = LSToolSuccessResult | LSToolErrorResult;

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
      
      try {
        // Resolve the path
        const resolvedPath = path.resolve(dirPath);
        
        // Check if directory exists
        try {
          const stats = await statAsync(resolvedPath);
          if (!stats.isDirectory()) {
            return {
              success: false,
              path: dirPath,
              error: `Path exists but is not a directory: ${dirPath}`
            };
          }
        } catch {
          return {
            success: false,
            path: dirPath,
            error: `Directory does not exist: ${dirPath}`
          };
        }
        
        // Read directory contents
        context.logger?.debug(`Listing directory: ${resolvedPath}`);
        const entries = await readdirAsync(resolvedPath, { withFileTypes: true });
        
        // Filter hidden files if needed
        const filteredEntries = showHidden ? 
          entries : 
          entries.filter(entry => !entry.name.startsWith('.'));
        
        // Format the results
        let results: FileEntry[];
        
        if (details) {
          // Get detailed information for each entry
          results = await Promise.all(
            filteredEntries.map(async (entry) => {
              const entryPath = path.join(resolvedPath, entry.name);
              try {
                const stats = await statAsync(entryPath);
                return {
                  name: entry.name,
                  type: entry.isDirectory() ? 'directory' : 
                        entry.isFile() ? 'file' : 
                        entry.isSymbolicLink() ? 'symlink' : 'other',
                  size: stats.size,
                  modified: stats.mtime,
                  created: stats.birthtime,
                  isDirectory: entry.isDirectory(),
                  isFile: entry.isFile(),
                  isSymbolicLink: entry.isSymbolicLink()
                };
              } catch (err: unknown) {
                return {
                  name: entry.name,
                  isDirectory: false,
                  isFile: false,
                  isSymbolicLink: false,
                  error: (err as Error).message
                };
              }
            })
          );
        } else {
          // Simple listing
          results = filteredEntries.map(entry => ({
            name: entry.name,
            isDirectory: entry.isDirectory(),
            isFile: entry.isFile(),
            isSymbolicLink: entry.isSymbolicLink()
          }));
        }
        
        return {
          success: true,
          path: resolvedPath,
          entries: results,
          count: results.length
        };
      } catch (error: unknown) {
        context.logger?.error(`Error listing directory: ${(error as Error).message}`);
        return {
          success: false,
          path: dirPath,
          error: (error as Error).message
        };
      }
    }
  });
};