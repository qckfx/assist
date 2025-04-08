/**
 * BatchPreviewGenerator - Generates previews for the BatchTool
 */

import { ToolInfo } from '../PreviewService';
import { 
  ToolPreviewData, 
  PreviewContentType,
  TextPreviewData
} from '../../../../types/preview';
import { PreviewGenerator, PreviewOptions } from '../PreviewGenerator';
import { serverLogger } from '../../../logger';

interface BatchToolResultData {
  success: boolean;
  error?: string;
  description: string;
  results: Array<{
    tool_name: string;
    success: boolean;
    result?: unknown;
    error?: string;
    execution_time_ms?: number;
  }>;
}

export class BatchPreviewGenerator extends PreviewGenerator {
  /**
   * Generate preview for batch tool results
   */
  async generatePreview(
    tool: ToolInfo,
    args: Record<string, unknown>,
    result: unknown,
    options?: PreviewOptions
  ): Promise<ToolPreviewData | null> {
    const opts = { ...this.defaultOptions, ...options };
    
    try {
      if (!this.isBatchResult(result)) {
        serverLogger.warn('Invalid batch result format');
        return null;
      }
      
      const batchResult = result as BatchToolResultData;
      const description = args.description as string || batchResult.description || 'Batch operation';
      
      // Get stats about the batch execution
      const totalOps = batchResult.results.length;
      const successful = batchResult.results.filter(r => r.success).length;
      const failed = totalOps - successful;
      
      // Build the summary
      let content = `Batch: ${description} (${successful}/${totalOps} successful)\n`;
      
      if (!batchResult.success && batchResult.error) {
        content += `Error: ${batchResult.error}\n`;
      }
      
      // Add summary for each tool execution
      batchResult.results.forEach((opResult, index) => {
        const executionTime = opResult.execution_time_ms ? `(${opResult.execution_time_ms}ms)` : '';
        const status = opResult.success ? '✓' : '✗';
        const statusDetail = opResult.success ? '' : `: ${opResult.error || 'Unknown error'}`;
        
        content += `${index + 1}. ${status} ${opResult.tool_name} ${executionTime}${statusDetail}\n`;
      });
      
      // Create brief preview (truncated to max lines)
      const briefContent = this.truncateToLines(content, opts.maxBriefLines || 10);
      
      const preview: TextPreviewData = {
        contentType: PreviewContentType.TEXT,
        briefContent,
        hasFullContent: content.length > briefContent.length,
        lineCount: content.split('\n').length,
        isTruncated: content.length > briefContent.length,
        metadata: {
          description,
          totalOperations: totalOps,
          successfulOperations: successful,
          failedOperations: failed
        }
      };
      
      // Add full content if not too large and if requested
      if (opts.generateFullContent && content.length <= opts.maxFullContentSize!) {
        preview.fullContent = content;
      }
      
      return preview;
    } catch (error) {
      serverLogger.error('Error generating batch preview:', error);
      return null;
    }
  }
  
  /**
   * Check if this generator can handle the tool and result
   */
  canHandle(tool: ToolInfo, result: unknown): boolean {
    // Check for the batch tool ID
    const isBatchTool = tool.id === 'batch';
    
    // Check result format
    const hasValidResult = this.isBatchResult(result);
    
    return isBatchTool && hasValidResult;
  }
  
  /**
   * Check if result matches batch output format
   */
  private isBatchResult(result: unknown): result is BatchToolResultData {
    return (
      result !== null &&
      typeof result === 'object' &&
      'success' in result &&
      'results' in result &&
      Array.isArray((result as BatchToolResultData).results)
    );
  }
}