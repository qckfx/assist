/**
 * ScratchpadTool - Provides a text workspace for drafting and manipulating content
 */

import { createTool } from './createTool';
import { ToolContext, ValidationResult } from '../types/tool';

// Define types for the scratchpad tool
interface ScratchpadArgs {
  action: string;
  name?: string;
  content?: string;
  offset?: number;
  limit?: number;
  search?: string;
  replacement?: string;
}

interface ScratchpadReadResult {
  success: boolean;
  action: string;
  name: string;
  content: string;
  lines?: {
    total: number;
    from: number;
    to: number;
    count: number;
  };
  lineCount?: number;
  error?: string;
}

interface ScratchpadListResult {
  success: boolean;
  action: string;
  pads: Array<{
    name: string;
    lineCount: number;
    charCount: number;
  }>;
}

interface ScratchpadActionResult {
  success: boolean;
  action: string;
  name?: string;
  message?: string;
  error?: string;
}

interface ScratchpadSearchResult {
  success: boolean;
  action: string;
  name: string;
  matches: number;
  matchingLines: Array<{
    line: string;
    lineNumber: number;
  }>;
  error?: string;
}

type ScratchpadResult = 
  | ScratchpadReadResult 
  | ScratchpadListResult 
  | ScratchpadActionResult 
  | ScratchpadSearchResult;

/**
 * Creates a scratchpad tool that allows the agent to draft and manipulate text
 * @returns The scratchpad tool interface
 */
