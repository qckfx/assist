/**
 * Tests for judge prompt utilities
 */

import { JUDGE_SYSTEM_PROMPT, createJudgingPrompt, getJudgeSystemPrompt } from '../judge-prompts';
import { AgentExecutionHistory } from '../../models/types';
import * as executionHistoryUtils from '../execution-history';

// Mock the formatExecutionHistoryForJudge function
jest.mock('../execution-history', () => ({
  formatExecutionHistoryForJudge: jest.fn().mockImplementation(() => 'FORMATTED EXECUTION HISTORY')
}));

describe('Judge Prompt Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('JUDGE_SYSTEM_PROMPT', () => {
    it('should contain key evaluation dimensions', () => {
      expect(JUDGE_SYSTEM_PROMPT).toContain('Correctness');
      expect(JUDGE_SYSTEM_PROMPT).toContain('Completeness');
      expect(JUDGE_SYSTEM_PROMPT).toContain('Efficiency');
      expect(JUDGE_SYSTEM_PROMPT).toContain('Code Quality');
      expect(JUDGE_SYSTEM_PROMPT).toContain('Tool Usage');
      expect(JUDGE_SYSTEM_PROMPT).toContain('Problem Solving');
    });
  });

  describe('getJudgeSystemPrompt', () => {
    it('should return the default system prompt when no override is provided', () => {
      const prompt = getJudgeSystemPrompt();
      expect(prompt).toBe(JUDGE_SYSTEM_PROMPT);
    });

    it('should return the override prompt when one is provided', () => {
      const overridePrompt = 'Custom system prompt';
      const prompt = getJudgeSystemPrompt(overridePrompt);
      expect(prompt).toBe(overridePrompt);
    });
  });

  describe('createJudgingPrompt', () => {
    const mockExecutionHistory: AgentExecutionHistory = {
      metadata: {
        task: 'Test task'
      },
      toolCalls: []
    };

    it('should create a basic prompt with task and execution history', () => {
      const prompt = createJudgingPrompt({
        task: 'Create a utility function',
        executionHistory: mockExecutionHistory
      });

      // Check that the task is included
      expect(prompt).toContain('Create a utility function');
      
      // Check that formatExecutionHistoryForJudge was called
      expect(executionHistoryUtils.formatExecutionHistoryForJudge).toHaveBeenCalledWith(mockExecutionHistory);
      
      // Check that the formatted execution history is included
      expect(prompt).toContain('FORMATTED EXECUTION HISTORY');
      
      // Check for evaluation instructions
      expect(prompt).toContain('EVALUATION INSTRUCTIONS');
      expect(prompt).toContain('Dimensions to evaluate');
      
      // Check for response format
      expect(prompt).toContain('RESPONSE FORMAT');
      expect(prompt).toContain('```json');
      expect(prompt).toContain('"scores"');
      expect(prompt).toContain('"explanations"');
    });

    it('should include examples when provided', () => {
      const goodExample: AgentExecutionHistory = { 
        metadata: { task: 'Good example task' }, 
        toolCalls: [] 
      };
      
      const badExample: AgentExecutionHistory = { 
        metadata: { task: 'Bad example task' }, 
        toolCalls: [] 
      };
      
      const prompt = createJudgingPrompt({
        task: 'Create a utility function',
        executionHistory: mockExecutionHistory,
        examples: {
          good: goodExample,
          bad: badExample
        }
      });

      // Check that examples section is included
      expect(prompt).toContain('EVALUATION EXAMPLES');
      
      // Check that formatExecutionHistoryForJudge was called for examples
      expect(executionHistoryUtils.formatExecutionHistoryForJudge).toHaveBeenCalledWith(goodExample);
      expect(executionHistoryUtils.formatExecutionHistoryForJudge).toHaveBeenCalledWith(badExample);
      
      // Check for good example section
      expect(prompt).toContain('GOOD EXAMPLE');
      expect(prompt).toContain('This is a good example because');
      
      // Check for bad example section
      expect(prompt).toContain('BAD EXAMPLE');
      expect(prompt).toContain('This is a problematic example because');
    });

    it('should handle only good examples', () => {
      const goodExample: AgentExecutionHistory = { 
        metadata: { task: 'Good example task' }, 
        toolCalls: [] 
      };
      
      const prompt = createJudgingPrompt({
        task: 'Create a utility function',
        executionHistory: mockExecutionHistory,
        examples: {
          good: goodExample
        }
      });

      // Check that good example is included but not bad example
      expect(prompt).toContain('GOOD EXAMPLE');
      expect(prompt).not.toContain('BAD EXAMPLE');
    });

    it('should handle only bad examples', () => {
      const badExample: AgentExecutionHistory = { 
        metadata: { task: 'Bad example task' }, 
        toolCalls: [] 
      };
      
      const prompt = createJudgingPrompt({
        task: 'Create a utility function',
        executionHistory: mockExecutionHistory,
        examples: {
          bad: badExample
        }
      });

      // Check that bad example is included but not good example
      expect(prompt).not.toContain('GOOD EXAMPLE');
      expect(prompt).toContain('BAD EXAMPLE');
    });
  });
});