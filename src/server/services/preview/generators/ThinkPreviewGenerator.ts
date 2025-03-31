/**
 * ThinkPreviewGenerator - Generates previews for the Think tool
 */
import { PreviewGenerator, PreviewOptions } from '../PreviewGenerator';
import { ToolInfo } from '../PreviewService';
import { PreviewContentType, ToolPreviewData } from '../../../../types/preview';
import { serverLogger } from '../../../logger';

/**
 * Preview generator for the Think tool
 */
export class ThinkPreviewGenerator extends PreviewGenerator {
  // Default options for the Think tool preview
  protected defaultOptions: PreviewOptions = {
    maxBriefLines: 15,
    maxFullContentSize: 100000, // ~100KB
    generateFullContent: true
  };

  /**
   * Check if this generator can handle the given tool
   */
  canHandle(toolInfo: ToolInfo, _result: unknown): boolean {
    return toolInfo.id === 'think' || toolInfo.name === 'ThinkTool';
  }

  /**
   * Generate preview for Think tool
   */
  async generatePreview(
    toolInfo: ToolInfo,
    args: Record<string, unknown>,
    result: unknown,
    options?: PreviewOptions
  ): Promise<ToolPreviewData | null> {
    try {
      // Merge with default options
      const mergedOptions = { ...this.defaultOptions, ...options };
      
      // Log the inputs for debugging purposes
      serverLogger.debug(`Generating think tool preview`, {
        toolId: toolInfo.id,
        toolName: toolInfo.name,
        args: Object.keys(args),
        hasThought: 'thought' in args && typeof args.thought === 'string',
        resultType: typeof result
      });

      // Extract thought from args or result
      let thought: string;
      
      if ('thought' in args && typeof args.thought === 'string') {
        thought = args.thought;
      } else if (result && typeof result === 'object' && 'thought' in result && typeof (result as any).thought === 'string') {
        thought = (result as any).thought;
      } else {
        serverLogger.warn(`Think tool preview missing thought content`, {
          toolId: toolInfo.id,
          argKeys: Object.keys(args),
          resultKeys: result && typeof result === 'object' ? Object.keys(result as object) : null
        });
        return null;
      }

      // Format the thought content with a title and separators for better visibility
      const formattedThought = `Thinking Process:\n${'='.repeat(20)}\n\n${thought}\n\n${'='.repeat(20)}`;
      
      // Truncate content if needed based on options
      const maxLines = mergedOptions.maxBriefLines || 15;
      const lines = formattedThought.split('\n');
      const truncated = lines.length > maxLines;
      
      // Generate brief content using the helper method
      let briefContent = truncated 
        ? this.truncateToLines(formattedThought, maxLines)
        : formattedThought;

      serverLogger.info(`Generated think tool preview`, {
        contentType: PreviewContentType.TEXT,
        briefContentLength: briefContent.length,
        thoughtLength: thought.length,
        truncated,
        lines: lines.length
      });

      // Create the preview with our helper method
      return this.createBasicPreview(
        PreviewContentType.TEXT,
        briefContent,
        truncated,
        {
          toolName: toolInfo.name,
          toolId: toolInfo.id,
          isThinkTool: true,
          thoughtLength: thought.length,
          lineCount: lines.length,
          truncated,
          fullContent: truncated ? formattedThought : undefined
        }
      );
    } catch (error) {
      serverLogger.error(`Error generating think tool preview:`, error);
      return null;
    }
  }
}