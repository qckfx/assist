/**
 * Preview generator for file edit operations
 */

import { ToolInfo } from '../PreviewService';
import { 
  ToolPreviewData, 
  PreviewContentType,
  DiffPreviewData
} from '../../../../types/preview';
import { PreviewGenerator, PreviewOptions } from '../PreviewGenerator';
import { FileEditToolResult } from '../../../../tools/FileEditTool';
import { serverLogger } from '../../../logger';
import path from 'path';

export class FileEditPreviewGenerator extends PreviewGenerator {
  /**
   * Generate preview for file edit results
   */
  async generatePreview(
    tool: ToolInfo,
    args: Record<string, unknown>,
    result: unknown,
    options?: PreviewOptions
  ): Promise<ToolPreviewData | null> {
    const opts = { ...this.defaultOptions, ...options };
    
    try {
      // Handle file edit tool results
      if (!this.isFileEditResult(result)) {
        serverLogger.warn('Invalid file edit result format');
        return null;
      }
      
      const filePath = args.path as string || result.path || '';
      
      // Generate a simple diff representation
      const oldString = args.searchCode as string || args.old_string as string || '';
      const newString = args.replaceCode as string || args.new_string as string || '';
      
      // Count additions and deletions
      const oldLines = oldString.split('\n').length;
      const newLines = newString.split('\n').length;
      const additions = Math.max(0, newLines - oldLines);
      const deletions = Math.max(0, oldLines - newLines);
      
      // Create a unified diff-like format for preview
      const diffLines = this.generateSimpleDiff(oldString, newString);
      const briefDiff = this.truncateToLines(diffLines, opts.maxBriefLines || 5);
      
      const preview: DiffPreviewData = {
        contentType: PreviewContentType.DIFF,
        briefContent: briefDiff,
        hasFullContent: diffLines.length > briefDiff.length,
        changesSummary: {
          additions,
          deletions
        },
        filePath,
        metadata: {
          fileName: path.basename(filePath),
          changes: oldString === '' ? 'File created' : 'File modified'
        }
      };
      
      // Add full content if not too large and if requested
      if (opts.generateFullContent && diffLines.length <= opts.maxFullContentSize!) {
        preview.fullContent = diffLines;
      }
      
      return preview;
    } catch (error) {
      serverLogger.error('Error generating file edit preview:', error);
      return null;
    }
  }
  
  /**
   * Check if this generator can handle the tool and result
   */
  canHandle(tool: ToolInfo, result: unknown): boolean {
    // Check for the exact file edit tool ID
    const isFileEditTool = tool.id === 'file_edit';
    
    // Check result format
    const hasValidResult = this.isFileEditResult(result);
    
    return isFileEditTool && hasValidResult;
  }
  
  /**
   * Check if result matches FileEditToolResult format
   */
  private isFileEditResult(result: unknown): result is FileEditToolResult {
    return (
      result !== null &&
      typeof result === 'object' &&
      (
        'path' in result || 
        'success' in result || 
        'changes' in result
      )
    );
  }
  
  /**
   * Generate a simple diff representation
   */
  private generateSimpleDiff(oldString: string, newString: string): string {
    // Simple diff for preview purposes
    if (oldString === '') {
      // New file
      const lines = newString.split('\n');
      return lines.map(line => `+ ${line}`).join('\n');
    }
    
    if (oldString === newString) {
      // No changes
      return 'No changes';
    }
    
    // Very simple line-based diff (not perfect but good enough for preview)
    const oldLines = oldString.split('\n');
    const newLines = newString.split('\n');
    
    let diffText = '';
    const maxLines = Math.max(oldLines.length, newLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const oldLine = i < oldLines.length ? oldLines[i] : null;
      const newLine = i < newLines.length ? newLines[i] : null;
      
      if (oldLine === null) {
        // Added line
        diffText += `+ ${newLine}\n`;
      } else if (newLine === null) {
        // Removed line
        diffText += `- ${oldLine}\n`;
      } else if (oldLine !== newLine) {
        // Changed line
        diffText += `- ${oldLine}\n`;
        diffText += `+ ${newLine}\n`;
      } else {
        // Unchanged line
        diffText += `  ${oldLine}\n`;
      }
    }
    
    return diffText;
  }
}