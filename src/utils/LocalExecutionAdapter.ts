import { exec } from 'child_process';
import fs, { GlobOptions } from 'fs';
import { promisify } from 'util';
import { ExecutionAdapter } from '../types/tool';
import path from 'path';
import glob from 'glob';
import { FileReadToolSuccessResult, FileReadToolErrorResult } from '../tools/FileReadTool';
import { FileEditToolSuccessResult, FileEditToolErrorResult } from '../tools/FileEditTool';
import { FileEntry, LSToolSuccessResult, LSToolErrorResult } from '../tools/LSTool';
import { LogCategory } from './logger';
import { AgentEvents, AgentEventType, EnvironmentStatusEvent } from './sessionUtils';

const execAsync = promisify(exec);
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const globAsync = promisify(glob);

export class LocalExecutionAdapter implements ExecutionAdapter {
  private logger?: {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };

  constructor(options?: { 
    logger?: {
      debug: (message: string, ...args: unknown[]) => void;
      info: (message: string, ...args: unknown[]) => void;
      warn: (message: string, ...args: unknown[]) => void;
      error: (message: string, ...args: unknown[]) => void;
    }
  }) {
    this.logger = options?.logger;
    
    // Emit environment status as ready immediately for local adapter
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
      environmentType: 'local',
      status,
      isReady,
      error
    };
    
