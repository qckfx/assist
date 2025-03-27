/**
 * Tests for the execution history extraction utilities
 */

import { extractExecutionHistory, formatArgs, formatExecutionHistoryForJudge } from '../execution-history';
import { ProcessQueryResult } from '../../../types/agent';
import { AgentExecutionHistory } from '../../models/types';

describe('Execution History Utilities', () => {
  describe('extractExecutionHistory', () => {
    it('should extract tool calls from ProcessQueryResult', () => {
      // Setup a sample ProcessQueryResult
      const mockResult: ProcessQueryResult = {
        result: {
          toolResults: [
            {
              toolId: 'glob',
              args: { pattern: '**/*.js' },
              result: 'file1.js\nfile2.js'
            },
            {
              toolId: 'file_read',
              args: { path: '/path/to/file.js' },
              result: 'console.log("Hello World");'
            }
          ],
          iterations: 2
        },
        response: 'The files were found and read.',
        sessionState: { duration: 1500 },
        done: true
      };

      const taskDescription = 'Find and read JavaScript files';
      
      // Extract the execution history
      const history = extractExecutionHistory(mockResult, taskDescription);
      
      // Verify the history structure
      expect(history).toBeDefined();
      expect(history.metadata).toBeDefined();
      expect(history.metadata?.task).toBe('Find and read JavaScript files');
      expect(history.toolCalls).toHaveLength(2);
      
      // Verify the first tool call
      expect(history.toolCalls[0].tool).toBe('glob');
      expect(history.toolCalls[0].args).toEqual({ pattern: '**/*.js' });
      expect(history.toolCalls[0].result).toBe('file1.js\nfile2.js');
      
      // Verify the second tool call
      expect(history.toolCalls[1].tool).toBe('file_read');
      expect(history.toolCalls[1].args).toEqual({ path: '/path/to/file.js' });
      expect(history.toolCalls[1].result).toBe('console.log("Hello World");');
    });
    
    it('should handle empty or missing tool results', () => {
      // Setup a sample with missing tool results
      const mockResult: ProcessQueryResult = {
        response: 'No tools were used.',
        sessionState: { duration: 500 },
        done: true
      };
      
      // Extract the execution history
      const history = extractExecutionHistory(mockResult);
      
      // Verify the history structure
      expect(history).toBeDefined();
      expect(history.toolCalls).toHaveLength(0);
      expect(history.metadata).toBeUndefined();
    });
  });
  
  describe('formatArgs', () => {
    it('should format simple arguments correctly', () => {
      const args = {
        name: 'test',
        value: 42,
        enabled: true
      };
      
      const formatted = formatArgs(args);
      expect(formatted).toBe('name: "test", value: 42, enabled: true');
    });
    
    it('should truncate long string values', () => {
      const args = {
        content: 'a'.repeat(200)
      };
      
      const formatted = formatArgs(args);
      expect(formatted.length).toBeLessThan(args.content.length);
      expect(formatted).toContain('...');
    });
    
    it('should handle arrays and objects', () => {
      const args = {
        array: [1, 2, 3, 4, 5],
        object: { key1: 'value1', key2: 'value2' }
      };
      
      const formatted = formatArgs(args);
      expect(formatted).toContain('array: [Array with 5 items]');
      expect(formatted).toContain('object: {Object}');
    });
  });
  
  describe('formatExecutionHistoryForJudge', () => {
    it('should format execution history for judge prompt', () => {
      const history: AgentExecutionHistory = {
        metadata: {
          task: 'Find and process files'
        },
        toolCalls: [
          {
            tool: 'glob',
            args: { pattern: '**/*.js' },
            result: 'file1.js\nfile2.js',
            startTime: '2023-01-01T10:00:00.000Z',
            endTime: '2023-01-01T10:00:00.100Z'
          },
          {
            tool: 'file_read',
            args: { path: '/path/to/file.js' },
            result: 'console.log("Hello World");',
            startTime: '2023-01-01T10:00:00.200Z',
            endTime: '2023-01-01T10:00:00.300Z'
          }
        ]
      };
      
      const formatted = formatExecutionHistoryForJudge(history);
      
      // Verify the formatted output
      expect(formatted).toContain('### Task');
      expect(formatted).toContain('Find and process files');
      expect(formatted).toContain('### Tool Call Sequence');
      expect(formatted).toContain('Tool Call 1: glob');
      expect(formatted).toContain('**Arguments:** pattern: "**/*.js"');
      expect(formatted).toContain('**Result:** file1.js');
      expect(formatted).toContain('Tool Call 2: file_read');
      expect(formatted).toContain('**Execution Time:**');
    });
    
    it('should handle empty execution history', () => {
      const history: AgentExecutionHistory = {
        metadata: {
          task: 'A task with no tool calls'
        },
        toolCalls: []
      };
      
      const formatted = formatExecutionHistoryForJudge(history);
      
      expect(formatted).toContain('### Task');
      expect(formatted).toContain('A task with no tool calls');
      expect(formatted).toContain('No tool calls were made during execution');
    });
  });
});