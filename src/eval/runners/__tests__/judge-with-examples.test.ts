/**
 * Integration test for AI judge with evaluation examples
 * 
 * This test verifies that the evaluation examples can be used
 * by the judge runner to evaluate agent performance.
 */

import { loadExampleByCategory } from '../../models/evaluation-examples';
import { runJudge, ModelProvider } from '../judge-runner';

// Create a mock model provider for testing
const mockModelProvider: ModelProvider = {
  processQuery: jest.fn().mockResolvedValue({
    response: `
    \`\`\`json
    {
      "scores": {
        "correctness": 8,
        "completeness": 7,
        "efficiency": 9,
        "codeQuality": 8,
        "explanations": 7,
        "toolUsage": 8,
        "problemSolving": 9
      },
      "explanations": {
        "correctness": "The agent correctly found the files importing the logger.",
        "completeness": "The solution is mostly complete.",
        "efficiency": "The agent used an efficient approach.",
        "codeQuality": "The code quality is good.",
        "explanations": "The agent provided clear explanations.",
        "toolUsage": "The agent used the appropriate tools efficiently.",
        "problemSolving": "The agent demonstrated a logical approach."
      },
      "overall": "The agent performed well overall.",
      "strengths": ["Efficiency", "Problem-solving"],
      "weaknesses": ["Could improve completeness"],
      "suggestions": ["Provide more thorough explanations"]
    }
    \`\`\`
    `
  })
};

describe('AI Judge with Examples (Integration)', () => {
  const fileSearchExample = loadExampleByCategory('file-search');
  const bugFixingExample = loadExampleByCategory('bug-fixing');
  
  // Skip this test in CI environments to avoid actually calling a model
  it('should run the judge with a good example', async () => {
    expect(fileSearchExample).not.toBeNull();
    
    if (fileSearchExample && fileSearchExample.good && fileSearchExample.good.metadata) {
      const result = await runJudge(
        fileSearchExample.good,
        fileSearchExample.good.metadata.task,
        mockModelProvider
      );
      
      // Verify the judge results
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('scores');
      expect(result).toHaveProperty('overall');
      expect(result).toHaveProperty('strengths');
      expect(result).toHaveProperty('weaknesses');
    }
  });
  
  it('should run the judge with a bad example', async () => {
    expect(fileSearchExample).not.toBeNull();
    
    if (fileSearchExample && fileSearchExample.bad && fileSearchExample.bad.metadata) {
      const result = await runJudge(
        fileSearchExample.bad,
        fileSearchExample.bad.metadata.task,
        mockModelProvider
      );
      
      // Verify the judge results
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('scores');
      expect(result).toHaveProperty('overall');
      expect(result).toHaveProperty('strengths');
      expect(result).toHaveProperty('weaknesses');
    }
  });
  
  it('should run the judge with examples from different categories', async () => {
    expect(bugFixingExample).not.toBeNull();
    
    if (bugFixingExample && bugFixingExample.good && bugFixingExample.good.metadata) {
      const result = await runJudge(
        bugFixingExample.good,
        bugFixingExample.good.metadata.task,
        mockModelProvider
      );
      
      // Verify the judge results
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('scores');
      expect(result).toHaveProperty('overall');
    }
  });
  
  it('should pass examples to the judge for calibration', async () => {
    expect(fileSearchExample).not.toBeNull();
    
    if (fileSearchExample && fileSearchExample.good && fileSearchExample.good.metadata) {
      const result = await runJudge(
        fileSearchExample.good,
        fileSearchExample.good.metadata.task,
        mockModelProvider,
        {
          examples: {
            good: fileSearchExample.good,
            bad: fileSearchExample.bad
          }
        }
      );
      
      // Verify the judge results
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('scores');
      expect(result).toHaveProperty('overall');
      
      // Verify that the model provider was called
      expect(mockModelProvider.processQuery).toHaveBeenCalled();
    }
  });
});