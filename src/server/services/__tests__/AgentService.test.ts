/**
 * Agent service tests
 */
import { AgentService, AgentServiceEvent, createAgentService } from '../AgentService';
import { sessionManager } from '../SessionManager';
import { AgentBusyError } from '../../utils/errors';
import { EventEmitter } from 'events';

// Mock dependencies
jest.mock('../../logger', () => ({
  serverLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../SessionManager', () => {
  const originalModule = jest.requireActual('../SessionManager');
  return {
    ...originalModule,
    sessionManager: {
      createSession: jest.fn(),
      getSession: jest.fn(),
      updateSession: jest.fn(),
      deleteSession: jest.fn(),
    },
  };
});

// Mock the agent
jest.mock('../../../index', () => {
  // Create a mock tool registry with callback system
  const mockToolRegistry = {
    getTool: jest.fn().mockReturnValue({ name: 'MockTool' }),
    getToolDescriptions: jest.fn().mockReturnValue([]),
    onToolExecutionStart: jest.fn().mockImplementation(callback => {
      // Store the callback to manually trigger it in tests
      mockToolRegistry._startCallback = callback;
      // Return unregister function
      return jest.fn();
    }),
    onToolExecutionComplete: jest.fn().mockImplementation(callback => {
      // Store the callback to manually trigger it in tests
      mockToolRegistry._completeCallback = callback;
      // Return unregister function
      return jest.fn();
    }),
    onToolExecutionError: jest.fn().mockImplementation(callback => {
      // Store the callback to manually trigger it in tests
      mockToolRegistry._errorCallback = callback;
      // Return unregister function
      return jest.fn();
    }),
    executeToolWithCallbacks: jest.fn().mockImplementation(async (toolId, args, context) => {
      // Simulate the callback process
      if (mockToolRegistry._startCallback) {
        mockToolRegistry._startCallback(toolId, args, context);
      }
      
      // Simulate tool execution
      const result = { result: 'Tool executed successfully' };
      
      // Trigger complete callback
      if (mockToolRegistry._completeCallback) {
        mockToolRegistry._completeCallback(toolId, args, result, 100); // 100ms execution time
      }
      
      return result;
    }),
  };
  
  // Create a mock agent that includes the tool registry
  const mockAgent = {
    processQuery: jest.fn().mockResolvedValue({
      response: 'Mock response',
      sessionState: { conversationHistory: [] },
      result: {
        toolResults: [],
        iterations: 1
      },
      done: true
    }),
    toolRegistry: mockToolRegistry,
  };
  
  return {
    createAgent: jest.fn(() => mockAgent),
    createAnthropicProvider: jest.fn(),
    createLogger: jest.fn(),
    LogLevel: { INFO: 'info' },
    LogCategory: { SYSTEM: 'system' },
  };
});

describe('AgentService', () => {
  let agentService: AgentService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create the agent service
    agentService = createAgentService({
      apiKey: 'mock-api-key',
    });

    // Mock session manager methods
    (sessionManager.createSession as jest.Mock).mockReturnValue({
      id: 'mock-session-id',
      createdAt: new Date(),
      lastActiveAt: new Date(),
      state: { conversationHistory: [] },
      isProcessing: false,
    });

    (sessionManager.getSession as jest.Mock).mockImplementation((sessionId) => {
      if (sessionId === 'mock-session-id') {
        return {
          id: 'mock-session-id',
          createdAt: new Date(),
          lastActiveAt: new Date(),
          state: { conversationHistory: [] },
          isProcessing: false,
        };
      }
      if (sessionId === 'busy-session-id') {
        return {
          id: 'busy-session-id',
          createdAt: new Date(),
          lastActiveAt: new Date(),
          state: { conversationHistory: [] },
          isProcessing: true,
        };
      }
      throw new Error(`Session ${sessionId} not found`);
    });

    (sessionManager.updateSession as jest.Mock).mockImplementation((sessionId, updates) => {
      return {
        id: sessionId,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        state: { conversationHistory: [] },
        isProcessing: updates.isProcessing || false,
        ...updates,
      };
    });
  });

  describe('startSession', () => {
    it('should create a new session', () => {
      const session = agentService.startSession();

      expect(sessionManager.createSession).toHaveBeenCalled();
      expect(session).toHaveProperty('id', 'mock-session-id');
    });
  });

  describe('processQuery', () => {
    it('should process a query successfully', async () => {
      // Set up event listener for testing
      const processingStartedHandler = jest.fn();
      const processingCompletedHandler = jest.fn();
      
      agentService.on(AgentServiceEvent.PROCESSING_STARTED, processingStartedHandler);
      agentService.on(AgentServiceEvent.PROCESSING_COMPLETED, processingCompletedHandler);

      // Process a query
      const result = await agentService.processQuery('mock-session-id', 'Test query');

      // Verify session was updated
      expect(sessionManager.updateSession).toHaveBeenCalledWith('mock-session-id', {
        isProcessing: true,
      });
      expect(sessionManager.updateSession).toHaveBeenCalledWith('mock-session-id', {
        state: { conversationHistory: [] },
        isProcessing: false,
      });

      // Verify events were emitted
      expect(processingStartedHandler).toHaveBeenCalledWith({
        sessionId: 'mock-session-id',
      });
      expect(processingCompletedHandler).toHaveBeenCalledWith({
        sessionId: 'mock-session-id',
        response: 'Mock response',
      });

      // Verify result
      expect(result).toEqual({
        response: 'Mock response',
        toolResults: [],
      });
    });

    it('should throw an error if the session is already processing', async () => {
      // Try to process a query for a busy session
      await expect(agentService.processQuery('busy-session-id', 'Test query')).rejects.toThrow(
        AgentBusyError
      );
    });
  });

  describe('abortOperation', () => {
    it('should abort a processing operation', () => {
      // Mock a processing session
      (sessionManager.getSession as jest.Mock).mockReturnValueOnce({
        id: 'mock-session-id',
        createdAt: new Date(),
        lastActiveAt: new Date(),
        state: { conversationHistory: [] },
        isProcessing: true,
      });

      // Set up event listener for testing
      const abortHandler = jest.fn();
      agentService.on(AgentServiceEvent.PROCESSING_ABORTED, abortHandler);

      // Abort the operation
      const result = agentService.abortOperation('mock-session-id');

      // Verify session was updated
      expect(sessionManager.updateSession).toHaveBeenCalledWith('mock-session-id', {
        isProcessing: false,
      });

      // Verify event was emitted
      expect(abortHandler).toHaveBeenCalledWith({
        sessionId: 'mock-session-id',
      });

      // Verify result
      expect(result).toBe(true);
    });

    it('should return false if the session is not processing', () => {
      // Abort an operation for a non-processing session
      const result = agentService.abortOperation('mock-session-id');

      // Verify result
      expect(result).toBe(false);
    });
  });

  describe('isProcessing', () => {
    it('should return true if the session is processing', () => {
      // Mock a processing session
      (sessionManager.getSession as jest.Mock).mockReturnValueOnce({
        id: 'mock-session-id',
        createdAt: new Date(),
        lastActiveAt: new Date(),
        state: { conversationHistory: [] },
        isProcessing: true,
      });

      // Check if the session is processing
      const result = agentService.isProcessing('mock-session-id');

      // Verify result
      expect(result).toBe(true);
    });

    it('should return false if the session is not processing', () => {
      // Check if the session is processing
      const result = agentService.isProcessing('mock-session-id');

      // Verify result
      expect(result).toBe(false);
    });
  });

  describe('getHistory', () => {
    it('should return the session history', () => {
      // Mock a session with history
      (sessionManager.getSession as jest.Mock).mockReturnValueOnce({
        id: 'mock-session-id',
        createdAt: new Date(),
        lastActiveAt: new Date(),
        state: {
          conversationHistory: [
            { role: 'user', content: [{ type: 'text', text: 'Hello', citations: null }] },
          ],
        },
        isProcessing: false,
      });

      // Get the history
      const history = agentService.getHistory('mock-session-id');

      // Verify result
      expect(history).toEqual([
        { role: 'user', content: [{ type: 'text', text: 'Hello', citations: null }] },
      ]);
    });
  });
  
  describe('permission management', () => {
    it('should create and resolve permission requests', async () => {
      // Set up event listeners
      const permissionRequestedHandler = jest.fn();
      const permissionResolvedHandler = jest.fn();
      
      agentService.on(AgentServiceEvent.PERMISSION_REQUESTED, permissionRequestedHandler);
      agentService.on(AgentServiceEvent.PERMISSION_RESOLVED, permissionResolvedHandler);
      
      // Create a mock permission request by accessing private property (for testing)
      const mockPermissionId = 'test-permission-id';
      const mockRequest = {
        id: mockPermissionId,
        sessionId: 'mock-session-id',
        toolId: 'TestTool',
        args: { arg1: 'value1' },
        timestamp: new Date(),
        resolver: jest.fn(),
      };
      
      (agentService as any).permissionRequests.set(mockPermissionId, mockRequest);
      
      // Get permission requests for the session
      const requests = agentService.getPermissionRequests('mock-session-id');
      
      // Verify requests
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        permissionId: mockPermissionId,
        toolId: 'TestTool',
        args: { arg1: 'value1' },
      });
      
      // Resolve the permission request
      const result = agentService.resolvePermission(mockPermissionId, true);
      
      // Verify result
      expect(result).toBe(true);
      expect(mockRequest.resolver).toHaveBeenCalledWith(true);
      expect(permissionResolvedHandler).toHaveBeenCalledWith(expect.objectContaining({
        permissionId: mockPermissionId,
        sessionId: 'mock-session-id',
        toolId: 'TestTool',
        granted: true,
      }));
      
      // Verify the request was removed
      expect(agentService.getPermissionRequests('mock-session-id')).toHaveLength(0);
    });
    
    it('should return false when resolving a non-existent permission request', () => {
      const result = agentService.resolvePermission('non-existent-id', true);
      
      expect(result).toBe(false);
    });
  });
  
  describe('tool execution', () => {
    it('should emit tool execution events during processing', async () => {
      // Setup event listeners
      const toolExecutionStartedHandler = jest.fn();
      const toolExecutionCompletedHandler = jest.fn();
      const toolExecutionHandler = jest.fn();  // Legacy handler
      
      agentService.on(AgentServiceEvent.TOOL_EXECUTION_STARTED, toolExecutionStartedHandler);
      agentService.on(AgentServiceEvent.TOOL_EXECUTION_COMPLETED, toolExecutionCompletedHandler);
      agentService.on(AgentServiceEvent.TOOL_EXECUTION, toolExecutionHandler);
      
      // Get direct reference to the mock function from the mock system
      const mockExecuteWithCallbacks = require('../../../index').createAgent().toolRegistry.executeToolWithCallbacks;
      
      // Set up the mock to simulate tool execution
      mockExecuteWithCallbacks.mockImplementationOnce(async (toolId, args, context) => {
        const mockToolRegistry = require('../../../index').createAgent().toolRegistry;
        if (mockToolRegistry._startCallback) {
          mockToolRegistry._startCallback(toolId, args, context);
        }
        const result = { result: 'Mock tool result' };
        if (mockToolRegistry._completeCallback) {
          mockToolRegistry._completeCallback(toolId, args, result, 100);
        }
        return result;
      });
      
      // Process a query to trigger the tool execution
      await agentService.processQuery('mock-session-id', 'Test query using tools');
      
      // Verify that the tool execution function was called
      expect(mockExecuteWithCallbacks).toHaveBeenCalled();
      
      // Verify events were emitted in the correct order with the right data
      expect(toolExecutionStartedHandler).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: 'mock-session-id',
        tool: expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
        }),
        paramSummary: expect.any(String),
        timestamp: expect.any(String),
      }));
      
      expect(toolExecutionCompletedHandler).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: 'mock-session-id',
        tool: expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
        }),
        result: expect.any(Object),
        paramSummary: expect.any(String),
        executionTime: expect.any(Number),
        timestamp: expect.any(String),
      }));
      
      // Legacy tool execution event should also be fired
      expect(toolExecutionHandler).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: 'mock-session-id',
        tool: expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
        }),
        result: expect.any(Object),
      }));
    });
    
    it('should emit tool execution error events when tools fail', async () => {
      // Setup error event listener
      const toolExecutionErrorHandler = jest.fn();
      agentService.on(AgentServiceEvent.TOOL_EXECUTION_ERROR, toolExecutionErrorHandler);
      
      // Get direct reference to the mock function
      const mockExecuteWithCallbacks = require('../../../index').createAgent().toolRegistry.executeToolWithCallbacks;
      
      // Make the tool execution fail
      const mockError = new Error('Tool execution failed');
      mockExecuteWithCallbacks.mockImplementationOnce(async (toolId, args, context) => {
        const mockToolRegistry = require('../../../index').createAgent().toolRegistry;
        if (mockToolRegistry._startCallback) {
          mockToolRegistry._startCallback(toolId, args, context);
        }
        if (mockToolRegistry._errorCallback) {
          mockToolRegistry._errorCallback(toolId, args, mockError);
        }
        throw mockError;
      });
      
      // Create another mock to avoid unhandled rejection in the test
      const mockAgent = require('../../../index').createAgent();
      mockAgent.processQuery.mockResolvedValueOnce({
        response: 'Error response',
        sessionState: { conversationHistory: [] },
        error: 'Tool execution failed',
        done: true
      });
      
      // Process a query to trigger the tool execution
      await agentService.processQuery('mock-session-id', 'Test query with failing tool');
      
      // Verify error event was emitted
      expect(toolExecutionErrorHandler).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: 'mock-session-id',
        tool: expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
        }),
        error: expect.objectContaining({
          message: 'Tool execution failed',
        }),
        paramSummary: expect.any(String),
        timestamp: expect.any(String),
      }));
    });
  });
});