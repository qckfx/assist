/**
 * Base class for tool output preview generators
 */

import { Tool } from '../../../types/tool';
import { ToolPreviewData, PreviewContentType } from '../../../types/preview';

export interface PreviewOptions {
  maxBriefLines?: number;
  maxFullContentSize?: number;
  generateFullContent?: boolean;
}

/**
 * Base class for preview generators
 */
export abstract class PreviewGenerator {
  // Default options that can be overridden by implementations
  protected defaultOptions: PreviewOptions = {
    maxBriefLines: 10,
    maxFullContentSize: 100000, // ~100KB
    generateFullContent: true
  };
  
  /**
   * Generate a preview for a tool execution result
   */
  abstract generatePreview(
    tool: Tool,
    args: Record<string, unknown>,
    result: unknown,
    options?: PreviewOptions
  ): Promise<ToolPreviewData | null>;
  
  /**
   * Check if this generator can handle the given tool and result
   */
  abstract canHandle(tool: Tool, result: unknown): boolean;
  
  /**
   * Helper to create a basic preview object
   */
  protected createBasicPreview(
    contentType: PreviewContentType,
    briefContent: string, 
    hasFullContent: boolean,
    metadata: Record<string, unknown> = {}
  ): ToolPreviewData {
    return {
      contentType,
      briefContent,
      hasFullContent,
      metadata
    };
  }
  
  /**
   * Helper to truncate text to a specific number of lines
   */
  protected truncateToLines(text: string, maxLines: number): string {
    if (!text) return '';
    
    const lines = text.split('\n');
    if (lines.length <= maxLines) return text;
    
    return lines.slice(0, maxLines).join('\n') + '\n...';
  }
}