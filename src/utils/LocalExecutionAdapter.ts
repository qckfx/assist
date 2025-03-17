import { exec } from 'child_process';
  import fs, { GlobOptions } from 'fs';
  import { promisify } from 'util';
  import { ExecutionAdapter } from '../types/tool';
  import path from 'path';
  import glob from 'glob';
  import { FileReadToolSuccessResult, FileReadToolErrorResult } from '../tools/FileReadTool';
  import { FileEditToolSuccessResult, FileEditToolErrorResult } from '../tools/FileEditTool';

  const execAsync = promisify(exec);
  const readFileAsync = promisify(fs.readFile);
  const writeFileAsync = promisify(fs.writeFile);
  const globAsync = promisify(glob);

  export class LocalExecutionAdapter implements ExecutionAdapter {
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
      let content = (await readFileAsync(resolvedPath, encoding as BufferEncoding)).toString();
      
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
  }