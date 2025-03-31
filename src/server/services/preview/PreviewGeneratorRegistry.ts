/**
 * Registry for preview generators
 */

import { ToolPreviewData } from '../../../types/preview';
import { PreviewGenerator } from './PreviewGenerator';
import { PreviewOptions, ToolInfo } from './PreviewService';
import { serverLogger } from '../../logger';

export class PreviewGeneratorRegistry {
  private generators: PreviewGenerator[] = [];
  
  /**
   * Register a preview generator
   */
  register(generator: PreviewGenerator): void {
    this.generators.push(generator);
    serverLogger.debug(`Preview generator registered: ${generator.constructor.name}`);
  }
  
  /**
   * Find the appropriate generator for a tool info and result
   */
  findGenerator(toolInfo: ToolInfo, result: unknown): PreviewGenerator | null {
    for (const generator of this.generators) {
      if (generator.canHandle(toolInfo, result)) {
        return generator;
      }
    }
    
    serverLogger.debug(`No preview generator found for tool: ${toolInfo.id}`);
    return null;
  }
  
  /**
   * Generate a preview for a tool execution result
   */
  async generatePreview(
    toolInfo: ToolInfo,
    args: Record<string, unknown>,
    result: unknown,
    options?: PreviewOptions
  ): Promise<ToolPreviewData | null> {
    try {
      const generator = this.findGenerator(toolInfo, result);
      if (!generator) return null;
      
      return await generator.generatePreview(toolInfo, args, result, options);
    } catch (error) {
      serverLogger.error(`Error generating preview for tool ${toolInfo.id}:`, error);
      return null;
    }
  }
}

// Create and export singleton instance
export const previewGeneratorRegistry = new PreviewGeneratorRegistry();