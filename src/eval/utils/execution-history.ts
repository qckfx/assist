/**
 * Utilities for extracting and formatting agent execution history
 */

import { ToolCallRecord, AgentExecutionHistory, ExecutionMetadata } from '../models/types';
import { ProcessQueryResult } from '../../types/agent';

/**
 * Extract execution history from ProcessQueryResult
 */
export function extractExecutionHistory(
  result: ProcessQueryResult,
  taskDescription?: string
): AgentExecutionHistory {
  // Extract tool calls from the result
  const toolCalls: ToolCallRecord[] = [];
  
  if (result.result?.toolResults) {
    for (const toolResult of result.result.toolResults) {
      toolCalls.push({
        tool: toolResult.toolId,
        args: toolResult.args,
        result: String(toolResult.result || ''),
        startTime: '', // These fields aren't available in the current structure
        endTime: ''    // but are part of our schema for future use
      });
    }
  }
  
  // Create metadata if task description is provided
  let metadata: ExecutionMetadata | undefined;
  if (taskDescription) {
    metadata = {
      task: taskDescription
    };
  }
  
  return {
    metadata,
    toolCalls
  };
}

/**
 * Format arguments for display
 */
export function formatArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([key, value]) => {
      // Handle different value types
      if (typeof value === 'string') {
        // Truncate long string values
        const displayValue = value.length > 100
          ? value.substring(0, 100) + '...'
          : value;
        return `${key}: "${displayValue}"`;
      } else if (Array.isArray(value)) {
        return `${key}: [Array with ${value.length} items]`;
      } else if (typeof value === 'object' && value !== null) {
        return `${key}: {Object}`;
      }
      return `${key}: ${value}`;
    })
    .join(', ');
}

/**
 * Format the execution history for the judge prompt
 */
export function formatExecutionHistoryForJudge(history: AgentExecutionHistory): string {
  let formattedHistory = '';
  
  // Add task description if available
  if (history.metadata?.task) {
    formattedHistory += `### Task\n${history.metadata.task}\n\n`;
  }
  
  // Add tool call sequence heading
  formattedHistory += `### Tool Call Sequence\n`;
  
  if (history.toolCalls.length === 0) {
    formattedHistory += 'No tool calls were made during execution.\n\n';
  } else {
    // Format each tool call
    history.toolCalls.forEach((tc, index) => {
      formattedHistory += `\n#### Tool Call ${index + 1}: ${tc.tool}\n`;
      formattedHistory += `**Arguments:** ${formatArgs(tc.args)}\n`;
      formattedHistory += `**Result:** ${formatToolResult(tc.result)}\n`;
      
      // Add timing information if available
      if (tc.startTime && tc.endTime) {
        formattedHistory += `**Execution Time:** ${formatTimeDifference(tc.startTime, tc.endTime)}\n`;
      }
    });
  }
  
  return formattedHistory;
}

/**
 * Format a tool result for display
 */
function formatToolResult(result: string): string {
  // Truncate very long results
  if (result.length > 500) {
    return result.substring(0, 500) + '... [truncated]';
  }
  return result;
}

/**
 * Calculate and format the time difference between two ISO timestamps
 */
function formatTimeDifference(startTime: string, endTime: string): string {
  try {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const diffMs = end - start;
    
    if (diffMs < 1000) {
      return `${diffMs}ms`;
    } else {
      return `${(diffMs / 1000).toFixed(2)}s`;
    }
  } catch (error) {
    return 'Unknown';
  }
}