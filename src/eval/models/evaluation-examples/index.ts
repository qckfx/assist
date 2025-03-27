/**
 * Export all evaluation examples and loading utilities
 */

export * from './load-examples';

// Also export the individual example types for documentation
export interface ExampleExecutionHistory {
  good: {
    metadata: {
      notes: string;
      task: string;
    };
    toolCalls: Array<{
      tool: string;
      args: Record<string, any>;
      result: string;
      startTime: string;
      endTime: string;
    }>;
  };
  bad: {
    metadata: {
      notes: string;
      task: string;
    };
    toolCalls: Array<{
      tool: string;
      args: Record<string, any>;
      result: string;
      startTime: string;
      endTime: string;
    }>;
  };
}