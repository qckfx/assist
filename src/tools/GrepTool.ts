/**
 * GrepTool - Searches file contents for patterns
 */

import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { createTool } from './createTool';
import { Tool, ToolContext, ValidationResult } from '../types/tool';

const execAsync = promisify(exec);

// Interface used for tool arguments
interface GrepResult {
  file?: string;
  line?: number;
  content?: string;
  raw?: string;
}

interface GrepToolSuccessResult {
  success: true;
  pattern: string;
  path: string;
  results: GrepResult[];
  count: number;
  hasMore: boolean;
}

interface GrepToolErrorResult {
  success: false;
  pattern: string;
  path: string;
  error: string;
  stderr?: string;
}

export type GrepToolResult = GrepToolSuccessResult | GrepToolErrorResult;

/**
 * Creates a tool for searching file contents
 * @returns The grep tool interface
 */
export const createGrepTool = (): Tool => {
  return createTool({
    id: 'grep',
    name: 'GrepTool',
    description: 'Searches file contents for patterns. Use this to find code or text within files.',
    requiresPermission: false, // Reading/searching is generally safe
    
    // Enhanced parameter descriptions
    parameters: {
      pattern: {
        type: "string",
        description: "Search pattern to look for in files"
      },
      path: {
        type: "string",
        description: "Directory or file path to search in. Can be relative like 'src', '../' or absolute. Default: current directory"
      },
      recursive: {
        type: "boolean",
        description: "Whether to search recursively in subdirectories. Default: true"
      },
      ignoreCase: {
        type: "boolean",
        description: "Whether to ignore case when matching. Default: false"
      },
      filePattern: {
        type: "string",
        description: "Optional glob pattern to filter which files to search. Example: '*.js', '*.{js,ts}'"
      },
      maxResults: {
        type: "number",
        description: "Maximum number of results to return. Default: 100"
      }
    },
    requiredParameters: ["pattern"],
    
    validateArgs: (args: Record<string, unknown>): ValidationResult => {
      if (!args.pattern || typeof args.pattern !== 'string') {
        return { 
          valid: false, 
          reason: 'Search pattern must be a string' 
        };
      }
      
      if (args.path && typeof args.path !== 'string') {
        return {
          valid: false,
          reason: 'Path must be a string'
        };
      }
      
      return { valid: true };
    },
    
    execute: async (args: Record<string, unknown>, context: ToolContext): Promise<GrepToolResult> => {
      // Extract and type-cast each argument individually
      const pattern = args.pattern as string;
      const searchPath = args.path as string || '.';
      const recursive = args.recursive as boolean ?? true;
      const ignoreCase = args.ignoreCase as boolean || false;
      const filePattern = args.filePattern as string || '*';
      const maxResults = args.maxResults as number || 100;
      
      try {
        // Resolve the path
        const resolvedPath = path.resolve(searchPath);
        
        // Build the grep command
        // Using grep directly is more efficient than implementing in JS
        let command = 'grep';
        
        // Add options
        if (recursive) command += ' -r';
        if (ignoreCase) command += ' -i';
        
        // Add pattern (escape for shell)
        const escapedPattern = pattern.replace(/'/g, "'\\\\'");
        command += ` '${escapedPattern}'`;
        
        // Add path and file pattern
        if (filePattern !== '*') {
          // Use find to filter files first
          command = `find ${resolvedPath} -type f -name "${filePattern}" -exec ${command} {} \\;`;
        } else {
          command += ` ${resolvedPath}`;
        }
        
        // Add result limiting
        command += ` | head -n ${maxResults}`;
        
        // Execute the command
        context.logger?.debug(`Executing grep: ${command}`);
        // We need stdout but stderr is unused
        const { stdout } = await execAsync(command);
        
        // Parse the results
        const lines = stdout.trim().split('\n');
        const results: GrepResult[] = lines
          .filter(line => line.trim() !== '')
          .map(line => {
            // Try to parse the grep output format (filename:line:content)
            const match = line.match(/^([^:]+):(\d+):(.*)$/);
            if (match) {
              return {
                file: match[1],
                line: parseInt(match[2], 10),
                content: match[3]
              };
            }
            return { raw: line };
          });
        
        return {
          success: true,
          pattern,
          path: resolvedPath,
          results,
          count: results.length,
          hasMore: results.length >= maxResults
        };
      } catch (error: unknown) {
        // Check if it's just "no results" error
        if ((error as { code?: number }).code === 1 && !(error as { stderr?: string }).stderr) {
          return {
            success: true,
            pattern,
            path: searchPath,
            results: [],
            count: 0,
            hasMore: false
          };
        }
        
        context.logger?.error(`Error in grep search: ${(error as Error).message}`);
        return {
          success: false,
          pattern,
          path: searchPath,
          error: (error as Error).message,
          stderr: (error as { stderr?: string }).stderr
        };
      }
    }
  });
};