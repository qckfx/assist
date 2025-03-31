/**
 * Preview generator for bash command executions
 */

import { ToolInfo } from '../PreviewService';
import { 
  ToolPreviewData, 
  PreviewContentType,
  TextPreviewData
} from '../../../../types/preview';
import { PreviewGenerator, PreviewOptions } from '../PreviewGenerator';
import { serverLogger } from '../../../logger';

interface BashResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  success?: boolean;
  error?: string;
  command?: string;
}

export class BashPreviewGenerator extends PreviewGenerator {
  /**
   * Generate preview for bash tool results
   */
  async generatePreview(
    tool: ToolInfo,
    args: Record<string, unknown>,
    result: unknown,
    options?: PreviewOptions
  ): Promise<ToolPreviewData | null> {
    const opts = { ...this.defaultOptions, ...options };
    
    try {
      // Handle bash tool results
      if (!this.isBashResult(result)) {
        serverLogger.warn('Invalid bash result format');
        return null;
      }
      
      const command = args.command as string || result.command || '';
      const stdout = result.stdout || '';
      const stderr = result.stderr || '';
      const exitCode = result.exitCode ?? (result.success === false ? 1 : 0);
      
      // Combine stdout and stderr for preview
      let content = '';
      
      if (stdout) {
        content += stdout;
      }
      
      if (stderr) {
        if (content) content += '\n';
        content += `Error: ${stderr}`;
      }
      
      // Handle error field if present
      if (result.error && !stderr) {
        if (content) content += '\n';
        content += `Error: ${result.error}`;
      }
      
      // Create brief preview (truncated to max lines)
      const briefContent = this.truncateToLines(content, opts.maxBriefLines || 10);
      
      const preview: TextPreviewData = {
        contentType: PreviewContentType.TEXT,
        briefContent,
        hasFullContent: content.length > briefContent.length,
        lineCount: content.split('\n').length,
        isTruncated: content.length > briefContent.length,
        metadata: {
          command,
          exitCode,
          hasStderr: !!stderr,
          contentLength: content.length
        }
      };
      
      // Add full content if not too large and if requested
      if (opts.generateFullContent && content.length <= opts.maxFullContentSize!) {
        preview.fullContent = content;
      }
      
      return preview;
    } catch (error) {
      serverLogger.error('Error generating bash preview:', error);
      return null;
    }
  }
  
  /**
   * Check if this generator can handle the tool and result
   */
  canHandle(tool: ToolInfo, result: unknown): boolean {
    // Check for the exact bash tool ID
    const isBashTool = tool.id === 'bash';
    
    // Check result format
    const hasValidResult = this.isBashResult(result);
    
    return isBashTool && hasValidResult;
  }
  
  /**
   * Check if result matches bash output format
   */
  private isBashResult(result: unknown): result is BashResult {
    return (
      result !== null &&
      typeof result === 'object' &&
      (
        'stdout' in result || 
        'stderr' in result || 
        'exitCode' in result ||
        'success' in result ||
        'error' in result
      )
    );
  }
}