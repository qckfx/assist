/**
 * Tests for the enhanced evaluation runner
 */

import { runEnhancedEvaluation } from '../enhanced-evaluation-runner';
import { StorageService } from '../../utils/storage';
import { TestCase } from '../../models/types';
import { SandboxPool } from '../../utils/sandbox-pool';

// Mock dependencies
jest.mock('../../utils/storage', () => {
  // Create a mock storage service
  const mockStorageService = {
    getEvaluationStorageDir: jest.fn().mockReturnValue('/mock/storage/dir'),
    storeExecutionHistory: jest.fn().mockReturnValue('exec-id-123'),
    storeJudgmentResult: jest.fn().mockReturnValue('judge-id-123'),
    storeComparisonResult: jest.fn().mockReturnValue('compare-id-123')
  };
  return {
    StorageService: jest.fn().mockImplementation(() => mockStorageService),
    NodeFileSystem: jest.fn().mockImplementation(() => ({
      existsSync: jest.fn().mockReturnValue(true),
      mkdirSync: jest.fn(),
      writeFileSync: jest.fn(),
      readFileSync: jest.fn().mockReturnValue('{}'),
      readdirSync: jest.fn().mockReturnValue([]),
      statSync: jest.fn().mockReturnValue({ mtime: { getTime: () => Date.now() } }),
      rmSync: jest.fn()
    }))
  };
});

jest.mock('../../utils/sandbox-pool', () => {
  // Mock the SandboxPool class
  return {
    SandboxPool: jest.fn().mockImplementation(() => ({
      waitForInitialization: jest.fn().mockResolvedValue(undefined),
      withExecutionAdapter: jest.fn().mockImplementation((fn) => fn({
        execute: jest.fn().mockResolvedValue({ result: 'success' })
      })),
      shutdown: jest.fn().mockResolvedValue(undefined)
    }))
  };
});

jest.mock('../test-runner', () => ({
  runTestCaseWithHistory: jest.fn().mockResolvedValue({
    testCase: { name: 'test-case-name', instructions: 'Do a task' },
    metrics: { 
      testCase: 'test-case-name',
      promptName: 'default-prompt',
      duration: 1.5,
      toolCalls: 3,
      tokenUsage: { input: 100, output: 200, total: 300 },
      success: true
    },
    executionHistory: {
      metadata: { task: 'Do a task' },
      toolCalls: [
        { 
          tool: 'test-tool', 
          args: { arg1: 'value1' }, 
          result: 'success',
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString()
        }
      ]
    }
  })
}));

jest.mock('../judge-runner', () => ({
  runJudge: jest.fn().mockResolvedValue({
    scores: {
      correctness: 8,
      completeness: 7,
      efficiency: 9,
      codeQuality: 8,
      explanations: 7,
      toolUsage: 8,
      problemSolving: 9
    },
    explanations: {
      correctness: 'Good solution',
      completeness: 'Mostly complete',
      efficiency: 'Very efficient',
      codeQuality: 'Well-structured code',
      explanations: 'Clear explanations',
      toolUsage: 'Appropriate tools',
      problemSolving: 'Logical approach'
    },
    overall: 'Good performance overall',
    strengths: ['Efficiency', 'Problem solving'],
    weaknesses: ['Could improve explanations'],
    suggestions: ['Add more detailed explanations']
  }),
  compareWithJudge: jest.fn().mockResolvedValue({
    judgmentA: {
      scores: { correctness: 8 },
      explanations: { correctness: 'Good' },
      overall: 'Good'
    },
    judgmentB: {
      scores: { correctness: 7 },
      explanations: { correctness: 'Decent' },
      overall: 'OK'
    },
    comparison: 'A is better than B'
  }),
  ModelProvider: jest.fn(),
  ProcessQueryOptions: jest.fn()
}));

// Mock path and fs modules
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  resolve: jest.fn((...args) => args.join('/'))
}));

jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn()
}));

