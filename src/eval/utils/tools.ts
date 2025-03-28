/**
 * Utility functions for working with tools in evaluations
 */

import { Tool } from '../../types/tool';
import { createBashTool } from '../../tools/BashTool';
import { createFileEditTool } from '../../tools/FileEditTool';
import { createFileReadTool } from '../../tools/FileReadTool';
import { createFileWriteTool } from '../../tools/FileWriteTool';
import { createGlobTool } from '../../tools/GlobTool';
import { createGrepTool } from '../../tools/GrepTool';
import { createLSTool } from '../../tools/LSTool';
import { createThinkTool } from '../../tools/ThinkTool';
import { createScratchpadTool } from '../../tools/ScratchpadTool';

/**
 * Creates instances of all available tools
 * @returns Array of all available tool instances
 */
export function createAllTools(): Tool[] {
  return [
    createBashTool(),
    createFileEditTool(),
    createFileReadTool(),
    createFileWriteTool(),
    createGlobTool(),
    createGrepTool(),
    createLSTool(),
    createScratchpadTool(),
    createThinkTool()
  ];
}

/**
 * Map of tool IDs to their friendly names for reporting
 */
export const TOOL_NAMES: Record<string, string> = {
  'bash': 'Bash',
  'file_edit': 'File Edit',
  'file_read': 'File Read',
  'file_write': 'File Write',
  'glob': 'Glob',
  'grep': 'Grep',
  'ls': 'LS',
  'scratchpad': 'Scratchpad',
  'think': 'Think'
};

/**
 * Get the friendly name of a tool by its ID
 * @param toolId Tool ID
 * @returns Friendly name or the original ID if not found
 */
export function getToolFriendlyName(toolId: string): string {
  return TOOL_NAMES[toolId] || toolId;
}