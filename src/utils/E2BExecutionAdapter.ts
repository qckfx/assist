import { Sandbox } from 'e2b';
import { FileEditToolErrorResult, FileEditToolSuccessResult } from '../tools/FileEditTool';
import { FileReadToolErrorResult, FileReadToolSuccessResult } from '../tools/FileReadTool';
import { ExecutionAdapter } from '../types/tool';
import { FileEntry, LSToolErrorResult, LSToolSuccessResult } from '../tools/LSTool';
import path from 'path';
import { GlobOptions } from 'fs';
import { LogCategory } from './logger';
import { AgentEvents, AgentEventType, EnvironmentStatusEvent } from './sessionUtils';

export class E2BExecutionAdapter implements ExecutionAdapter {
  private sandbox: Sandbox;
  private logger?: {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };

  private constructor(sandbox: Sandbox, options?: { 
    logger?: {
      debug: (message: string, ...args: unknown[]) => void;
      info: (message: string, ...args: unknown[]) => void;
      warn: (message: string, ...args: unknown[]) => void;
      error: (message: string, ...args: unknown[]) => void;
    }
  }) {
    this.sandbox = sandbox;
    this.logger = options?.logger;
    
    // Emit connected status since the sandbox is already connected at this point
    this.emitEnvironmentStatus('connected', true);
  }
  
  /**
   * Emit environment status event
   */
  private emitEnvironmentStatus(
    status: 'initializing' | 'connecting' | 'connected' | 'disconnected' | 'error',
    isReady: boolean,
    error?: string
  ): void {
    const statusEvent: EnvironmentStatusEvent = {
      environmentType: 'e2b',
      status,
      isReady,
      error
    };
    
    this.logger?.info(`Emitting E2B environment status: ${status}, ready=${isReady}`, LogCategory.SYSTEM);
    AgentEvents.emit(AgentEventType.ENVIRONMENT_STATUS_CHANGED, statusEvent);
  }

  /**
   * Creates a new E2BExecutionAdapter instance with a connected sandbox
   * @param sandboxId The ID of the sandbox to connect to
   * @param options Optional configuration options
   * @returns A fully initialized E2BExecutionAdapter
   * @throws Error if connection to the sandbox fails
   */
  public static async create(sandboxId: string, options?: { 
    logger?: {
      debug: (message: string, ...args: unknown[]) => void;
      info: (message: string, ...args: unknown[]) => void;
      warn: (message: string, ...args: unknown[]) => void;
      error: (message: string, ...args: unknown[]) => void;
    }
  }): Promise<E2BExecutionAdapter> {
    try {
      // Emit initializing status before connecting
      if (options?.logger) {
        options.logger.info('E2B sandbox connecting...', LogCategory.SYSTEM);
      }
      
      // Emit event from static context before instance is created
      const initStatusEvent: EnvironmentStatusEvent = {
        environmentType: 'e2b',
        status: 'connecting',
        isReady: false
      };
      AgentEvents.emit(AgentEventType.ENVIRONMENT_STATUS_CHANGED, initStatusEvent);
      
      const sandbox = await Sandbox.connect(sandboxId);
      return new E2BExecutionAdapter(sandbox, options);
    } catch (error) {
      if (options?.logger) {
        options.logger.error('Failed to connect to E2B sandbox:', error, LogCategory.SYSTEM);
      } else {
        console.error('Failed to connect to E2B sandbox:', error);
      }
      
      // Emit error status from static context
      const errorStatusEvent: EnvironmentStatusEvent = {
        environmentType: 'e2b',
        status: 'error',
        isReady: false,
        error: (error as Error).message
      };
      AgentEvents.emit(AgentEventType.ENVIRONMENT_STATUS_CHANGED, errorStatusEvent);
      
      throw error;
    }
  }

