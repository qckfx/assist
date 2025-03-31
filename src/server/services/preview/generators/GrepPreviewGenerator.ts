/**
 * Preview generator for GrepTool executions
 */

import { ToolInfo } from '../PreviewService';
import { 
  ToolPreviewData, 
  PreviewContentType,
  CodePreviewData
} from '../../../../types/preview';
import { PreviewGenerator, PreviewOptions } from '../PreviewGenerator';
import { serverLogger } from '../../../logger';

interface GrepResultEntry {
  file?: string;
  line?: number;
  content?: string;
  raw?: string;
}

interface GrepResult {
  success: boolean;
  pattern: string;
  path: string;
  results: GrepResultEntry[];
  count: number;
  hasMore: boolean;
  truncated: boolean;
  totalMatches: number;
}

export class GrepPreviewGenerator extends PreviewGenerator {
  /**
   * Generate preview for grep tool results
   */
  async generatePreview(
    tool: ToolInfo,
    args: Record<string, unknown>,
    result: unknown,
    options?: PreviewOptions
  ): Promise<ToolPreviewData | null> {
    const opts = { ...this.defaultOptions, ...options };
    
    try {
      // Handle grep tool results
      if (!this.isGrepResult(result)) {
        serverLogger.warn('Invalid grep result format');
        return null;
      }
      
      const pattern = args.pattern as string || result.pattern;
      const searchPath = args.path as string || result.path || '.';
      const grepResults = result.results || [];
      
      // Format the output for display
      let content = '';
      
      // Show pattern and totals info at the top
      content += `Found ${result.totalMatches} matches for pattern: "${pattern}" in ${searchPath}\n`;
      if (result.truncated) {
        content += `(Showing ${grepResults.length} of ${result.totalMatches} matches)\n`;
      }
      content += '---------------------------------------------\n\n';
      
      // Add each match grouped by file
      const fileGroups = new Map<string, GrepResultEntry[]>();
      
      // Group results by file
      for (const entry of grepResults) {
        const file = entry.file || 'unknown';
        if (!fileGroups.has(file)) {
          fileGroups.set(file, []);
        }
        fileGroups.get(file)!.push(entry);
      }
      
      // Format each file group
      for (const [file, entries] of fileGroups.entries()) {
        content += `File: ${file}\n`;
        
        for (const entry of entries) {
          if (entry.line !== undefined && entry.content !== undefined) {
            content += `  ${entry.line}: ${entry.content}\n`;
          } else if (entry.raw) {
            content += `  ${entry.raw}\n`;
          }
        }
        
        content += '\n';
      }
      
      // Add a note if there are more results
      if (result.hasMore || result.truncated) {
        content += '...\n';
        content += '(Use a more specific pattern or path to narrow results)\n';
      }
      
      // Create brief preview (truncated to max lines)
      const briefContent = this.truncateToLines(content, opts.maxBriefLines || 10);
      
      const preview: CodePreviewData = {
        contentType: PreviewContentType.CODE,
        briefContent,
        hasFullContent: content.length > briefContent.length,
        metadata: {
          pattern,
          path: searchPath,
          count: result.count,
          totalMatches: result.totalMatches,
          truncated: result.truncated,
          fileCount: fileGroups.size
        },
        language: 'text',
        lineCount: content.split('\n').length
      };
      
      // Add full content if not too large and if requested
      if (opts.generateFullContent && content.length <= opts.maxFullContentSize!) {
        preview.fullContent = content;
      }
      
      return preview;
    } catch (error) {
      serverLogger.error('Error generating grep preview:', error);
      return null;
    }
  }
  
  /**
   * Check if this generator can handle the tool and result
   */
  canHandle(tool: ToolInfo, result: unknown): boolean {
    // Check for the grep tool ID
    const isGrepTool = tool.id === 'grep' || tool.id.includes('grep') || tool.name.includes('Grep');
    
    // Check result format
    const hasValidResult = this.isGrepResult(result);
    
    return isGrepTool && hasValidResult;
  }
  
  /**
   * Check if result matches grep output format
   */
  private isGrepResult(result: unknown): result is GrepResult {
    return (
      result !== null &&
      typeof result === 'object' &&
      'success' in result &&
      'pattern' in result &&
      'results' in result &&
      'count' in result &&
      Array.isArray((result as GrepResult).results)
    );
  }
}