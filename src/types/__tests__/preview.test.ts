import { PreviewMode, PreviewContentType, ToolPreviewData } from '../preview';

describe('Preview Types', () => {
  it('should define the correct preview modes', () => {
    expect(PreviewMode.RETRACTED).toBe('retracted');
    expect(PreviewMode.BRIEF).toBe('brief');
    expect(PreviewMode.COMPLETE).toBe('complete');
  });
  
  it('should define the correct content types', () => {
    expect(PreviewContentType.TEXT).toBe('text');
    expect(PreviewContentType.CODE).toBe('code');
    expect(PreviewContentType.DIFF).toBe('diff');
    expect(PreviewContentType.DIRECTORY).toBe('directory');
    expect(PreviewContentType.JSON).toBe('json');
    expect(PreviewContentType.IMAGE).toBe('image');
    expect(PreviewContentType.BINARY).toBe('binary');
  });
  
  it('should allow creating a valid text preview', () => {
    const textPreview: ToolPreviewData = {
      contentType: PreviewContentType.TEXT,
      briefContent: 'Sample text content',
      hasFullContent: true,
      metadata: {
        lineCount: 10
      }
    };
    
    expect(textPreview.contentType).toBe(PreviewContentType.TEXT);
    expect(textPreview.briefContent).toBe('Sample text content');
  });
});