  async readFile(filepath: string, maxSize?: number, lineOffset?: number, lineCount?: number, encoding?: string) {
    if (!encoding) {
      encoding = 'utf8';
    }
    if (!maxSize) {
      maxSize = 1048576;
    }
    if (!lineOffset) {
      lineOffset = 0;
    }
    if (!lineCount) {
      lineCount = undefined;
    }
    try {
      const exists = await this.sandbox.files.exists(filepath);
      if (!exists) {
        return {
          success: false as const,
          path: filepath,
          error: `File does not exist: ${filepath}`
        } as FileReadToolErrorResult;
      }
      let fileContent = '';
      if (lineOffset > 0 || lineCount !== undefined) {
        // Use head and tail with nl for pagination, starting line numbers from lineOffset+1
        const { stdout } = await this.sandbox.commands.run(`head -n ${lineOffset + (lineCount || 0)} "${filepath}" | tail -n ${lineCount || '+0'} | nl -v ${lineOffset + 1}`);
        fileContent = stdout;
      } else {
        // Use nl for the whole file
        const { stdout } = await this.sandbox.commands.run(`nl "${filepath}"`);
        fileContent = stdout;
      }
      
      // Handle line pagination if requested
      if (lineOffset > 0 || lineCount !== undefined) {
        const lines = fileContent.split('\n');
        const startLine = Math.min(lineOffset, lines.length);
        const endLine = lineCount !== undefined 
          ? Math.min(startLine + lineCount, lines.length) 
          : lines.length;
        
        fileContent = lines.slice(startLine, endLine).join('\n');
        
        return {
          success: true as const,
          path: filepath,
          content: fileContent,
          size: fileContent.length,
          encoding,
          pagination: {
            totalLines: lines.length,
            startLine,
            endLine,
            hasMore: endLine < lines.length
          }
        } as FileReadToolSuccessResult;
      }
      
      return {
        success: true as const,
        path: filepath,
        content: fileContent,
        size: fileContent.length,
        encoding
      } as FileReadToolSuccessResult;
    } catch (error: unknown) {
      const err = error as Error;
      throw new Error(`Failed to read file: ${err.message}`);
    }
  }

  async writeFile(filepath: string, content: string) {
    await this.sandbox.files.write(filepath, content);
  }
  
  async executeCommand(command: string, workingDir?: string) {
    return await this.sandbox.commands.run(command, { cwd: workingDir });
  }
  
  async glob(pattern: string, _options?: GlobOptions) {
    try {
      // First try using the glob command if it exists
      const globCheck = await this.sandbox.commands.run('which glob || echo "not_found"');
      
      if (!globCheck.stdout.includes('not_found')) {
        // If glob command exists, use it
        const result = await this.sandbox.commands.run(`glob "${pattern}"`);
        return result.stdout.trim().split('\n').filter(line => line.length > 0);
      } else {
        // Fall back to find command
        const result = await this.sandbox.commands.run(`find . -type f -path "${pattern}" -not -path "*/node_modules/*" -not -path "*/\\.*"`);
        return result.stdout.trim().split('\n').filter(line => line.length > 0);
      }
    } catch {
      // If any error occurs, fall back to the most basic implementation
      const result = await this.sandbox.commands.run(`ls -la ${pattern}`);
      return result.stdout.trim().split('\n').filter(line => line.length > 0);
    }
  }
  