    this.logger?.info(`Emitting local environment status: ${status}, ready=${isReady}`, LogCategory.SYSTEM);
    AgentEvents.emit(AgentEventType.ENVIRONMENT_STATUS_CHANGED, statusEvent);
  }
  async executeCommand(command: string, workingDir?: string) {
    try {
      const options = workingDir ? { cwd: workingDir } : undefined;
      const result = await execAsync(command, options);
      return {
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
        exitCode: 0
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return {
          stdout: '',
          stderr: error.message,
          exitCode: 1
        };
      }
      return {
        stdout: '',
        stderr: 'Unknown error',
        exitCode: 1
      };
    }
  }

  async editFile(filepath: string, searchCode: string, replaceCode: string, encoding?: string) {
    if (!encoding) {
      encoding = 'utf8';
    }
    try {
      // Resolve the path
      const resolvedPath = path.resolve(filepath);
      
      // Check if file exists
      let fileContent = '';
      
      try {
        const stats = await fs.promises.stat(resolvedPath);
        if (!stats.isFile()) {
          return {
            success: false as const,
            path: filepath,
            error: `Path exists but is not a file: ${filepath}`
          } as FileEditToolErrorResult;
        }
        
        // Read file content
        fileContent = (await readFileAsync(resolvedPath, encoding as BufferEncoding)).toString();
      } catch (error: unknown) {
        const err = error as Error & { code?: string };
        if (err.code === 'ENOENT') {
          return {
            success: false as const,
            path: filepath,
            error: `File does not exist: ${filepath}`
          } as FileEditToolErrorResult;
        } else {
          throw error; // Re-throw unexpected errors
        }
      }
      
      // Normalize line endings to ensure consistent handling
      const normalizedContent = fileContent.replace(/\r\n/g, '\n');
      const normalizedSearchCode = searchCode.replace(/\r\n/g, '\n');
      const normalizedReplaceCode = replaceCode.replace(/\r\n/g, '\n');
      
      // Count occurrences of the search code in the normalized content
      const occurrences = normalizedContent.split(normalizedSearchCode).length - 1;
      
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
      
      // Use a more robust replacement approach
      // First, find the exact position of the search code
      const searchIndex = normalizedContent.indexOf(normalizedSearchCode);
      
      if (searchIndex === -1) {
        // This should not happen since we already checked occurrences
        return {
          success: false as const,
          path: filepath,
          error: `Internal error: Search code not found despite occurrence check`
        } as FileEditToolErrorResult;
      }
      
      // Extract the parts before and after the search code
      const prefixContent = normalizedContent.substring(0, searchIndex);
      const suffixContent = normalizedContent.substring(searchIndex + normalizedSearchCode.length);
      
      // Construct the new content by joining the parts with the replacement in between
      const newContent = prefixContent + normalizedReplaceCode + suffixContent;
      
      // Write the new content
      await writeFileAsync(resolvedPath, newContent, encoding as BufferEncoding);
      
      return {
        success: true as const,
        path: resolvedPath,
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

  async glob(pattern: string, options: GlobOptions = {}) {
    return globAsync(pattern, options);
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
    
    // Resolve the path (could add security checks here)
    const resolvedPath = path.resolve(filepath);
      
    // Check if file exists and get stats
    const stats = await fs.promises.stat(resolvedPath);
    
    if (!stats.isFile()) {
      return {
        success: false as const,
        path: filepath,
        error: `Path exists but is not a file: ${filepath}`
      } as FileReadToolErrorResult;
    }
    
    // Check file size
    if (stats.size > maxSize) {
      return {
        success: false as const,
        path: filepath,
        error: `File is too large (${stats.size} bytes) to read. Max size: ${maxSize} bytes`
      } as FileReadToolErrorResult;
    }
    
    // Read the file
    let content = '';
    if (lineOffset > 0 || lineCount !== undefined) {
      // Use head and tail with nl for pagination, starting line numbers from lineOffset+1
      const { stdout } = await execAsync(`head -n ${lineOffset + (lineCount || 0)} "${resolvedPath}" | tail -n ${lineCount || '+0'} | nl -v ${lineOffset + 1}`);
      content = stdout;
    } else {
      // Use nl for the whole file
      const { stdout } = await execAsync(`nl "${resolvedPath}"`);
      content = stdout;
    }
    
    // Handle line pagination if requested
    if (lineOffset > 0 || lineCount !== undefined) {
      const lines = content.split('\n');
      const startLine = Math.min(lineOffset, lines.length);
      const endLine = lineCount !== undefined 
        ? Math.min(startLine + lineCount, lines.length) 
        : lines.length;
      
      content = lines.slice(startLine, endLine).join('\n');
      
      return {
        success: true as const,
        path: resolvedPath,
        content,
        size: stats.size,
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
      path: resolvedPath,
      content,
      size: stats.size,
      encoding
    } as FileReadToolSuccessResult;
  } 

  async writeFile(path: string, content: string) {
    return writeFileAsync(path, content);
  }

  async ls(dirPath: string, showHidden: boolean = false, details: boolean = false) {
    try {
      // Resolve the path
      const resolvedPath = path.resolve(dirPath);
      
      // Check if directory exists
      try {
        const stats = await fs.promises.stat(resolvedPath);
        if (!stats.isDirectory()) {
          return {
            success: false as const,
            path: dirPath,
            error: `Path exists but is not a directory: ${dirPath}`
          } as LSToolErrorResult;
        }
      } catch {
        return {
          success: false as const,
          path: dirPath,
          error: `Directory does not exist: ${dirPath}`
        } as LSToolErrorResult;
      }
      
      // Read directory contents
      this.logger?.debug(`Listing directory: ${resolvedPath}`, LogCategory.TOOLS);
      const entries = await fs.promises.readdir(resolvedPath, { withFileTypes: true });
      
      // Filter hidden files if needed
      const filteredEntries = showHidden ? 
        entries : 
        entries.filter(entry => !entry.name.startsWith('.'));
      
      // Format the results
      let results: FileEntry[];
      
      if (details) {
        // Get detailed information for all entries more efficiently
        // Instead of using Promise.all which creates many promises,
        // we'll use a more efficient approach with a single loop
        results = [];
        
        for (const entry of filteredEntries) {
          const entryPath = path.join(resolvedPath, entry.name);
          try {
            const stats = await fs.promises.stat(entryPath);
            results.push({
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
            });
          } catch (err: unknown) {
            results.push({
              name: entry.name,
              isDirectory: false,
              isFile: false,
              isSymbolicLink: false,
              error: (err as Error).message
            });
          }
        }
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
        success: true as const,
        path: resolvedPath,
        entries: results,
        count: results.length
      } as LSToolSuccessResult;
    } catch (error: unknown) {
      this.logger?.error(`Error listing directory: ${(error as Error).message}`, error, LogCategory.TOOLS);
      return {
        success: false as const,
        path: dirPath,
        error: (error as Error).message
      } as LSToolErrorResult;
    }
  }
}