import { Sandbox } from 'e2b';
import { FileEditToolErrorResult, FileEditToolSuccessResult } from '../tools/FileEditTool';
import { FileReadToolErrorResult, FileReadToolSuccessResult } from '../tools/FileReadTool';
import { ExecutionAdapter } from '../types/tool';
import { FileEntry, LSToolErrorResult, LSToolSuccessResult } from '../tools/LSTool';
import path from 'path';

export class E2BExecutionAdapter implements ExecutionAdapter {
  private sandbox: Sandbox;

  private constructor(sandbox: Sandbox) {
    this.sandbox = sandbox;
  }

  /**
   * Creates a new E2BExecutionAdapter instance with a connected sandbox
   * @param sandboxId The ID of the sandbox to connect to
   * @returns A fully initialized E2BExecutionAdapter
   * @throws Error if connection to the sandbox fails
   */
  public static async create(sandboxId: string): Promise<E2BExecutionAdapter> {
    try {
      const sandbox = await Sandbox.connect(sandboxId);
      return new E2BExecutionAdapter(sandbox);
    } catch (error) {
      console.error('Failed to connect to E2B sandbox:', error);
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
      let fileContent = await this.sandbox.files.read(filepath);
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
  
  async glob(pattern: string) {
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
      console.log(`Listing directory: ${dirPath}`);
      const entries = await this.sandbox.files.list(dirPath);

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
            const filePath = path.join(dirPath, entry.name);
            const handle = await this.sandbox.commands.run(`stat -c "%F,%s,%Y,%Z" ${filePath}`, {
              background: true
            });
            const result = await handle.wait();
            const stats = result.stdout.trim().split('\n');
            const [type, size, mtime, ctime] = stats;
            return {
              name: entry.name, 
              type: type,
              size: parseInt(size),
              modified: new Date(mtime),
              created: new Date(ctime),
              isDirectory: type === 'directory',
              isFile: type === 'file',
              isSymbolicLink: type === 'symbolic_link'
            };
          })
        );
      } else {
        results = filteredEntries.map(entry => ({
          name: entry.name,
          type: entry.type,
          isDirectory: entry.type && entry.type === 'dir' || false,
          isFile: entry.type && entry.type === 'file' || false,
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
