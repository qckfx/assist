/**
 * PreviewService - Central service for generating tool previews
 */

import { serverLogger } from '../../logger';
import { ToolPreviewData, PreviewContentType } from '../../../types/preview';
import { previewGeneratorRegistry } from './PreviewGeneratorRegistry';

/**
 * Simple tool information structure needed for preview generation
 */
export interface ToolInfo {
  id: string;
  name: string;
}

/**
 * Options for preview generation
 */
export interface PreviewOptions {
  maxBriefLines?: number;
  maxFullContentSize?: number;
  generateFullContent?: boolean;
}

/**
 * Service to generate previews for tool results
 */
export class PreviewService {
  private static instance: PreviewService;

  /**
   * Get the singleton instance
   */
  public static getInstance(): PreviewService {
    if (!PreviewService.instance) {
      PreviewService.instance = new PreviewService();
    }
    return PreviewService.instance;
  }

  /**
   * Generate preview for tool execution result
   */
  public async generatePreview(
    toolInfo: ToolInfo,
    args: Record<string, unknown>,
    result: unknown,
    options?: PreviewOptions
  ): Promise<ToolPreviewData | null> {
    try {
      // Use the registry to find appropriate generator and generate preview
      return await previewGeneratorRegistry.generatePreview(
        toolInfo,
        args,
        result,
        options || {
          maxBriefLines: 10,
          maxFullContentSize: 100000,
          generateFullContent: true
        }
      );
    } catch (error) {
      serverLogger.error(`Error generating preview for tool ${toolInfo.id}:`, error);
      return null;
    }
  }

  /**
   * Generate error preview for failed tool execution
   */
  public generateErrorPreview(
    toolInfo: ToolInfo,
    error: { message: string; name?: string; stack?: string },
    metadata: Record<string, unknown> = {}
  ): ToolPreviewData {
    return {
      contentType: PreviewContentType.ERROR,
      briefContent: error.message,
      hasFullContent: !!error.stack,
      metadata: {
        errorName: error.name || 'Error',
        errorType: error.constructor?.name || 'Error',
        stack: error.stack,
        ...metadata
      }
    };
  }
}

// Export singleton instance
export const previewService = PreviewService.getInstance();