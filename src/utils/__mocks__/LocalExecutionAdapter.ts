/**
 * Mock implementation of LocalExecutionAdapter
 */
import { ExecutionAdapter } from '../../types/tool';
import { LSToolErrorResult, LSToolSuccessResult } from '../../tools/LSTool';
import { FileReadToolErrorResult, FileReadToolSuccessResult } from '../../tools/FileReadTool';
import { FileEditToolErrorResult, FileEditToolSuccessResult } from '../../tools/FileEditTool';

export class LocalExecutionAdapter implements ExecutionAdapter {
  /**
   * Mock implementation
   */
  public static async create(): Promise<LocalExecutionAdapter> {
    return new LocalExecutionAdapter();
  }

  async readFile(): Promise<FileReadToolSuccessResult | FileReadToolErrorResult> {
    return {
      success: true,
      path: 'mockFile.txt',
      content: 'Mock file content',
      size: 18,
      encoding: 'utf8'
    };
  }

  async writeFile(): Promise<void> {
    return Promise.resolve();
  }
  
  async executeCommand() {
    return { stdout: 'Mock output', stderr: '', exitCode: 0 };
  }
  
  async glob() {
    return ['mockFile1.txt', 'mockFile2.txt'];
  }
  
  async editFile(): Promise<FileEditToolSuccessResult | FileEditToolErrorResult> {
    return {
      success: true,
      path: 'mockFile.txt',
      originalContent: 'Original content',
      newContent: 'New content'
    };
  }

  async ls(): Promise<LSToolSuccessResult | LSToolErrorResult> {
    return {    
      success: true,
      path: '/mock',
      entries: [
        {
          name: 'mockFile.txt',
          type: 'file',
          isDirectory: false,
          isFile: true,
          isSymbolicLink: false
        }
      ],
      count: 1
    };
  }

  async generateDirectoryMap(rootPath: string, maxDepth: number = 10): Promise<string> {
    return `<context name="directoryStructure">Below is a snapshot of this project's file structure at the start of the conversation. This snapshot will NOT update during the conversation. It skips over .gitignore patterns.

- ${rootPath}/
  - mockDir/
    - mockFile.txt
  - mockFile2.txt
</context>`;
  }
}