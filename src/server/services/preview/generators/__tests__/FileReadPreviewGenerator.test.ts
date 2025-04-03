import { FileReadPreviewGenerator } from '../FileReadPreviewGenerator';
import { Tool, ToolCategory } from '../../../../../types/tool';
import { PreviewContentType } from '../../../../../types/preview';
import { FileReadToolResult } from '../../../../../tools/FileReadTool';

describe('FileReadPreviewGenerator', () => {
  const generator = new FileReadPreviewGenerator();
  
  const mockReadTool = { 
    id: 'file_read', 
    name: 'FileReadTool',
    category: ToolCategory.READONLY,
    requiresPermission: false,
    parameters: {},
    requiredParameters: [],
    description: 'Test tool',
    // Add required properties from Tool interface
    execute: async () => ({ success: true } as unknown),
    validateArgs: () => ({ valid: true })
  } as unknown as Tool;
  
  const mockResult: FileReadToolResult = {
    success: true,
    path: 'test.txt',
    content: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10',
    size: 100,
    encoding: 'utf8'
  };
  
  // Create a very short result
  const shortMockResult: FileReadToolResult = {
    success: true,
    path: 'test-short.txt',
    content: 'Single line file',
    size: 16,
    encoding: 'utf8'
  };
  
  // Create a very long result
  const longContent = Array.from({ length: 50 }, (_, i) => `Line ${i + 1} with some content`).join('\n');
  const longMockResult: FileReadToolResult = {
    success: true,
    path: 'test-long.txt',
    content: longContent,
    size: longContent.length,
    encoding: 'utf8'
  };
  
  it('should determine if a file is code based on extension', () => {
    expect(generator['isCodeFile']('test.js')).toBe(true);
    expect(generator['isCodeFile']('test.ts')).toBe(true);
    expect(generator['isCodeFile']('test.py')).toBe(true);
    expect(generator['isCodeFile']('test.txt')).toBe(false);
    expect(generator['isCodeFile']('test.md')).toBe(true); // .md is considered code for syntax highlighting
  });
  
  it('should get correct language for syntax highlighting', () => {
    expect(generator['getLanguageFromFilePath']('test.js')).toBe('javascript');
    expect(generator['getLanguageFromFilePath']('test.py')).toBe('python');
    expect(generator['getLanguageFromFilePath']('test.txt')).toBe('text');
    expect(generator['getLanguageFromFilePath']('')).toBe('text');
  });
  
  it('should correctly identify if it can handle a tool', () => {
    expect(generator.canHandle(mockReadTool, mockResult)).toBe(true);
    expect(generator.canHandle({ ...mockReadTool, id: 'OtherTool' }, mockResult)).toBe(false);
    // ToolInfo doesn't have a category field anymore
    expect(generator.canHandle({ id: 'bash', name: 'Bash' }, mockResult)).toBe(false);
    expect(generator.canHandle(mockReadTool, {})).toBe(false);
  });
  
  it('should generate text preview for non-code files', async () => {
    const preview = await generator.generatePreview(
      mockReadTool, 
      { file_path: 'test.txt' }, 
      mockResult
    );
    
    expect(preview).not.toBeNull();
    if (preview) {
      expect(preview.contentType).toBe(PreviewContentType.TEXT);
      expect(preview.briefContent.split('\n').length).toBeLessThanOrEqual(10); // Check that we're not getting too many lines
      expect(preview.metadata).toHaveProperty('fileName', 'test.txt');
    }
  });
  
  it('should generate code preview for code files', async () => {
    const preview = await generator.generatePreview(
      mockReadTool, 
      { file_path: 'test.js' }, 
      mockResult
    );
    
    expect(preview).not.toBeNull();
    if (preview) {
      expect(preview.contentType).toBe(PreviewContentType.CODE);
      expect(preview.metadata).toHaveProperty('fileName', 'test.js');
      if ('language' in preview) {
        expect(preview.language).toBe('javascript');
      }
    }
  });
  
  it('should set hasFullContent=false for short content', async () => {
    // Override maxBriefLines to make sure short content fits
    const options = { maxBriefLines: 5 };
    
    const preview = await generator.generatePreview(
      mockReadTool, 
      { file_path: 'test-short.txt' }, 
      shortMockResult,
      options
    );
    
    expect(preview).not.toBeNull();
    if (preview) {
      expect(preview.hasFullContent).toBe(false);
      expect(preview.briefContent).toEqual(shortMockResult.content);
    }
  });
  
  it('should set hasFullContent=true for long content', async () => {
    // Set a small maxBriefLines to ensure content gets truncated
    const options = { maxBriefLines: 5 };
    
    const preview = await generator.generatePreview(
      mockReadTool, 
      { file_path: 'test-long.txt' }, 
      longMockResult,
      options
    );
    
    expect(preview).not.toBeNull();
    if (preview) {
      expect(preview.hasFullContent).toBe(true);
      expect(preview.briefContent.split('\n').length).toBeLessThanOrEqual(6); // 5 lines + '...'
      expect(preview.briefContent.length).toBeLessThan(longMockResult.content.length);
    }
  });
});