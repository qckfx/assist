/**
 * Preview generator for GlobTool executions
 */

import { ToolInfo } from '../PreviewService';
import { 
  ToolPreviewData, 
  PreviewContentType,
  DirectoryPreviewData
} from '../../../../types/preview';
import { PreviewGenerator, PreviewOptions } from '../PreviewGenerator';
import { serverLogger } from '../../../logger';

interface GlobResult {
  success: boolean;
  pattern: string;
  matches: string[];
  count: number;
  hasMore: boolean;
  truncated: boolean;
  totalMatches: number;
}

export class GlobPreviewGenerator extends PreviewGenerator {
  /**
   * Generate preview for glob tool results
   */
  async generatePreview(
    tool: ToolInfo,
    args: Record<string, unknown>,
    result: unknown,
    options?: PreviewOptions
  ): Promise<ToolPreviewData | null> {
    const opts = { ...this.defaultOptions, ...options };
    
    try {
      // Handle glob tool results
      if (!this.isGlobResult(result)) {
        serverLogger.warn('Invalid glob result format');
        return null;
      }
      
      const pattern = args.pattern as string || result.pattern;
      const matches = result.matches || [];
      const path = args.path as string || '.';
      
      // Format the output for display
      let content = '';
      
      // Show pattern and totals info at the top
      content += `Found ${result.totalMatches} files matching pattern: ${pattern}\n`;
      if (result.truncated) {
        content += `(Showing ${matches.length} of ${result.totalMatches} matches)\n`;
      }
      content += '---------------------------------------------\n';
      
      // Add each match
      for (const match of matches) {
        content += `${match}\n`;
      }
      
      // Add a note if there are more results
      if (result.hasMore) {
        content += '...\n';
        content += '(Use a more specific pattern to narrow results)\n';
      }
      
      // Create brief preview (truncated to max lines)
      const briefContent = this.truncateToLines(content, opts.maxBriefLines || 10);
      
      const preview: DirectoryPreviewData = {
        contentType: PreviewContentType.DIRECTORY,
        briefContent,
        hasFullContent: content.length > briefContent.length,
        metadata: {
          pattern,
          path,
          count: result.count,
          totalMatches: result.totalMatches,
          truncated: result.truncated
        },
        entries: matches.map(path => ({
          name: path,
          isDirectory: path.endsWith('/'),
        })),
        path: path as string,
        totalFiles: result.totalMatches
      };
      
      // Add full content if not too large and if requested
      if (opts.generateFullContent && content.length <= opts.maxFullContentSize!) {
        preview.fullContent = content;
      }
      
      return preview;
    } catch (error) {
      serverLogger.error('Error generating glob preview:', error);
      return null;
    }
  }
  
  /**
   * Check if this generator can handle the tool and result
   */
  canHandle(tool: ToolInfo, result: unknown): boolean {
    // Check for the glob tool ID
    const isGlobTool = tool.id === 'glob' || tool.id.includes('glob') || tool.name.includes('Glob');
    
    // Check result format
    const hasValidResult = this.isGlobResult(result);
    
    return isGlobTool && hasValidResult;
  }
  
  /**
   * Check if result matches glob output format
   */
  private isGlobResult(result: unknown): result is GlobResult {
    return (
      result !== null &&
      typeof result === 'object' &&
      'success' in result &&
      'pattern' in result &&
      'matches' in result &&
      'count' in result &&
      Array.isArray((result as GlobResult).matches)
    );
  }
}