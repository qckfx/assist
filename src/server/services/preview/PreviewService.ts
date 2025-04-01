/**
 * PreviewService - Central service for generating tool previews
 */

import { serverLogger } from '../../logger';
import { ToolPreviewData, PreviewContentType } from '../../../types/preview';
import { previewGeneratorRegistry } from './PreviewGeneratorRegistry';
import path from 'path';

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
   * Helper method to truncate text to a specified number of lines
   */
  public truncateToLines(text: string, maxLines: number): string {
    if (!text) return '';
    
    const lines = text.split('\n');
    if (lines.length <= maxLines) return text;
    
    return lines.slice(0, maxLines).join('\n') + '\n[...]';
  }

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
   * Generate preview for permission request
   */
  public generatePermissionPreview(
    toolInfo: ToolInfo,
    args: Record<string, unknown>
  ): ToolPreviewData {
    try {
      // Process file paths to be more readable
      const processedArgs = this.processPathsInArgs(args);
      
      // Create custom previews for specific tool types
      // File edit operations - using the exact tool ID and parameters
      if (toolInfo.id === 'file_edit') {
        // Log the incoming args to help debug
        serverLogger.debug(`FileEditTool preview args:`, {
          argKeys: Object.keys(args),
          toolId: toolInfo.id,
          toolName: toolInfo.name,
          args: JSON.stringify(args).substring(0, 100) + "..."
        });
        
        // Check if we have the path parameter (used by FileEditTool)
        if ('path' in args) {
          const filePath = processedArgs.path as string;
          
          // Use the exact parameter names from FileEditTool
          const searchCode = args.searchCode as string || '';
          const replaceCode = args.replaceCode as string || '';
          
          // Log detailed debug info
          serverLogger.debug(`Generating file edit preview`, {
            toolId: toolInfo.id,
            toolName: toolInfo.name,
            hasSearchCode: !!searchCode,
            hasReplaceCode: !!replaceCode,
            searchCodeLength: searchCode?.length,
            replaceCodeLength: replaceCode?.length,
            filePath
          });
          
          // Log the exact values to debug the issue
          serverLogger.debug('FileEditTool preview detailed args:', {
            searchCode,
            replaceCode,
            searchCodeType: typeof searchCode,
            replaceCodeType: typeof replaceCode,
            searchCodeEmpty: searchCode === '',
            replaceCodeEmpty: replaceCode === '',
            searchCodeUndefined: searchCode === undefined,
            replaceCodeUndefined: replaceCode === undefined
          });
          
          // FileEditTool requires both searchCode and replaceCode to be valid
          // Sometimes when the args are serialized during permission requests,
          // the values might be empty strings or undefined
          if (!searchCode || !replaceCode || searchCode === '' || replaceCode === '') {
            serverLogger.warn(`FileEditTool preview received invalid search or replace code for ${filePath}`, {
              hasSearchCode: !!searchCode,
              hasReplaceCode: !!replaceCode,
              searchCodeEmpty: searchCode === '',
              replaceCodeEmpty: replaceCode === ''
            });
            
            // Create a more appropriate placeholder preview for file edits
            return {
              contentType: PreviewContentType.DIFF,
              briefContent: `File: ${filePath}\n\n[Editing existing file]`,
              hasFullContent: false,
              metadata: {
                toolName: toolInfo.name,
                toolId: toolInfo.id,
                filePath,
                isPermissionPreview: true,
                isPlaceholder: true,
                isFileEdit: true, // Mark as file edit operation
                changesSummary: {
                  additions: 1,
                  deletions: 1
                }
              }
            };
          }
          
          if ((searchCode !== undefined || searchCode === '') && (replaceCode !== undefined || replaceCode === '')) {
            // Generate a unified diff format with context
            const oldLines = searchCode.split('\n');
            const newLines = replaceCode.split('\n');
            
            // Create a unified diff format
            let formattedDiff = `File: ${filePath}\n\n`;
            
            // Add diff headers
            formattedDiff += `--- a/${filePath}\n`;
            formattedDiff += `+++ b/${filePath}\n`;
            formattedDiff += `@@ -1,${oldLines.length} +1,${newLines.length} @@\n`;
            
            // Create a unified diff using a simple diff algorithm
            // We'll create a line-by-line diff that shows context along with changes
            const maxLines = Math.max(oldLines.length, newLines.length);
            
            // This is a simple unified diff implementation - for more complex files,
            // a full diff algorithm library would be better
            for (let i = 0; i < maxLines; i++) {
              const oldLine = i < oldLines.length ? oldLines[i] : null;
              const newLine = i < newLines.length ? newLines[i] : null;
              
              if (oldLine === null) {
                // Line only exists in the new version (added)
                formattedDiff += `+ ${newLine === '' ? '[empty line]' : newLine}\n`;
              } else if (newLine === null) {
                // Line only exists in the old version (removed)
                formattedDiff += `- ${oldLine === '' ? '[empty line]' : oldLine}\n`;
              } else if (oldLine !== newLine) {
                // Line changed between versions
                formattedDiff += `- ${oldLine === '' ? '[empty line]' : oldLine}\n`;
                formattedDiff += `+ ${newLine === '' ? '[empty line]' : newLine}\n`;
              } else {
                // Line is the same in both versions (context)
                formattedDiff += `  ${oldLine === '' ? '[empty line]' : oldLine}\n`;
              }
            }
            
            // Log detailed preview for debugging
            serverLogger.debug(`Generated enhanced diff preview for ${filePath}`, {
              contentType: PreviewContentType.DIFF,
              briefContentLength: formattedDiff.length,
              hasFullContent: true
            });
            
            return {
              contentType: PreviewContentType.DIFF,
              briefContent: formattedDiff,
              hasFullContent: true,
              metadata: {
                toolName: toolInfo.name,
                toolId: toolInfo.id,
                filePath,
                isPermissionPreview: true,
                changesSummary: {
                  additions: newLines.length,
                  deletions: oldLines.length
                },
                oldLines: oldLines,
                newLines: newLines
              }
            };
          }
        }
      }
      
      // 2. File write operations - using exact tool ID and parameters
      if (toolInfo.id === 'file_write') {
        // Log the incoming args to help debug
        serverLogger.debug(`FileWriteTool preview args:`, {
          argKeys: Object.keys(args),
          toolId: toolInfo.id,
          toolName: toolInfo.name,
          args: JSON.stringify(args).substring(0, 100) + "..."
        });
        
        // Check if we have the path parameter (used by FileWriteTool)
        if ('path' in args) {
          const filePath = processedArgs.path as string;
          
          // Use the exact parameter name from FileWriteTool
          const content = args.content as string || '';
          
          // Log detailed debug info
          serverLogger.debug(`Generating file write preview`, {
            toolId: toolInfo.id,
            toolName: toolInfo.name,
            hasContent: !!content,
            contentLength: content?.length,
            filePath
          });
          
          // Always show a preview, even for empty content
          // Count the number of lines
          const contentLines = content ? content.split('\n') : [''];
          const lineCount = contentLines.length;
          
          let numberedContent = '';
          
          // Check if the file is empty or has empty content
          if (!content || content === '') {
            numberedContent = '[Creating empty file]\n';
          } else {
            // Format the content with line numbers for better readability
            for (let i = 0; i < Math.min(15, contentLines.length); i++) {
              numberedContent += `${String(i+1).padStart(3)}: ${contentLines[i] || '[empty line]'}\n`;
            }
          }
          
          // Format to show the target file and content preview
          const previewContent = `File: ${filePath}\n\n` + 
                               `Content Preview (${lineCount} lines total):\n${numberedContent}` +
                               (contentLines.length > 15 ? `\n[...${contentLines.length - 15} more lines...]` : '');
          
          // Log detailed preview for debugging
          serverLogger.debug(`Generated file write preview for ${filePath}`, {
            contentType: PreviewContentType.CODE,
            briefContentLength: previewContent.length,
            contentLength: content.length,
            hasFullContent: true,
            lineCount
          });
          
          return {
            contentType: PreviewContentType.CODE,
            briefContent: previewContent,
            hasFullContent: true,
            metadata: {
              toolName: toolInfo.name,
              toolId: toolInfo.id,
              filePath,
              isPermissionPreview: true,
              lineCount,
              contentLines: contentLines.slice(0, 15), // Include first 15 lines in metadata
              isTruncated: contentLines.length > 15
            }
          };
        }
      }
      
      // 3. Think Tool - special handling for thought content
      if (toolInfo.id === 'think' || toolInfo.name === 'ThinkTool') {
        // Log full arguments to help debug think tool
        serverLogger.info(`ThinkTool preview request:`, {
          toolId: toolInfo.id,
          toolName: toolInfo.name,
          args: JSON.stringify(args, null, 2)
        });
        
        if ('thought' in args && typeof args.thought === 'string') {
          const thought = args.thought as string;
          
          // Format the thought content with a title and separators
          const formattedThought = `Thinking Process:\n${'='.repeat(20)}\n\n${thought}\n\n${'='.repeat(20)}`;
          
          // Log detailed preview for debugging
          serverLogger.info(`Generated think tool preview`, {
            contentType: PreviewContentType.TEXT,
            briefContentLength: formattedThought.length,
            thoughtLength: thought.length,
            previewStart: formattedThought.substring(0, 100) + '...'
          });
          
          return {
            contentType: PreviewContentType.TEXT,
            briefContent: formattedThought,
            hasFullContent: true,
            metadata: {
              toolName: toolInfo.name,
              toolId: toolInfo.id,
              isThinkTool: true,
              isPermissionPreview: true,
              thoughtLength: thought.length
            }
          };
        }
      }
      
      // Default handling for other tools
      const content = JSON.stringify(processedArgs, null, 2);
      
      // Determine content type based on the tool
      let contentType = PreviewContentType.TEXT;
      
      // File operations typically have file paths
      if ('file_path' in args || 'filepath' in args || 'path' in args) {
        contentType = PreviewContentType.CODE;
      }
      
      return {
        contentType,
        briefContent: content,
        hasFullContent: true,
        metadata: {
          toolName: toolInfo.name,
          toolId: toolInfo.id,
          isPermissionPreview: true
        }
      };
    } catch (error) {
      serverLogger.error(`Error generating permission preview for tool ${toolInfo.id}:`, error);
      return {
        contentType: PreviewContentType.TEXT,
        briefContent: `Preview unavailable: ${(error as Error).message}`,
        hasFullContent: false,
        metadata: {
          error: true,
          errorMessage: (error as Error).message
        }
      };
    }
  }

  /**
   * Process file paths in arguments to make them more readable
   */
  private processPathsInArgs(args: Record<string, unknown>): Record<string, unknown> {
    const processed = { ...args };
    
    // Process common path-related arguments
    const pathKeys = ['file_path', 'filepath', 'path', 'directory'];
    
    for (const key of pathKeys) {
      if (key in processed && typeof processed[key] === 'string') {
        try {
          // Get the home directory from environment or use a default
          const homeDir = process.env.HOME || '/Users/user';
          const pathValue = processed[key] as string;
          
          // Convert absolute path to a relative one
          if (pathValue.startsWith(homeDir)) {
            processed[key] = path.join('~', pathValue.substring(homeDir.length));
          } else if (pathValue.startsWith('/')) {
            // Keep absolute paths that aren't in home directory, but we might
            // want to shorten them based on common prefixes in the future
            processed[key] = pathValue;
          }
        } catch (e) {
          // If path processing fails, keep the original
          serverLogger.warn(`Error processing path in args: ${e}`);
        }
      }
    }
    
    return processed;
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