import path from 'path';
import { GlobOptions } from 'fs';
import { ExecutionAdapter } from '../types/tool';
import { FileEditToolErrorResult, FileEditToolSuccessResult } from '../tools/FileEditTool';
import { FileReadToolErrorResult, FileReadToolSuccessResult } from '../tools/FileReadTool';
import { FileEntry, LSToolErrorResult, LSToolSuccessResult } from '../tools/LSTool';
import { DockerContainerManager, ContainerInfo } from './DockerContainerManager';

/**
 * Execution adapter that runs commands in a Docker container
 */
export class DockerExecutionAdapter implements ExecutionAdapter {
  private containerManager: DockerContainerManager;
  private logger?: {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };

  /**
   * Create a Docker execution adapter with a container manager
   */
  constructor(
    containerManager: DockerContainerManager,
    options?: {
      logger?: {
        debug: (message: string, ...args: unknown[]) => void;
        info: (message: string, ...args: unknown[]) => void;
        warn: (message: string, ...args: unknown[]) => void;
        error: (message: string, ...args: unknown[]) => void;
      }
    }
  ) {
    this.containerManager = containerManager;
    this.logger = options?.logger;
  }

  /**
   * Execute a command in the Docker container
   */
  async executeCommand(command: string, workingDir?: string): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    try {
      // Convert working directory to container path if provided
      let containerWorkingDir: string | undefined;
      
      if (workingDir) {
        const containerInfo = await this.containerManager.getContainerInfo();
        if (!containerInfo) {
          throw new Error('Container is not available');
        }
        
        containerWorkingDir = this.toContainerPath(workingDir, containerInfo);
      }
      
      this.logger?.debug(`Executing command in container: ${command}`, 'tools');
      return await this.containerManager.executeCommand(command, containerWorkingDir);
    } catch (error) {
      this.logger?.error(`Error executing command in container: ${(error as Error).message}`, error, 'tools');
      return {
        stdout: '',
        stderr: `Error executing command: ${(error as Error).message}`,
        exitCode: 1
      };
    }
  }

  /**
   * Read a file from the container
   */
  async readFile(filepath: string, maxSize?: number, lineOffset?: number, lineCount?: number, encoding?: string): Promise<FileReadToolSuccessResult | FileReadToolErrorResult> {
    try {
      if (!encoding) {
        encoding = 'utf8';
      }
      if (!maxSize) {
        maxSize = 1048576; // 1MB default
      }
      if (!lineOffset) {
        lineOffset = 0;
      }
      
      // Get container info
      const containerInfo = await this.containerManager.getContainerInfo();
      if (!containerInfo) {
        return {
          success: false as const,
          path: filepath,
          error: 'Container is not available'
        };
      }
      
      // Convert to container path
      const containerPath = this.toContainerPath(filepath, containerInfo);
      
      // Check if file exists
      const { exitCode: fileExists } = await this.executeCommand(`[ -f "${containerPath}" ]`);
      if (fileExists !== 0) {
        return {
          success: false as const,
          path: filepath,
          error: `File does not exist: ${filepath}`
        };
      }
      
      // Check file size
      const { stdout: fileSizeStr } = await this.executeCommand(`stat -c %s "${containerPath}"`);
      const fileSize = parseInt(fileSizeStr.trim(), 10);
      
      if (isNaN(fileSize)) {
        return {
          success: false as const,
          path: filepath,
          error: `Unable to determine file size: ${filepath}`
        };
      }
      
      if (fileSize > maxSize) {
        return {
          success: false as const,
          path: filepath,
          error: `File is too large (${fileSize} bytes) to read. Max size: ${maxSize} bytes`
        };
      }
      
      // Read file content
      let command = `cat "${containerPath}"`;
      if (lineOffset > 0 || lineCount !== undefined) {
        command = `head -n ${lineOffset + (lineCount || 0)} "${containerPath}" | tail -n ${lineCount || '+0'}`;
      }
      
      const { stdout: content, stderr, exitCode } = await this.executeCommand(command);
      
      if (exitCode !== 0) {
        return {
          success: false as const,
          path: filepath,
          error: stderr || `Failed to read file: ${filepath}`
        };
      }
      
      // If we need to report pagination info
      if (lineOffset > 0 || lineCount !== undefined) {
        // Get total lines
        const { stdout: lineCountStr } = await this.executeCommand(`wc -l < "${containerPath}"`);
        const totalLines = parseInt(lineCountStr.trim(), 10);
        
        const startLine = lineOffset;
        const endLine = lineCount !== undefined 
          ? Math.min(startLine + lineCount, totalLines) 
          : totalLines;
        
        return {
          success: true as const,
          path: filepath,
          content: content,
          size: fileSize,
          encoding,
          pagination: {
            totalLines,
            startLine,
            endLine,
            hasMore: endLine < totalLines
          }
        };
      }
      
      return {
        success: true as const,
        path: filepath,
        content: content,
        size: fileSize,
        encoding
      };
    } catch (error) {
      return {
        success: false as const,
        path: filepath,
        error: `Error reading file: ${(error as Error).message}`
      };
    }
  }

  /**
   * Write content to a file in the container
   */
  async writeFile(filepath: string, content: string): Promise<void> {
    try {
      // Get container info
      const containerInfo = await this.containerManager.getContainerInfo();
      if (!containerInfo) {
        throw new Error('Container is not available');
      }
      
      // Make sure the path is within the working directory
      if (!this.isPathWithinWorkingDir(filepath, containerInfo)) {
        throw new Error(`Security constraint: Can only write to paths within the working directory. Attempted to write to ${filepath}`);
      }
      
      const containerPath = this.toContainerPath(filepath, containerInfo);
      
      // Create directory if it doesn't exist
      await this.executeCommand(`mkdir -p "$(dirname "${containerPath}")"`);
      
      // Write content to file using a heredoc to handle multi-line content
      await this.executeCommand(`cat > "${containerPath}" << 'EOF_QCKFX'\n${content}\nEOF_QCKFX`);
    } catch (error) {
      throw new Error(`Failed to write file: ${(error as Error).message}`);
    }
  }

  /**
   * Edit a file by replacing content
   */
  async editFile(filepath: string, searchCode: string, replaceCode: string, encoding?: string): Promise<FileEditToolSuccessResult | FileEditToolErrorResult> {
    if (!encoding) {
      encoding = 'utf8';
    }
    
    try {
      // Get container info
      const containerInfo = await this.containerManager.getContainerInfo();
      if (!containerInfo) {
        return {
          success: false as const,
          path: filepath,
          error: 'Container is not available'
        };
      }
      
      // Make sure the path is within the working directory
      if (!this.isPathWithinWorkingDir(filepath, containerInfo)) {
        return {
          success: false as const,
          path: filepath,
          error: `Security constraint: Can only modify files within the working directory. Attempted to modify ${filepath}`
        };
      }
      
      // Read the file content
      const fileResult = await this.readFile(filepath);
      if (!fileResult.success) {
        return {
          success: false as const,
          path: filepath,
          error: fileResult.error
        };
      }
      
      const fileContent = fileResult.content;
      
      // Count occurrences of the search code
      const occurrences = fileContent.split(searchCode).length - 1;
      
      if (occurrences === 0) {
        return {
          success: false as const,
          path: filepath,
          error: `Search code not found in file: ${filepath}`
        };
      }
      
      if (occurrences > 1) {
        return {
          success: false as const,
          path: filepath,
          error: `Found ${occurrences} instances of the search code. Please provide a more specific search code that matches exactly once.`
        };
      }
      
      // Replace the code (only one match at this point)
      const newContent = fileContent.replace(searchCode, replaceCode);
      
      // Write the new content
      await this.writeFile(filepath, newContent);
      
      return {
        success: true as const,
        path: filepath,
        originalContent: fileContent,
        newContent: newContent
      };
    } catch (error) {
      return {
        success: false as const,
        path: filepath,
        error: `Error editing file: ${(error as Error).message}`
      };
    }
  }

  /**
   * Find files matching a glob pattern
   */
  async glob(pattern: string, _options?: GlobOptions): Promise<string[]> {
    try {
      // Get container info
      const containerInfo = await this.containerManager.getContainerInfo();
      if (!containerInfo) {
        return [];
      }
      
      // Convert to container path pattern if it starts with a path
      const containerPattern = pattern.startsWith('/') 
        ? this.toContainerPath(pattern, containerInfo)
        : pattern;
      
      // Use find command with -path for glob-like behavior
      const { stdout, exitCode } = await this.executeCommand(`find ${containerInfo.workspacePath} -path "${containerPattern}" -type f | sort`);
      
      if (exitCode !== 0 || !stdout.trim()) {
        return [];
      }
      
      // Convert container paths back to host paths
      return stdout.trim().split('\n')
        .filter(line => line.length > 0)
        .map(containerPath => this.toHostPath(containerPath, containerInfo));
    } catch (error) {
      this.logger?.error(`Error in glob: ${(error as Error).message}`, error, 'tools');
      return [];
    }
  }

  /**
   * List directory contents
   */
  async ls(dirPath: string, showHidden: boolean = false, details: boolean = false): Promise<LSToolSuccessResult | LSToolErrorResult> {
    try {
      // Get container info
      const containerInfo = await this.containerManager.getContainerInfo();
      if (!containerInfo) {
        return {
          success: false as const,
          path: dirPath,
          error: 'Container is not available'
        };
      }
      
      // Convert to container path
      const containerPath = this.toContainerPath(dirPath, containerInfo);
      
      // Check if directory exists
      const { exitCode } = await this.executeCommand(`[ -d "${containerPath}" ]`);
      if (exitCode !== 0) {
        return {
          success: false as const,
          path: dirPath,
          error: `Directory does not exist: ${dirPath}`
        };
      }
      
      // Get directory entries
      const { stdout, stderr, exitCode: lsExitCode } = await this.executeCommand(
        `ls -1${showHidden ? 'a' : ''} "${containerPath}"`
      );
      
      if (lsExitCode !== 0) {
        return {
          success: false as const,
          path: dirPath,
          error: stderr || `Failed to list directory: ${dirPath}`
        };
      }
      
      // Parse entries
      const entries = stdout.trim().split('\n')
        .filter(name => name && name !== '.' && name !== '..');
      
      // Build entry objects
      const results: FileEntry[] = [];
      
      if (details) {
        // Get detailed information for each entry
        for (const name of entries) {
          const entryPath = path.join(containerPath, name);
          const { stdout: typeOutput } = await this.executeCommand(`
            if [ -d "${entryPath}" ]; then
              echo "directory"
            elif [ -f "${entryPath}" ]; then
              echo "file"
            elif [ -L "${entryPath}" ]; then
              echo "symlink"
            else
              echo "other"
            fi
          `);
          
          const type = typeOutput.trim();
          
          if (type === 'directory') {
            results.push({
              name,
              type,
              isDirectory: true,
              isFile: false,
              isSymbolicLink: false
            });
          } else if (type === 'file') {
            results.push({
              name,
              type,
              isDirectory: false,
              isFile: true,
              isSymbolicLink: false
            });
          } else if (type === 'symlink') {
            results.push({
              name,
              type,
              isDirectory: false,
              isFile: false,
              isSymbolicLink: true
            });
          } else {
            results.push({
              name,
              type,
              isDirectory: false,
              isFile: false,
              isSymbolicLink: false
            });
          }
        }
      } else {
        // Simple listing, just get basic type info
        for (const name of entries) {
          const entryPath = path.join(containerPath, name);
          const isDir = await this.executeCommand(`[ -d "${entryPath}" ]`);
          const isFile = await this.executeCommand(`[ -f "${entryPath}" ]`);
          const isLink = await this.executeCommand(`[ -L "${entryPath}" ]`);
          
          results.push({
            name,
            isDirectory: isDir.exitCode === 0,
            isFile: isFile.exitCode === 0,
            isSymbolicLink: isLink.exitCode === 0
          });
        }
      }
      
      return {
        success: true as const,
        path: dirPath,
        entries: results,
        count: results.length
      };
    } catch (error) {
      return {
        success: false as const,
        path: dirPath,
        error: `Error listing directory: ${(error as Error).message}`
      };
    }
  }

  /**
   * Convert a host path to a container path
   */
  private toContainerPath(hostPath: string, containerInfo: ContainerInfo): string {
    // Ensure absolute path
    const absolutePath = path.isAbsolute(hostPath) 
      ? hostPath 
      : path.resolve(hostPath);
    
    // Check if path is within project directory
    if (absolutePath.startsWith(containerInfo.projectPath)) {
      return path.join(
        containerInfo.workspacePath,
        path.relative(containerInfo.projectPath, absolutePath)
      );
    }
    
    // For paths outside project directory, throw error
    throw new Error(`Path is outside project directory: ${hostPath}`);
  }

  /**
   * Convert a container path to a host path
   */
  private toHostPath(containerPath: string, containerInfo: ContainerInfo): string {
    if (containerPath.startsWith(containerInfo.workspacePath)) {
      return path.join(
        containerInfo.projectPath,
        containerPath.substring(containerInfo.workspacePath.length + 1)
      );
    }
    return containerPath;
  }

  /**
   * Check if a path is within the working directory
   */
  private isPathWithinWorkingDir(filepath: string, containerInfo: ContainerInfo): boolean {
    const absolutePath = path.isAbsolute(filepath) 
      ? filepath 
      : path.resolve(filepath);
    
    return absolutePath.startsWith(containerInfo.projectPath);
  }
}