  async editFile(filepath: string, searchCode: string, replaceCode: string, encoding?: string) {
    if (!encoding) {
      encoding = 'utf8';
    }
    try {
      const exists = await this.sandbox.files.exists(filepath);
      if (!exists) {
        return {
          success: false as const,
          path: filepath,
          error: `File does not exist: ${filepath}`
        } as FileEditToolErrorResult;
      }
      const fileContent = await this.sandbox.files.read(filepath);

      // Count occurrences of the search code
      // Using string split approach instead of regex for exact matching
      const occurrences = fileContent.split(searchCode).length - 1;
    
      if (occurrences === 0) {
        return {
          success: false as const,
          path: filepath,
          error: `Search code not found in file: ${filepath}`
        } as FileEditToolErrorResult;
      }
    
      if (occurrences > 1) {
        return {
          success: false as const,
          path: filepath,
          error: `Found ${occurrences} instances of the search code. Please provide a more specific search code that matches exactly once.`
        } as FileEditToolErrorResult;
      }
    
      // Replace the code (only one match at this point)
      const newContent = fileContent.replace(searchCode, replaceCode);
    
      await this.sandbox.files.write(filepath, newContent);
      return {
        success: true as const,
        path: filepath,
        originalContent: fileContent,
        newContent: newContent
      } as FileEditToolSuccessResult;
    } catch (error: unknown) {
      const err = error as Error;
      return {
        success: false as const,
        path: filepath,
        error: err.message
      } as FileEditToolErrorResult;
    }
  }

  async ls(dirPath: string, showHidden: boolean = false, details: boolean = false) {
    try {
      const exists = await this.sandbox.files.exists(dirPath);
      if (!exists) {
        return {
          success: false as const,
          path: dirPath,
          error: `Directory does not exist: ${dirPath}`
        } as LSToolErrorResult;
      }
      
      // Read directory contents
      this.logger?.debug(`Listing directory: ${dirPath}`, LogCategory.TOOLS);
      const entries = await this.sandbox.files.list(dirPath);

      // Filter hidden files if needed
      const filteredEntries = showHidden ? 
        entries : 
        entries.filter(entry => !entry.name.startsWith('.'));
      
      // Format the results
      let results: FileEntry[];
      
      if (details) {
        // Get detailed information for all entries in a single command
        // This is much more efficient than making individual stat calls
        const filePaths = filteredEntries.map(entry => path.join(dirPath, entry.name));
        
        // Create a temporary script to get stats for all files at once
        const scriptContent = `
          for path in ${filePaths.map(p => `"${p}"`).join(' ')}; do
            if [ -e "$path" ]; then
              stat -c "%n|%F|%s|%Y|%Z" "$path"
            fi
          done
        `;
        
        const { stdout } = await this.sandbox.commands.run(scriptContent);
        
        // Parse the output
        const statsMap = new Map<string, { type: string, size: number, mtime: number, ctime: number }>();
        
        stdout.trim().split('\n').forEach(line => {
          const [name, type, size, mtime, ctime] = line.split('|');
          if (name && type) {
            statsMap.set(name, {
              type,
              size: parseInt(size, 10),
              mtime: parseInt(mtime, 10),
              ctime: parseInt(ctime, 10)
            });
          }
        });
        
        // Build results
        results = filteredEntries.map(entry => {
          const stats = statsMap.get(entry.name);
          
          if (stats) {
            return {
              name: entry.name,
              type: stats.type,
              size: stats.size,
              modified: new Date(stats.mtime * 1000),
              created: new Date(stats.ctime * 1000),
              isDirectory: stats.type === 'directory',
              isFile: stats.type === 'regular file',
              isSymbolicLink: stats.type === 'symbolic link'
            };
          } else {
            // Fallback to basic info if stats not available
            return {
              name: entry.name,
              type: entry.type,
              isDirectory: entry.type === 'dir',
              isFile: entry.type === 'file',
              isSymbolicLink: false
            };
          }
        });
      } else {
        // Simple listing
        results = filteredEntries.map(entry => ({
          name: entry.name,
          type: entry.type,
          isDirectory: entry.type === 'dir',
          isFile: entry.type === 'file',
          isSymbolicLink: false // E2B doesn't give a way to check
        }));
      }

      return {    
        success: true as const,
        path: dirPath,
        entries: results,
        count: results.length
      } as LSToolSuccessResult;
    } catch (error: unknown) {
      const err = error as Error;
      return {
        success: false as const,
        path: dirPath,
        error: err.message
      } as LSToolErrorResult;
    }
  }
}
