/**
 * Tests for the enhanced test runner with history collection
 */

import { runTestCaseWithHistory } from '../test-runner';
import { TestCase } from '../../models/types';
import { E2BExecutionAdapter } from '../../../utils/E2BExecutionAdapter';
import { extractExecutionHistory } from '../../utils/execution-history';

// Mock the dependencies
jest.mock('../../../utils/E2BExecutionAdapter');
jest.mock('../../utils/execution-history');

// Mock the agent runner
jest.mock('../../../core/AgentRunner', () => ({
  createAgentRunner: jest.fn().mockReturnValue({
    processQuery: jest.fn().mockResolvedValue({
      response: 'This is a test response',
      result: {
        toolResults: [
          {
            toolId: 'bash',
            args: { command: 'ls -la' },
            result: 'file1\nfile2'
          }
        ],
        iterations: 2
      },
      sessionState: {
        tokenUsage: { totalTokens: 1000 }
      },
      done: true
    })
  })
}));

// Mock the other core components
jest.mock('../../../core/ModelClient', () => ({
  createModelClient: jest.fn().mockReturnValue({})
}));

jest.mock('../../../core/ToolRegistry', () => ({
  createToolRegistry: jest.fn().mockReturnValue({
    registerTool: jest.fn(),
    onToolExecutionStart: jest.fn().mockReturnValue(jest.fn()),
    onToolExecutionComplete: jest.fn().mockReturnValue(jest.fn()),
    onToolExecutionError: jest.fn().mockReturnValue(jest.fn())
  })
}));

jest.mock('../../../core/PermissionManager', () => ({
  createPermissionManager: jest.fn().mockReturnValue({
    enableDangerMode: jest.fn()
  })
}));

// Mock all the tool creation functions
jest.mock('../../../tools/BashTool', () => ({ createBashTool: jest.fn() }));
jest.mock('../../../tools/GlobTool', () => ({ createGlobTool: jest.fn() }));
jest.mock('../../../tools/GrepTool', () => ({ createGrepTool: jest.fn() }));
jest.mock('../../../tools/LSTool', () => ({ createLSTool: jest.fn() }));
jest.mock('../../../tools/FileReadTool', () => ({ createFileReadTool: jest.fn() }));
jest.mock('../../../tools/FileEditTool', () => ({ createFileEditTool: jest.fn() }));
jest.mock('../../../tools/FileWriteTool', () => ({ createFileWriteTool: jest.fn() }));

// Setup mock for extractExecutionHistory
const mockExtractExecutionHistory = extractExecutionHistory as jest.Mock;

describe('Test Runner with History', () => {
  // Sample test case
  const testCase: TestCase = {
    id: 'test-1',
    name: 'Test Case 1',
    instructions: 'Run ls command',
    type: 'exploration'
  };
  
  // Mock sandbox and model provider
  const mockSandbox = {} as E2BExecutionAdapter;
  const mockModelProvider = {};
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock return value for extractExecutionHistory
    mockExtractExecutionHistory.mockReturnValue({
      metadata: {
        task: 'Run ls command'
      },
      toolCalls: [
        {
          tool: 'bash',
          args: { command: 'ls -la' },
          result: 'file1\nfile2',
          startTime: '2023-10-01T10:00:00.000Z',
          endTime: '2023-10-01T10:00:00.100Z'
        }
      ]
    });
  });
  
  it('should run a test case and return metrics with execution history', async () => {
    // Run the test
    const result = await runTestCaseWithHistory(
      testCase,
      mockSandbox,
      mockModelProvider
    );
    
    // Verify the result structure
    expect(result).toHaveProperty('testCase');
    expect(result).toHaveProperty('metrics');
    expect(result).toHaveProperty('executionHistory');
    
    // Verify the test case in the result
    expect(result.testCase).toBe(testCase);
    
    // Verify metrics
    expect(result.metrics.testCase).toBe('Test Case 1');
    expect(result.metrics.toolCalls).toBe(0); // No actual tool calls in the mock setup
    expect(result.metrics.success).toBe(true);
    
    // Verify execution history
    expect(result.executionHistory).toBeDefined();
    expect(result.executionHistory.metadata?.task).toBe('Run ls command');
    expect(result.executionHistory.toolCalls).toHaveLength(1);
    
    // Verify that extractExecutionHistory was called
    expect(mockExtractExecutionHistory).toHaveBeenCalled();
  });
  
  it('should handle errors gracefully', async () => {
    // Make the agent runner throw an error
    const createAgentRunner = require('../../../core/AgentRunner').createAgentRunner;
    createAgentRunner.mockReturnValueOnce({
      processQuery: jest.fn().mockRejectedValueOnce(new Error('Test error'))
    });
    
    // Run the test
    const result = await runTestCaseWithHistory(
      testCase,
      mockSandbox,
      mockModelProvider
    );
    
    // Verify error handling
    expect(result.metrics.success).toBe(false);
    expect(result.metrics.notes).toContain('Test error');
    
    // Verify minimal execution history was created
    expect(result.executionHistory).toBeDefined();
    expect(result.executionHistory.toolCalls).toHaveLength(0);
  });
});