export const createScratchpadTool = () => {
  // In-memory storage that persists between calls
  // This will be unique per agent instance
  const scratchpads = new Map<string, string>();
  
  return createTool({
    id: 'scratchpad',
    name: 'ScratchpadTool',
    description: 'Provides a text workspace for drafting and manipulating content. Use this for drafting responses, storing code snippets, or working on complex text transformations.',
    requiresPermission: false, // Core capability
    
    // Add schema information
    parameters: {
      action: {
        type: "string",
        description: "The action to perform (create, write, append, read, list, delete, clear, replace, search)"
      },
      name: {
        type: "string",
        description: "The name of the scratchpad (required for all actions except 'list')"
      },
      content: {
        type: "string",
        description: "The content to write, append, or use as initial content"
      },
      offset: {
        type: "integer",
        description: "Line number to start reading from (0-based, for 'read' action)"
      },
      limit: {
        type: "integer",
        description: "Maximum number of lines to read (for 'read' action)"
      },
      search: {
        type: "string",
        description: "Text to search for (for 'search' or 'replace' actions)"
      },
      replacement: {
        type: "string",
        description: "Text to replace the search term with (for 'replace' action)"
      }
    },
    requiredParameters: ["action"],
    
    validateArgs: (args: Record<string, unknown>): ValidationResult => {
      // Check if args has the required 'action' property before type assertion
      if (typeof args.action !== 'string') {
        return {
          valid: false,
          reason: "The 'action' parameter is required and must be a string"
        };
      }
      
      const typedArgs = args as unknown as ScratchpadArgs;
      const validActions = ['create', 'write', 'append', 'read', 'list', 'delete', 'clear', 'replace', 'search'];
      
      if (!validActions.includes(typedArgs.action)) {
        return {
          valid: false,
          reason: `Invalid action '${typedArgs.action}'. Must be one of: ${validActions.join(', ')}`
        };
      }
      
      // Check for required parameters based on action
      if (typedArgs.action !== 'list' && !typedArgs.name) {
        return {
          valid: false,
          reason: `The 'name' parameter is required for '${typedArgs.action}' action`
        };
      }
      
      // Check for required content parameter for specific actions
      if (['create', 'write', 'append'].includes(typedArgs.action) && 
          typedArgs.content === undefined) {
        return {
          valid: false,
          reason: `The 'content' parameter is required for '${typedArgs.action}' action`
        };
      }
      
      // Check for required search parameter
      if (['search', 'replace'].includes(typedArgs.action) && !typedArgs.search) {
        return {
          valid: false,
          reason: `The 'search' parameter is required for '${typedArgs.action}' action`
        };
      }
      
      // Check for required replacement parameter
      if (typedArgs.action === 'replace' && typedArgs.replacement === undefined) {
        return {
          valid: false,
          reason: `The 'replacement' parameter is required for 'replace' action`
        };
      }
      
      return { valid: true };
    },
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    execute: async (args: Record<string, unknown>, _context: ToolContext): Promise<ScratchpadResult> => {
      // Check if args has the required 'action' property before type assertion
      if (typeof args.action !== 'string') {
        return {
          success: false,
          action: 'unknown',
          error: "The 'action' parameter is required and must be a string"
        };
      }
      
      const typedArgs = args as unknown as ScratchpadArgs;
      const { action, name, content, offset, limit, search, replacement } = typedArgs;
      
      switch (action) {
        case 'create': {
          // If a pad with this name already exists, return an error
          if (name && scratchpads.has(name)) {
            return {
              success: false,
              action: 'create',
              error: `Scratchpad '${name}' already exists`
            };
          }
          
          // Create a new pad with the specified content
          if (name) {
            scratchpads.set(name, content || '');
            
            return {
              success: true,
              action: 'create',
              name,
              message: `Created scratchpad '${name}'`
            };
          }
          
          // This should never happen due to validation
          return {
            success: false,
            action: 'create',
            error: 'Name is required for create action'
          };
        }
          
        case 'write': {
          // Replace the contents of an existing pad or create a new one
          if (name && content !== undefined) {
            scratchpads.set(name, content);
            
            return {
              success: true,
              action: 'write',
              name,
              message: `Updated scratchpad '${name}'`
            };
          }
          
          // This should never happen due to validation
          return {
            success: false,
            action: 'write',
            error: 'Name and content are required for write action'
          };
        }
          
        case 'append': {
          if (name && content !== undefined) {
            // Get the existing pad or create a new one
            const existingContent = scratchpads.has(name) ? scratchpads.get(name) : '';
            
            // Append the new content
            scratchpads.set(name, (existingContent || '') + content);
            
            return {
              success: true,
              action: 'append',
              name,
              message: `Appended to scratchpad '${name}'`
            };
          }
          
          // This should never happen due to validation
          return {
            success: false,
            action: 'append',
            error: 'Name and content are required for append action'
          };
        }
          
        case 'read': {
          if (name) {
            // Check if the pad exists
            if (!scratchpads.has(name)) {
              return {
                success: false,
                action: 'read',
                name,
                content: '',
                error: `Scratchpad '${name}' not found`
              };
            }
            
            const padContent = scratchpads.get(name) || '';
            
            // If offset and limit are provided, return only the specified lines
            if (offset !== undefined || limit !== undefined) {
              const lines = padContent.split('\n');
              const startIndex = offset || 0;
              const endIndex = limit ? startIndex + limit : lines.length;
              const selectedLines = lines.slice(startIndex, endIndex);
              
              return {
                success: true,
                action: 'read',
                name,
                content: selectedLines.join('\n'),
                lines: {
                  total: lines.length,
                  from: startIndex,
                  to: Math.min(endIndex, lines.length) - 1,
                  count: selectedLines.length
                }
              };
            }
            
            // Otherwise return the full content
            return {
              success: true,
              action: 'read',
              name,
              content: padContent,
              lineCount: padContent.split('\n').length
            };
          }
          
          // This should never happen due to validation
          return {
            success: false,
            action: 'read',
            name: '',
            content: '',
            error: 'Name is required for read action'
          };
        }
          
        case 'list': {
          // Get all pad names and their line counts
          const pads = Array.from(scratchpads.entries()).map(([padName, content]) => ({
            name: padName,
            lineCount: content.split('\n').length,
            charCount: content.length
          }));
          
          return {
            success: true,
            action: 'list',
            pads
          };
        }
          
        case 'delete': {
          if (name) {
            // Check if the pad exists
            if (!scratchpads.has(name)) {
              return {
                success: false,
                action: 'delete',
                error: `Scratchpad '${name}' not found`
              };
            }
            
            // Delete the pad
            scratchpads.delete(name);
            
            return {
              success: true,
              action: 'delete',
              name,
              message: `Deleted scratchpad '${name}'`
            };
          }
          
          // This should never happen due to validation
          return {
            success: false,
            action: 'delete',
            error: 'Name is required for delete action'
          };
        }
          
        case 'clear': {
          if (name) {
            // Check if the pad exists
            if (!scratchpads.has(name)) {
              return {
                success: false,
                action: 'clear',
                error: `Scratchpad '${name}' not found`
              };
            }
            
            // Clear the pad (set to empty string)
            scratchpads.set(name, '');
            
            return {
              success: true,
              action: 'clear',
              name,
              message: `Cleared scratchpad '${name}'`
            };
          }
          
          // This should never happen due to validation
          return {
            success: false,
            action: 'clear',
            error: 'Name is required for clear action'
          };
        }
          
        case 'replace': {
          if (name && search && replacement !== undefined) {
            // Check if the pad exists
            if (!scratchpads.has(name)) {
              return {
                success: false,
                action: 'replace',
                error: `Scratchpad '${name}' not found`
              };
            }
            
            const padContent = scratchpads.get(name) || '';
            
            // Count occurrences of the search term
            const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            const matches = padContent.match(regex);
            const occurrences = matches ? matches.length : 0;
            
            if (occurrences === 0) {
              return {
                success: false,
                action: 'replace',
                error: `Search term '${search}' not found in scratchpad '${name}'`
              };
            }
            
            if (occurrences > 1) {
              return {
                success: false,
                action: 'replace',
                error: `Search term '${search}' found ${occurrences} times in scratchpad '${name}'. Must match exactly once for replace operation.`
              };
            }
            
            // Replace the single occurrence
            const updatedContent = padContent.replace(search, replacement);
            scratchpads.set(name, updatedContent);
            
            return {
              success: true,
              action: 'replace',
              name,
              message: `Replaced '${search}' with '${replacement}' in scratchpad '${name}'`
            };
          }
          
          // This should never happen due to validation
          return {
            success: false,
            action: 'replace',
            error: 'Name, search, and replacement are required for replace action'
          };
        }
          
        case 'search': {
          if (name && search) {
            // Check if the pad exists
            if (!scratchpads.has(name)) {
              return {
                success: false,
                action: 'search',
                name,
                matches: 0,
                matchingLines: [],
                error: `Scratchpad '${name}' not found`
              };
            }
            
            const padContent = scratchpads.get(name) || '';
            const lines = padContent.split('\n');
            
            // Find lines containing the search term
            const matchingLines = lines
              .map((line, index) => ({ line, lineNumber: index }))
              .filter(({ line }) => line.includes(search));
            
            return {
              success: true,
              action: 'search',
              name,
              matches: matchingLines.length,
              matchingLines
            };
          }
          
          // This should never happen due to validation
          return {
            success: false,
            action: 'search',
            name: '',
            matches: 0,
            matchingLines: [],
            error: 'Name and search are required for search action'
          };
        }
          
        default: {
          // This should never happen due to validation
          return {
            success: false,
            action,
            error: `Unknown action: ${action}`
          };
        }
      }
    }
  });
};