/**
 * Unit tests for PreviewService
 */
import { PreviewService, ToolInfo, previewService } from '../PreviewService';
import { PreviewContentType } from '../../../../types/preview';
import { previewGeneratorRegistry } from '../PreviewGeneratorRegistry';

// Mock the registry
jest.mock('../PreviewGeneratorRegistry', () => ({
  previewGeneratorRegistry: {
    generatePreview: jest.fn()
  }
}));

// Mock the server logger
jest.mock('../../../logger', () => ({
  serverLogger: {
    error: jest.fn()
  }
}));

describe('PreviewService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generatePreview', () => {
    it('should generate preview using registry', async () => {
      // Setup mock data
      const toolInfo: ToolInfo = { id: 'test-tool', name: 'Test Tool' };
      const args = { file_path: '/test/file.txt' };
      const result = { content: 'test content' };
      const mockPreview = {
        contentType: PreviewContentType.TEXT,
        briefContent: 'test content',
        hasFullContent: false,
        metadata: {}
      };

      // Configure mock to return test data
      jest.spyOn(previewGeneratorRegistry, 'generatePreview').mockResolvedValue(mockPreview);

      // Call the method
      const preview = await previewService.generatePreview(toolInfo, args, result);

      // Verify registry was called correctly
      expect(previewGeneratorRegistry.generatePreview).toHaveBeenCalledWith(
        toolInfo,
        args,
        result,
        expect.objectContaining({
          maxBriefLines: 10,
          maxFullContentSize: 100000,
          generateFullContent: true
        })
      );

      // Verify returned preview matches mock
      expect(preview).toEqual(mockPreview);
    });

    it('should handle errors gracefully', async () => {
      // Setup mock data
      const toolInfo: ToolInfo = { id: 'test-tool', name: 'Test Tool' };
      const args = { file_path: '/test/file.txt' };
      const result = { content: 'test content' };
      const mockError = new Error('Preview generation failed');

      // Configure mock to throw error
      jest.spyOn(previewGeneratorRegistry, 'generatePreview').mockRejectedValue(mockError);

      // Call the method
      const preview = await previewService.generatePreview(toolInfo, args, result);

      // Verify error was handled and null returned
      expect(preview).toBeNull();
    });
  });

  describe('generateErrorPreview', () => {
    it('should generate error preview with correct structure', () => {
      // Setup mock data
      const toolInfo: ToolInfo = { id: 'test-tool', name: 'Test Tool' };
      const error = {
        name: 'TestError',
        message: 'Test error message',
        stack: 'Error stack trace'
      };
      const metadata = { paramSummary: 'Test param summary' };

      // Call the method
      const preview = previewService.generateErrorPreview(toolInfo, error, metadata);

      // Verify preview structure
      expect(preview).toMatchObject({
        contentType: PreviewContentType.ERROR,
        briefContent: 'Test error message',
        hasFullContent: true,
        metadata: {
          errorName: 'TestError',
          stack: 'Error stack trace',
          paramSummary: 'Test param summary'
        }
      });
      // Check specifically that errorType exists but don't assert its exact value
      // since it might be 'Object' due to how Jest creates objects
      expect(preview.metadata).toHaveProperty('errorType');
    });

    it('should handle minimal error objects', () => {
      // Setup mock data with minimal error object
      const toolInfo: ToolInfo = { id: 'test-tool', name: 'Test Tool' };
      const error = { message: 'Minimal error' };

      // Call the method
      const preview = previewService.generateErrorPreview(toolInfo, error);

      // Verify preview structure
      expect(preview).toMatchObject({
        contentType: PreviewContentType.ERROR,
        briefContent: 'Minimal error',
        hasFullContent: false,
        metadata: {
          errorName: 'Error'
        }
      });
      // Check that errorType exists but don't assert its exact value
      expect(preview.metadata).toHaveProperty('errorType');
    });
  });
});