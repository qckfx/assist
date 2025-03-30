import { PreviewGenerator, PreviewOptions } from '../PreviewGenerator';
import { Tool } from '../../../../types/tool';
import { ToolPreviewData, PreviewContentType } from '../../../../types/preview';

// Create a concrete implementation for testing
class TestPreviewGenerator extends PreviewGenerator {
  async generatePreview(
    tool: Tool, 
    _args: Record<string, unknown>, 
    result: unknown,
    options?: PreviewOptions
  ): Promise<ToolPreviewData | null> {
    const opts = { ...this.defaultOptions, ...options };
    
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    const briefContent = this.truncateToLines(resultStr, opts.maxBriefLines || 10);
    
    return this.createBasicPreview(
      PreviewContentType.TEXT,
      briefContent,
      resultStr.length > briefContent.length,
      { testMetadata: true }
    );
  }
  
  canHandle(tool: Tool, _result: unknown): boolean {
    return tool.id === 'TestTool';
  }
}

describe('PreviewGenerator', () => {
  const generator = new TestPreviewGenerator();
  const mockTool = { id: 'TestTool', name: 'Test Tool' } as Tool;
  
  it('should truncate text correctly', () => {
    const longText = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6';
    const truncated = generator['truncateToLines'](longText, 3);
    
    expect(truncated).toEqual('Line 1\nLine 2\nLine 3\n...');
    expect(truncated.split('\n').length).toBe(4); // 3 lines + '...'
  });
  
  it('should not truncate text that is shorter than maxLines', () => {
    const shortText = 'Line 1\nLine 2';
    const result = generator['truncateToLines'](shortText, 5);
    
    expect(result).toEqual(shortText);
  });
  
  it('should create basic preview with correct structure', () => {
    const preview = generator['createBasicPreview'](
      PreviewContentType.TEXT,
      'Test content',
      true,
      { key: 'value' }
    );
    
    expect(preview).toEqual({
      contentType: PreviewContentType.TEXT,
      briefContent: 'Test content',
      hasFullContent: true,
      metadata: { key: 'value' }
    });
  });
  
  it('should generate preview with correct content', async () => {
    const testInput = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6';
    const preview = await generator.generatePreview(mockTool, {}, testInput, { maxBriefLines: 2 });
    
    expect(preview).not.toBeNull();
    if (preview) {
      expect(preview.contentType).toBe(PreviewContentType.TEXT);
      expect(preview.briefContent).toEqual('Line 1\nLine 2\n...');
      expect(preview.hasFullContent).toBe(true);
      expect(preview.metadata).toEqual({ testMetadata: true });
    }
  });
});