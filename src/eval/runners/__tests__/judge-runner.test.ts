/**
 * Tests for the judge runner
 */

import { parseJudgmentOutput, runJudge, compareWithJudge } from '../judge-runner';
import { AgentExecutionHistory, JudgmentResult } from '../../models/types';
import { createJudgingPrompt } from '../../utils/judge-prompts';

// Mock the judge prompt utilities
jest.mock('../../utils/judge-prompts', () => ({
  createJudgingPrompt: jest.fn().mockReturnValue('mocked judging prompt'),
  getJudgeSystemPrompt: jest.fn().mockReturnValue('mocked system prompt'),
}));

// Mock the AnthropicProvider
jest.mock('../../../providers/AnthropicProvider');

describe('Judge Runner', () => {
  // Sample execution history for testing
  const sampleHistory: AgentExecutionHistory = {
    metadata: {
      task: 'Sample task'
    },
    toolCalls: [
      {
        tool: 'bash',
        args: { command: 'ls -la' },
        result: 'file1\nfile2',
        startTime: '2023-01-01T10:00:00.000Z',
        endTime: '2023-01-01T10:00:00.100Z'
      }
    ]
  };

  // Sample judgment result for mocking
  const sampleJudgment: JudgmentResult = {
    scores: {
      correctness: 8,
      completeness: 7,
      efficiency: 9,
      codeQuality: 8,
      explanations: 7,
      toolUsage: 9,
      problemSolving: 8
    },
    explanations: {
      correctness: 'Good correctness',
      completeness: 'Good completeness',
      efficiency: 'Excellent efficiency',
      codeQuality: 'Good code quality',
      explanations: 'Good explanations',
      toolUsage: 'Excellent tool usage',
      problemSolving: 'Good problem solving'
    },
    overall: 'Overall good performance',
    strengths: ['Efficient', 'Good tool usage'],
    weaknesses: ['Could be more complete']
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseJudgmentOutput', () => {
    it('should parse JSON from code block', () => {
      const output = `
Here's my evaluation:

\`\`\`json
{
  "scores": {
    "correctness": 8,
    "completeness": 7,
    "efficiency": 9,
    "codeQuality": 8,
    "explanations": 7,
    "toolUsage": 9,
    "problemSolving": 8
  },
  "explanations": {
    "correctness": "Good correctness",
    "completeness": "Good completeness",
    "efficiency": "Excellent efficiency",
    "codeQuality": "Good code quality",
    "explanations": "Good explanations",
    "toolUsage": "Excellent tool usage",
    "problemSolving": "Good problem solving"
  },
  "overall": "Overall good performance",
  "strengths": ["Efficient", "Good tool usage"],
  "weaknesses": ["Could be more complete"]
}
\`\`\`
`;

      const result = parseJudgmentOutput(output);
      
      expect(result).toEqual(sampleJudgment);
    });

    it('should parse raw JSON', () => {
      const output = `
{
  "scores": {
    "correctness": 8,
    "completeness": 7,
    "efficiency": 9,
    "codeQuality": 8,
    "explanations": 7,
    "toolUsage": 9,
    "problemSolving": 8
  },
  "explanations": {
    "correctness": "Good correctness",
    "completeness": "Good completeness",
    "efficiency": "Excellent efficiency",
    "codeQuality": "Good code quality",
    "explanations": "Good explanations",
    "toolUsage": "Excellent tool usage",
    "problemSolving": "Good problem solving"
  },
  "overall": "Overall good performance",
  "strengths": ["Efficient", "Good tool usage"],
  "weaknesses": ["Could be more complete"]
}
`;

      const result = parseJudgmentOutput(output);
      
      expect(result).toEqual(sampleJudgment);
    });

    it('should return null for malformed JSON', () => {
      const output = `
\`\`\`json
{
  "scores": {
    "correctness": 8,
    "completeness": 7
  },
  "explanations": "This is incomplete"
}
\`\`\`
`;

      const result = parseJudgmentOutput(output);
      
      expect(result).toBeNull();
    });

    it('should return null when no JSON is found', () => {
      const output = 'This is a response with no JSON';

      const result = parseJudgmentOutput(output);
      
      expect(result).toBeNull();
    });
  });

  describe('runJudge', () => {
    // Mock AnthropicProvider's processQuery method
    const mockProcessQuery = jest.fn();
    const mockProvider = {
      processQuery: mockProcessQuery
    };

    it('should run the judge and return a judgment result', async () => {
      // Set up the mock response
      mockProcessQuery.mockResolvedValueOnce({
        response: `
\`\`\`json
{
  "scores": {
    "correctness": 8,
    "completeness": 7,
    "efficiency": 9,
    "codeQuality": 8,
    "explanations": 7,
    "toolUsage": 9,
    "problemSolving": 8
  },
  "explanations": {
    "correctness": "Good correctness",
    "completeness": "Good completeness",
    "efficiency": "Excellent efficiency",
    "codeQuality": "Good code quality",
    "explanations": "Good explanations",
    "toolUsage": "Excellent tool usage",
    "problemSolving": "Good problem solving"
  },
  "overall": "Overall good performance",
  "strengths": ["Efficient", "Good tool usage"],
  "weaknesses": ["Could be more complete"]
}
\`\`\`
`
      });

      const result = await runJudge(
        sampleHistory,
        'Evaluate this code',
        mockProvider
      );

      // Verify the judge prompt was created
      expect(createJudgingPrompt).toHaveBeenCalledWith({
        task: 'Evaluate this code',
        executionHistory: sampleHistory,
        examples: undefined,
        systemPromptOverride: undefined
      });

      // Verify the model was called with the right parameters
      expect(mockProcessQuery).toHaveBeenCalledWith('mocked judging prompt', {
        temperature: 0.2,
        maxTokens: 2000
      });

      // Check the result
      expect(result).toEqual(sampleJudgment);
    });

    it('should return null if the model response is empty', async () => {
      mockProcessQuery.mockResolvedValueOnce({
        response: null
      });

      const result = await runJudge(
        sampleHistory,
        'Evaluate this code',
        mockProvider
      );

      expect(result).toBeNull();
    });

    it('should return null if parsing fails', async () => {
      mockProcessQuery.mockResolvedValueOnce({
        response: 'Invalid response with no JSON'
      });

      const result = await runJudge(
        sampleHistory,
        'Evaluate this code',
        mockProvider
      );

      expect(result).toBeNull();
    });

    it('should pass examples when provided', async () => {
      mockProcessQuery.mockResolvedValueOnce({
        response: `\`\`\`json
${JSON.stringify(sampleJudgment)}
\`\`\``
      });

      const goodExample: AgentExecutionHistory = {
        metadata: { task: 'Good example' },
        toolCalls: []
      };

      const badExample: AgentExecutionHistory = {
        metadata: { task: 'Bad example' },
        toolCalls: []
      };

      await runJudge(
        sampleHistory,
        'Evaluate this code',
        mockProvider,
        {
          examples: {
            good: goodExample,
            bad: badExample
          }
        }
      );

      // Verify examples were passed to createJudgingPrompt
      expect(createJudgingPrompt).toHaveBeenCalledWith({
        task: 'Evaluate this code',
        executionHistory: sampleHistory,
        examples: {
          good: goodExample,
          bad: badExample
        },
        systemPromptOverride: undefined
      });
    });
  });

  describe('compareWithJudge', () => {
    // Mock AnthropicProvider's processQuery method
    const mockProcessQuery = jest.fn();
    const mockProvider = {
      processQuery: mockProcessQuery
    };

    // Mock runJudge function
    const originalRunJudge = runJudge;
    let mockRunJudge: jest.SpyInstance;

    beforeEach(() => {
      // Create a spy on runJudge
      mockRunJudge = jest.spyOn({ runJudge: originalRunJudge }, 'runJudge');
    });

    afterEach(() => {
      mockRunJudge.mockRestore();
    });

    it('should compare two execution histories', async () => {
      // Set up mock responses
      mockRunJudge
        .mockResolvedValueOnce(sampleJudgment) // For execution A
        .mockResolvedValueOnce({  // For execution B
          ...sampleJudgment,
          scores: {
            ...sampleJudgment.scores,
            efficiency: 7 // Lower score for B
          }
        });

      mockProcessQuery.mockResolvedValueOnce({
        response: 'Execution A performed better overall due to higher efficiency.'
      });

      const executionA = {
        history: { 
          metadata: { task: 'Task A' },
          toolCalls: []
        },
        task: 'Task A'
      };

      const executionB = {
        history: {
          metadata: { task: 'Task B' },
          toolCalls: []
        },
        task: 'Task B'
      };

      const result = await compareWithJudge(
        executionA,
        executionB,
        mockProvider
      );

      // Verify runJudge was called for both executions
      expect(mockRunJudge).toHaveBeenCalledTimes(2);
      expect(mockRunJudge).toHaveBeenCalledWith(
        executionA.history,
        executionA.task,
        mockProvider,
        {}
      );
      expect(mockRunJudge).toHaveBeenCalledWith(
        executionB.history,
        executionB.task,
        mockProvider,
        {}
      );

      // Verify the comparison prompt includes both judgments
      expect(mockProcessQuery).toHaveBeenCalled();
      const promptArg = mockProcessQuery.mock.calls[0][0];
      expect(promptArg).toContain('EXECUTION A JUDGMENT');
      expect(promptArg).toContain('EXECUTION B JUDGMENT');

      // Check the result structure
      expect(result).toEqual({
        judgmentA: sampleJudgment,
        judgmentB: expect.objectContaining({
          scores: expect.objectContaining({ efficiency: 7 })
        }),
        comparison: 'Execution A performed better overall due to higher efficiency.'
      });
    });

    it('should handle failure of one judgment', async () => {
      // Make the first judgment succeed but the second fail
      mockRunJudge
        .mockResolvedValueOnce(sampleJudgment) // For execution A
        .mockResolvedValueOnce(null);          // For execution B

      const executionA = {
        history: {
          metadata: { task: 'Task A' },
          toolCalls: []
        },
        task: 'Task A'
      };

      const executionB = {
        history: {
          metadata: { task: 'Task B' },
          toolCalls: []
        },
        task: 'Task B'
      };

      const result = await compareWithJudge(
        executionA,
        executionB,
        mockProvider
      );

      // Verify we still get the successful judgment
      expect(result).toEqual({
        judgmentA: sampleJudgment,
        judgmentB: null,
        comparison: null
      });

      // Verify processQuery was not called for comparison
      expect(mockProcessQuery).not.toHaveBeenCalled();
    });

    it('should handle failure in the comparison step', async () => {
      // Both judgments succeed but comparison fails
      mockRunJudge
        .mockResolvedValueOnce(sampleJudgment)
        .mockResolvedValueOnce(sampleJudgment);

      mockProcessQuery.mockRejectedValueOnce(new Error('Comparison failed'));

      const executionA = {
        history: {
          metadata: { task: 'Task A' },
          toolCalls: []
        },
        task: 'Task A'
      };

      const executionB = {
        history: {
          metadata: { task: 'Task B' },
          toolCalls: []
        },
        task: 'Task B'
      };

      const result = await compareWithJudge(
        executionA,
        executionB,
        mockProvider
      );

      // Verify we still get both judgments
      expect(result).toEqual({
        judgmentA: sampleJudgment,
        judgmentB: sampleJudgment,
        comparison: null
      });
    });
  });
});