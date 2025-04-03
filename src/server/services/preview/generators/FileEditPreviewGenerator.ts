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
import * as diffLib from 'diff';

export class FileEditPreviewGenerator extends PreviewGenerator {
  /**
   * Check if new string is an insertion of content into the old string
   * rather than a complete replacement or complex edit
   */
  private isStringInsertion(oldString: string, newString: string): boolean {
    // If old string is empty, it's a creation, not an insertion
    if (oldString === '') {
      return false;
    }
    
    // Check if the old string is fully contained in the new string
    return newString.includes(oldString);
  }
  
  /**
   * Generate a better diff representation for insertions
   * This creates a more intuitive diff that shows only the inserted content
   */
  private generateInsertionDiff(oldString: string, newString: string, fileName: string): string | null {
    try {
      // Find where in the new string the old string appears
      const insertionIndex = newString.indexOf(oldString);
      
      if (insertionIndex === 0) {
        // Content was appended at the end
        // Calculate the appended content (uncomment if needed)
        // const appendedContent = newString.substring(oldString.length);
        return diffLib.createPatch(
          fileName,
          oldString,
          newString,
          'before append',
          'after append',
          { context: 3 }
        );
      } else if (insertionIndex > 0) {
        // Content was prepended at the beginning or inserted in the middle
        // Calculate the prepended content (uncomment if needed)
        // const prependedContent = newString.substring(0, insertionIndex);
        return diffLib.createPatch(
          fileName,
          oldString,
          newString,
          'before insert',
          'after insert',
          { context: 3 }
        );
      }
      
      // Not a simple insertion
      return null;
    } catch (error) {
      serverLogger.error('Error generating insertion diff:', error);
      return null;
    }
  }
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
      const diffLines = this.generateSimpleDiff(oldString, newString, filePath);
      const briefDiff = this.truncateToLines(diffLines, opts.maxBriefLines || 5);
      
      // For empty file creation, create a more user-friendly message
      let briefContent = briefDiff;
      if (oldString === '' && newString === '') {
        briefContent = `Creating empty file: ${filePath}`;
      }
      
      const preview: DiffPreviewData = {
        contentType: PreviewContentType.DIFF,
        briefContent: briefContent,
        hasFullContent: diffLines.length > briefDiff.length,
        changesSummary: {
          additions,
          deletions
        },
        filePath,
        metadata: {
          fileName: path.basename(filePath),
          changes: oldString === '' ? 'File created' : 'File modified',
          isEmptyFile: oldString === '' && newString === ''
        }
      };
      
      // Add full content if not too large and if requested
      if (opts.generateFullContent && diffLines.length <= opts.maxFullContentSize!) {
        preview.fullContent = diffLines;
        
        // Add debug log for full content
        serverLogger.debug(`Generated file edit preview with full content`, {
          briefContentLength: briefContent.length,
          fullContentLength: diffLines.length,
          isSameContent: briefContent === diffLines,
          truncated: briefDiff.length < diffLines.length
        });
      } else {
        serverLogger.warn(`Not generating full content for file edit preview`, {
          reason: !opts.generateFullContent ? 'generateFullContent is false' : 'content too large',
          contentLength: diffLines.length,
          maxSize: opts.maxFullContentSize
        });
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
   * Generate a proper unified diff representation with smarter change detection
   */
  private generateSimpleDiff(oldString: string, newString: string, filePath: string = 'file'): string {
    // Special cases handling
    if (oldString === '' && newString === '') {
      return '+ [Creating empty file]\n';
    }
    
    if (oldString === newString) {
      // No changes
      return '  [No changes]\n';
    }
    
    // Use the diff library to generate a proper unified diff format
    try {
      const fileName = path.basename(filePath);
      
      // Special case for new files
      if (oldString === '') {
        // Use the diff library's createPatch function for a proper unified diff
        return diffLib.createPatch(
          fileName,        // file name
          '',              // old string (empty for new files)
          newString,       // new string
          '/dev/null',     // old header (standard for non-existent files)
          'new file',      // new header
          { context: 3 }   // standard context lines
        );
      }
      
      // Special case for deleted files/content
      if (newString === '') {
        return diffLib.createPatch(
          fileName,        // file name
          oldString,       // old string
          '',              // new string (empty for deleted content)
          'old file',      // old header
          '/dev/null',     // new header (standard for non-existent files)
          { context: 3 }   // standard context lines
        );
      }
      
      // Improve diff generation for cases where content is added at the beginning/middle of file
      // Analyze the edit operation to determine if it's an insertion or a true modification
      if (this.isStringInsertion(oldString, newString)) {
        // Find the exact insertion point
        const insertionDiff = this.generateInsertionDiff(oldString, newString, fileName);
        if (insertionDiff) {
          return insertionDiff;
        }
      }
      
      // Standard case: modified content
      return diffLib.createPatch(
        fileName,        // file name
        oldString,       // old string
        newString,       // new string
        'old',           // old header
        'new',           // new header
        { context: 3 }   // standard context lines
      );
    } catch (error) {
      serverLogger.error('Error generating diff:', error);
      
      // Fallback to a simpler diff if the library fails
      let diffText = '';
      const oldLines = oldString.split('\n');
      const newLines = newString.split('\n');
      
      // Use a simple line-by-line comparison as fallback
      if (oldString === '') {
        return newLines.map(line => `+ ${line}`).join('\n');
      } else if (newString === '') {
        return oldLines.map(line => `- ${line}`).join('\n');
      }
      
      const maxLines = Math.max(oldLines.length, newLines.length);
      
      for (let i = 0; i < maxLines; i++) {
        const oldLine = i < oldLines.length ? oldLines[i] : null;
        const newLine = i < newLines.length ? newLines[i] : null;
        
        if (oldLine === null) {
          diffText += `+ ${newLine}\n`;
        } else if (newLine === null) {
          diffText += `- ${oldLine}\n`;
        } else if (oldLine !== newLine) {
          diffText += `- ${oldLine}\n`;
          diffText += `+ ${newLine}\n`;
        } else {
          diffText += `  ${oldLine}\n`;
        }
      }
      
      return diffText;
    }
  }
}