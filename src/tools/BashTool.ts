/**
 * BashTool - Executes shell commands in the environment
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createTool } from './createTool';
import { Tool, ToolContext, ValidationResult } from '../types/tool';

// Promisify exec for async/await usage
const execAsync = promisify(exec);

export interface BashToolArgs {
  command: string;
  workingDir?: string;
}

interface BashToolSuccessResult {
  success: true;
  stdout: string;
  stderr: string;
  command: string;
}

interface BashToolErrorResult {
  success: false;
  error: string;
  stderr?: string;
  stdout?: string;
  command: string;
}

export type BashToolResult = BashToolSuccessResult | BashToolErrorResult;

/**
 * Creates a tool for executing bash/shell commands
 * @returns The bash tool interface
 */
export const createBashTool = (): Tool => {
  return createTool({
    id: 'bash',
    name: 'BashTool',
    description: 'Executes shell commands in your environment. Use this tool when you need to run terminal commands.',
    requiresPermission: true,
    
    // Enhanced parameter descriptions
    parameters: {
      command: {
        type: "string",
        description: "The shell command to execute. Examples: 'ls -la', 'find . -name \"*.js\"', 'cat file.txt'"
      },
      workingDir: {
        type: "string",
        description: "Working directory for command execution. Use relative paths like 'src', '../', 'docs/v2' or absolute paths. Default: current directory"
      }
    },
    requiredParameters: ["command"],
    
    validateArgs: (args: Record<string, unknown>): ValidationResult => {
      if (typeof args === 'object' && args !== null) {
        if (!args.command || typeof args.command !== 'string') {
          return { 
            valid: false, 
            reason: 'Command must be a string' 
          };
        }
        return { valid: true };
      }
      
      return { 
        valid: false, 
        reason: 'Invalid command format. Expected string or object with command property' 
      };
    },
    
    execute: async (args: Record<string, unknown>, context: ToolContext): Promise<BashToolResult> => {
      // Extract arguments
      const commandStr = args.command as string;
      const workingDir = args.workingDir as string | undefined;
      
      const options = workingDir ? { cwd: workingDir } : undefined;
      
      try {
        context.logger?.debug(`Executing bash command: ${commandStr}`);
        const result = await execAsync(commandStr, options);
        const stdout = result.stdout.toString();
        const stderr = result.stderr.toString();
        
        return { 
          success: true,
          stdout, 
          stderr,
          command: commandStr
        };
      } catch (error: unknown) {
        const err = error as Error & { stderr?: string; stdout?: string };
        context.logger?.error(`Error executing bash command: ${err.message}`);
        return { 
          success: false,
          error: err.message,
          stderr: err.stderr,
          stdout: err.stdout,
          command: commandStr
        };
      }
    }
  });
};