/**
 * Tests for the agent factory
 */

import { createAgentFromConfig } from '../agent-factory';
import { AgentConfiguration } from '../../models/ab-types';

// Mock dependencies
jest.mock('../../../providers/AnthropicProvider', () => ({
  createAnthropicProvider: jest.fn(() => ({
    model: 'mock-model',
    generateMessage: jest.fn(),
    getToolCall: jest.fn(),
    generateResponse: jest.fn()
  }))
}));

jest.mock('../../../core/ModelClient', () => ({
  createModelClient: jest.fn(({ modelProvider, promptManager, toolRegistry }) => ({
    modelProvider,
    promptManager,
    toolRegistry,
    getToolCall: jest.fn(),
    generateResponse: jest.fn()
  }))
}));

jest.mock('../../../core/PromptManager', () => ({
  createPromptManager: jest.fn((systemPrompt, temperature) => ({
    systemPrompt,
    temperature,
    createSystemPrompt: jest.fn()
  }))
}));

jest.mock('../../../core/ToolRegistry', () => {
  // Create a mock implementation of ToolRegistry
  const mockRegistry = {
    registerTool: jest.fn(),
    getAllTools: jest.fn().mockReturnValue([]),
    getTool: jest.fn()
  };
  
  return {
    createToolRegistry: jest.fn(() => mockRegistry)
  };
});

// Mock all tools
jest.mock('../tools', () => {
  const mockTools = [
    { id: 'bash', name: 'BashTool' },
    { id: 'ls', name: 'LSTool' },
    { id: 'glob', name: 'GlobTool' },
    { id: 'grep', name: 'GrepTool' },
    { id: 'file_read', name: 'FileReadTool' },
    { id: 'file_write', name: 'FileWriteTool' },
    { id: 'file_edit', name: 'FileEditTool' },
    { id: 'think', name: 'ThinkTool' }
  ];
  
  // Mock ToolRegistry that would be returned by createFilteredToolRegistry
  const mockToolRegistry = {
    registerTool: jest.fn(),
    getAllTools: jest.fn().mockReturnValue([]),
    getTool: jest.fn()
  };
  
  return {
    createAllTools: jest.fn(() => mockTools),
    createFilteredToolRegistry: jest.fn((availableTools, _configName) => {
      // Simulate the filtering behavior
      if (availableTools && availableTools.length > 0) {
        mockToolRegistry.getAllTools.mockReturnValue(
          mockTools.filter(tool => availableTools.includes(tool.id))
        );
      } else if (availableTools && availableTools.length === 0) {
        mockToolRegistry.getAllTools.mockReturnValue([]);
      } else {
        mockToolRegistry.getAllTools.mockReturnValue([...mockTools]);
      }
      return mockToolRegistry;
    })
  };
});

describe('Agent Factory', () => {
  // Sample configuration for testing
  const sampleConfig: AgentConfiguration = {
    id: 'test',
    name: 'Test Agent',
    systemPrompt: 'Test system prompt',
    model: 'claude-3-opus-20240229',
    parameters: {
      temperature: 0.5
    }
  };
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  test('createAgentFromConfig creates an agent with all tools when availableTools is not specified', () => {
    // Call the function
    createAgentFromConfig(sampleConfig);
    
    // Verify that createFilteredToolRegistry was called with undefined availableTools
    const createFilteredToolRegistry = jest.requireMock('../tools').createFilteredToolRegistry;
    expect(createFilteredToolRegistry).toHaveBeenCalledWith(undefined, sampleConfig.name);
    
    // Verify that the toolRegistry was passed to createModelClient
    const createModelClient = jest.requireMock('../../../core/ModelClient').createModelClient;
    expect(createModelClient).toHaveBeenCalledWith(
      expect.objectContaining({
        toolRegistry: expect.any(Object)
      })
    );
  });
  
  test('createAgentFromConfig creates an agent with filtered tools when availableTools is specified', () => {
    // Create a configuration with a specific set of tools
    const configWithTools: AgentConfiguration = {
      ...sampleConfig,
      availableTools: ['bash', 'ls', 'glob'] // Only include these tools
    };
    
    // Call the function
    createAgentFromConfig(configWithTools);
    
    // Verify that createFilteredToolRegistry was called with the right tools
    const createFilteredToolRegistry = jest.requireMock('../tools').createFilteredToolRegistry;
    expect(createFilteredToolRegistry).toHaveBeenCalledWith(
      configWithTools.availableTools,
      configWithTools.name
    );
    
    // Verify that the toolRegistry was passed to createModelClient
    const createModelClient = jest.requireMock('../../../core/ModelClient').createModelClient;
    expect(createModelClient).toHaveBeenCalledWith(
      expect.objectContaining({
        toolRegistry: expect.any(Object)
      })
    );
  });
  
  test('createAgentFromConfig handles empty availableTools array', () => {
    // Create a configuration with an empty tools array
    const configWithEmptyTools: AgentConfiguration = {
      ...sampleConfig,
      availableTools: [] // No tools
    };
    
    // Call the function
    createAgentFromConfig(configWithEmptyTools);
    
    // Verify that createFilteredToolRegistry was called with empty array
    const createFilteredToolRegistry = jest.requireMock('../tools').createFilteredToolRegistry;
    expect(createFilteredToolRegistry).toHaveBeenCalledWith(
      configWithEmptyTools.availableTools,
      configWithEmptyTools.name
    );
    
    // Verify that the toolRegistry was passed to createModelClient
    const createModelClient = jest.requireMock('../../../core/ModelClient').createModelClient;
    expect(createModelClient).toHaveBeenCalledWith(
      expect.objectContaining({
        toolRegistry: expect.any(Object)
      })
    );
  });
});