/**
 * Registry for preview generators
 */

import { Tool } from '../../../types/tool';
import { ToolPreviewData } from '../../../types/preview';
import { PreviewGenerator, PreviewOptions } from './PreviewGenerator';
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
   * Find the appropriate generator for a tool and result
   */
  findGenerator(tool: Tool, result: unknown): PreviewGenerator | null {
    for (const generator of this.generators) {
      if (generator.canHandle(tool, result)) {
        return generator;
      }
    }
    
    serverLogger.debug(`No preview generator found for tool: ${tool.id}`);
    return null;
  }
  
  /**
   * Generate a preview for a tool execution result
   */
  async generatePreview(
    tool: Tool,
    args: Record<string, unknown>,
    result: unknown,
    options?: PreviewOptions
  ): Promise<ToolPreviewData | null> {
    try {
      const generator = this.findGenerator(tool, result);
      if (!generator) return null;
      
      return await generator.generatePreview(tool, args, result, options);
    } catch (error) {
      serverLogger.error(`Error generating preview for tool ${tool.id}:`, error);
      return null;
    }
  }
}

// Create and export singleton instance
export const previewGeneratorRegistry = new PreviewGeneratorRegistry();