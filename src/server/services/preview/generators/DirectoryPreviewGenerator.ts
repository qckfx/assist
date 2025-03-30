/**
 * Preview generator for directory listing operations
 */

import { Tool } from '../../../../types/tool';
import { 
  ToolPreviewData, 
  PreviewContentType,
  DirectoryPreviewData
} from '../../../../types/preview';
import { PreviewGenerator, PreviewOptions } from '../PreviewGenerator';
import { LSToolResult } from '../../../../tools/LSTool';
import { serverLogger } from '../../../logger';

export class DirectoryPreviewGenerator extends PreviewGenerator {
  /**
   * Generate preview for LS tool results
   */
  async generatePreview(
    tool: Tool,
    args: Record<string, unknown>,
    result: unknown,
    options?: PreviewOptions
  ): Promise<ToolPreviewData | null> {
    const opts = { ...this.defaultOptions, ...options };
    
    try {
      // Handle LS tool results
      if (!this.isLSResult(result)) {
        serverLogger.warn('Invalid LS result format');
        return null;
      }
      
      const resultAsAny = result as Record<string, unknown>;
      const dirPath = args.path as string || '.';
      
      // Get entries from result, handling different formats
      const entries = resultAsAny.entries || resultAsAny.files || [];
      
      // Count directories and files
      const directories = entries.filter((entry: Record<string, unknown>) => entry.isDirectory).length;
      const files = entries.length - directories;
      
      // Format brief content (limited entries)
      const briefEntries = entries.slice(0, opts.maxBriefLines || 10);
      const briefContent = this.formatDirectoryListing(briefEntries, dirPath);
      
      const preview: DirectoryPreviewData = {
        contentType: PreviewContentType.DIRECTORY,
        briefContent,
        hasFullContent: entries.length > briefEntries.length,
        entries: entries.map((entry: Record<string, unknown>) => ({
          name: entry.name,
          isDirectory: entry.isDirectory,
          size: entry.size,
          modified: entry.modified ? entry.modified.toISOString() : entry.mtime
        })),
        path: dirPath,
        totalFiles: files,
        totalDirectories: directories,
        metadata: {
          path: dirPath,
          totalEntries: entries.length,
          totalFiles: files,
          totalDirectories: directories
        }
      };
      
      return preview;
    } catch (error) {
      serverLogger.error('Error generating directory preview:', error);
      return null;
    }
  }
  
  /**
   * Check if this generator can handle the tool and result
   */
  canHandle(tool: Tool, result: unknown): boolean {
    // Check for known LS tool IDs
    const isLSTool = 
      tool.id === 'LSTool' || 
      tool.id === 'LS' || 
      tool.id.includes('ls');
    
    // Check result format
    const hasValidResult = this.isLSResult(result);
    
    return isLSTool && hasValidResult;
  }
  
  /**
   * Check if result matches LSToolResult format
   */
  private isLSResult(result: unknown): result is LSToolResult {
    return (
      result !== null &&
      typeof result === 'object' &&
      (
        // For LSToolSuccessResult format
        ('success' in result && result.success === true && 
          ('entries' in result || 'files' in result || 'count' in result)
        ) ||
        // For other formats
        ('entries' in result || 'files' in result)
      )
    );
  }
  
  /**
   * Format directory listing for brief preview
   */
  private formatDirectoryListing(
    entries: Array<{name: string; isDirectory: boolean; size?: number}>,
    path: string
  ): string {
    let output = `Directory: ${path}\n\n`;
    
    if (entries.length === 0) {
      return output + 'Empty directory';
    }
    
    for (const entry of entries) {
      const type = entry.isDirectory ? 'dir' : 'file';
      const size = entry.size !== undefined ? `${this.formatSize(entry.size)}` : '';
      output += `[${type}] ${entry.name} ${size}\n`;
    }
    
    return output;
  }
  
  /**
   * Format file size to human-readable format
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}