describe('Enhanced Evaluation Runner', () => {
  // Create a mock model provider
  const mockModelProvider = jest.fn().mockImplementation(async () => ({
    id: 'response-123',
    content: [{ type: 'text', text: 'This is a mock response from the model.' }]
  }));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should run basic evaluation with no judge', async () => {
    // Setup test data
    const testCases: TestCase[] = [
      {
        id: 'test-1',
        name: 'Simple Test',
        instructions: 'Perform a simple task',
        type: 'exploration'
      }
    ];

    // Run the evaluation
    const result = await runEnhancedEvaluation(testCases, mockModelProvider);

    // Verify the result structure
    expect(result).toHaveProperty('runs');
    expect(result).toHaveProperty('runId');
    expect(result).toHaveProperty('outputDir');
    expect(result.runs).toHaveLength(1);

    // Verify the SandboxPool was used correctly
    expect(SandboxPool).toHaveBeenCalledWith(1); // Default concurrency

    // Verify storage was used correctly
    const storageService = new StorageService();
    expect(storageService.getEvaluationStorageDir).toHaveBeenCalled();
    expect(storageService.storeExecutionHistory).toHaveBeenCalled();
    
    // Judge should not have been called
    const { runJudge } = require('../judge-runner');
    expect(runJudge).not.toHaveBeenCalled();
  });

  it('should run evaluation with AI judge enabled', async () => {
    // Setup test data
    const testCases: TestCase[] = [
      {
        id: 'test-1',
        name: 'Simple Test',
        instructions: 'Perform a simple task',
        type: 'exploration'
      }
    ];

    // Run the evaluation with judge enabled
    const result = await runEnhancedEvaluation(testCases, mockModelProvider, {
      enableJudge: true
    });

    // Verify the result structure
    expect(result.runs[0]).toHaveProperty('judgment');
    expect(result.runs[0]).toHaveProperty('judgmentId');

    // Verify judge was called
    const { runJudge } = require('../judge-runner');
    expect(runJudge).toHaveBeenCalled();
    
    // Verify judgment was stored
    const storageService = new StorageService();
    expect(storageService.storeJudgmentResult).toHaveBeenCalled();
  });

  it('should run comparative evaluation with multiple runs', async () => {
    // Setup test data
    const testCases: TestCase[] = [
      {
        id: 'test-1',
        name: 'Simple Test',
        instructions: 'Perform a simple task',
        type: 'exploration'
      }
    ];

    // Run the evaluation with multiple runs and comparisons
    const result = await runEnhancedEvaluation(testCases, mockModelProvider, {
      enableJudge: true,
      runsPerTest: 2,
      compareRuns: true
    });

    // Verify multiple runs were created
    expect(result.runs).toHaveLength(2);

    // Verify comparison was called
    const { compareWithJudge } = require('../judge-runner');
    expect(compareWithJudge).toHaveBeenCalled();
    
    // Verify comparison was stored
    const storageService = new StorageService();
    expect(storageService.storeComparisonResult).toHaveBeenCalled();
  });

  it('should handle errors during test execution', async () => {
    // Mock failure in test runner
    const { runTestCaseWithHistory } = require('../test-runner');
    runTestCaseWithHistory.mockRejectedValueOnce(new Error('Test execution failed'));

    // Setup test data
    const testCases: TestCase[] = [
      {
        id: 'test-1',
        name: 'Simple Test',
        instructions: 'Perform a simple task',
        type: 'exploration'
      }
    ];

    // Run the evaluation
    const result = await runEnhancedEvaluation(testCases, mockModelProvider);

    // Should still complete without failing
    expect(result).toHaveProperty('runs');
    expect(result.runs).toHaveLength(0); // No successful runs
  });

  it('should use custom output directory when provided', async () => {
    // Setup test data
    const testCases: TestCase[] = [
      {
        id: 'test-1',
        name: 'Simple Test',
        instructions: 'Perform a simple task',
        type: 'exploration'
      }
    ];

    // Setup a custom storage service
    const customStorageService = new StorageService();
    
    // Run the evaluation with a custom storage service
    await runEnhancedEvaluation(testCases, mockModelProvider, {
      storageService: customStorageService
    });

    // Verify the custom storage service was used
    expect(customStorageService.getEvaluationStorageDir).toHaveBeenCalled();
  });
});