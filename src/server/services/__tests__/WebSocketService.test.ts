import { createServer, Server as HTTPServer } from 'http';
import { AddressInfo } from 'net';
import { Socket as ClientSocket } from 'socket.io-client';
import { WebSocketService, WebSocketEvent } from '../WebSocketService';
import { AgentServiceEvent, getAgentService } from '../AgentService';
import { EventEmitter } from 'events';

// Mock the imports
jest.mock('../AgentService', () => {
  // Create a mock agent service class by extending EventEmitter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockAgentService: any = Object.assign({}, EventEmitter.prototype);
  
  // Add methods
  mockAgentService.getPermissionRequests = jest.fn().mockReturnValue([]);
  
  // Initialize the event emitter
  EventEmitter.call(mockAgentService);
  
  // Add a real EventEmitter implementation for our tests
  mockAgentService.emit = function(event: string, ...args: unknown[]) {
    return EventEmitter.prototype.emit.call(this, event, ...args);
  };
  
  return {
    AgentServiceEvent: {
      PROCESSING_STARTED: 'processing:started',
      PROCESSING_COMPLETED: 'processing:completed',
      PROCESSING_ERROR: 'processing:error',
      PROCESSING_ABORTED: 'processing:aborted',
      TOOL_EXECUTION: 'tool:execution',
      TOOL_EXECUTION_STARTED: 'tool:execution:started',
      TOOL_EXECUTION_COMPLETED: 'tool:execution:completed',
      TOOL_EXECUTION_ERROR: 'tool:execution:error',
      PERMISSION_REQUESTED: 'permission:requested',
      PERMISSION_RESOLVED: 'permission:resolved',
    },
    getAgentService: jest.fn().mockReturnValue(mockAgentService),
  };
});

jest.mock('../SessionManager', () => {
  const mockSession = {
    id: 'test-session-id',
    createdAt: new Date(),
    lastActiveAt: new Date(),
    state: { conversationHistory: [] },
    isProcessing: false,
  };
  
  return {
    sessionManager: {
      getSession: jest.fn(() => mockSession),
      updateSession: jest.fn(),
      createSession: jest.fn(() => mockSession),
    },
  };
});

describe('WebSocketService', () => {
  let httpServer: HTTPServer;
  let webSocketService: WebSocketService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let agentService: any;
  let _clientSocket: ClientSocket;
  let _port: number;
  let mockIo: Record<string, jest.Mock>;

  beforeAll(() => {
    // Create HTTP server
    httpServer = createServer();
    httpServer.listen(() => {
      _port = (httpServer.address() as AddressInfo).port;
    });

    // Create a mock Socket.IO instance
    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      close: jest.fn().mockImplementation((callback) => {
        if (callback) callback();
      })
    };

    // Initialize the WebSocketService
    webSocketService = WebSocketService.getInstance(httpServer);
    
    // Use type assertion here to access private members for testing
    // TypeScript won't allow this normally, but it's a common pattern in testing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (webSocketService as any).io = mockIo;
    
    agentService = getAgentService();
  });

  afterAll(async () => {
    await webSocketService.close();
    httpServer.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should be a singleton', () => {
    const instance1 = WebSocketService.getInstance();
    const instance2 = WebSocketService.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should expose expected methods and properties', () => {
    expect(webSocketService.close).toBeDefined();
    expect(typeof webSocketService.close).toBe('function');
    expect(webSocketService.getPendingPermissions).toBeDefined();
    expect(typeof webSocketService.getPendingPermissions).toBe('function');
  });

  it('should call SessionManager when retrieving permissions', () => {
    webSocketService.getPendingPermissions('test-session-id');
    expect(agentService.getPermissionRequests).toHaveBeenCalledWith('test-session-id');
  });
  
  describe('active tool tracking', () => {
    beforeEach(() => {
      // Set up the event handlers before each test
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (webSocketService as any).setupAgentEventListeners.bind(webSocketService);
      handler();
      
      // Clear any existing active tools
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (webSocketService as any).activeTools = new Map();
    });
    
    it('should track active tools', () => {
      // Initial state should have no active tools
      const initialTools = webSocketService.getActiveTools('test-session-id');
      expect(initialTools).toEqual([]);
      
      // Emit a tool execution started event
      const startEvent = {
        sessionId: 'test-session-id',
        tool: {
          id: 'test-tool-id',
          name: 'TestTool'
        },
        paramSummary: 'param1: value1, param2: value2',
        timestamp: '2023-01-01T00:00:00.000Z'
      };
      agentService.emit(AgentServiceEvent.TOOL_EXECUTION_STARTED, startEvent);
      
      // Check that the tool is now being tracked
      const activeTools = webSocketService.getActiveTools('test-session-id');
      expect(activeTools.length).toBe(1);
      expect(activeTools[0].toolId).toBe('test-tool-id');
      expect(activeTools[0].name).toBe('TestTool');
      expect(activeTools[0].paramSummary).toBe('param1: value1, param2: value2');
      expect(activeTools[0].elapsedTimeMs).toBeGreaterThanOrEqual(0);
      
      // Emit a tool execution completed event
      const completeEvent = {
        sessionId: 'test-session-id',
        tool: {
          id: 'test-tool-id',
          name: 'TestTool'
        },
        result: { value: 'test result' },
        paramSummary: 'param1: value1, param2: value2',
        executionTime: 123,
        timestamp: '2023-01-01T00:00:00.000Z'
      };
      agentService.emit(AgentServiceEvent.TOOL_EXECUTION_COMPLETED, completeEvent);
      
      // Check that the tool is no longer being tracked
      const finalTools = webSocketService.getActiveTools('test-session-id');
      expect(finalTools).toEqual([]);
    });
    
    it('should handle multiple active tools for a session', () => {
      // Emit two tool execution started events
      const startEvent1 = {
        sessionId: 'test-session-id',
        tool: {
          id: 'tool-1',
          name: 'Tool1'
        },
        paramSummary: 'tool 1 params',
        timestamp: '2023-01-01T00:00:00.000Z'
      };
      
      const startEvent2 = {
        sessionId: 'test-session-id',
        tool: {
          id: 'tool-2',
          name: 'Tool2'
        },
        paramSummary: 'tool 2 params',
        timestamp: '2023-01-01T00:00:01.000Z'
      };
      
      agentService.emit(AgentServiceEvent.TOOL_EXECUTION_STARTED, startEvent1);
      agentService.emit(AgentServiceEvent.TOOL_EXECUTION_STARTED, startEvent2);
      
      // Check that both tools are being tracked
      const activeTools = webSocketService.getActiveTools('test-session-id');
      expect(activeTools.length).toBe(2);
      
      // Complete one tool
      const completeEvent = {
        sessionId: 'test-session-id',
        tool: {
          id: 'tool-1',
          name: 'Tool1'
        },
        result: { value: 'test result' },
        paramSummary: 'tool 1 params',
        executionTime: 123,
        timestamp: '2023-01-01T00:00:02.000Z'
      };
      
      agentService.emit(AgentServiceEvent.TOOL_EXECUTION_COMPLETED, completeEvent);
      
      // Check that only one tool remains active
      const remainingTools = webSocketService.getActiveTools('test-session-id');
      expect(remainingTools.length).toBe(1);
      expect(remainingTools[0].toolId).toBe('tool-2');
      
      // Error on the second tool
      const errorEvent = {
        sessionId: 'test-session-id',
        tool: {
          id: 'tool-2',
          name: 'Tool2'
        },
        error: {
          message: 'Test error message',
          stack: 'Error stack trace'
        },
        paramSummary: 'tool 2 params',
        timestamp: '2023-01-01T00:00:03.000Z'
      };
      
      agentService.emit(AgentServiceEvent.TOOL_EXECUTION_ERROR, errorEvent);
      
      // Check that no tools remain active
      const finalTools = webSocketService.getActiveTools('test-session-id');
      expect(finalTools).toEqual([]);
    });
    
    it('should track tools across multiple sessions independently', () => {
      // Start tools in two different sessions
      const session1Event = {
        sessionId: 'session-1',
        tool: {
          id: 'tool-1',
          name: 'Tool1'
        },
        paramSummary: 'session 1 tool params',
        timestamp: '2023-01-01T00:00:00.000Z'
      };
      
      const session2Event = {
        sessionId: 'session-2',
        tool: {
          id: 'tool-2',
          name: 'Tool2'
        },
        paramSummary: 'session 2 tool params',
        timestamp: '2023-01-01T00:00:01.000Z'
      };
      
      agentService.emit(AgentServiceEvent.TOOL_EXECUTION_STARTED, session1Event);
      agentService.emit(AgentServiceEvent.TOOL_EXECUTION_STARTED, session2Event);
      
      // Check session 1 tools
      const session1Tools = webSocketService.getActiveTools('session-1');
      expect(session1Tools.length).toBe(1);
      expect(session1Tools[0].toolId).toBe('tool-1');
      
      // Check session 2 tools
      const session2Tools = webSocketService.getActiveTools('session-2');
      expect(session2Tools.length).toBe(1);
      expect(session2Tools[0].toolId).toBe('tool-2');
      
      // Complete the tool in session 1
      const completeEvent = {
        sessionId: 'session-1',
        tool: {
          id: 'tool-1',
          name: 'Tool1'
        },
        result: { value: 'test result' },
        paramSummary: 'session 1 tool params',
        executionTime: 123,
        timestamp: '2023-01-01T00:00:02.000Z'
      };
      
      agentService.emit(AgentServiceEvent.TOOL_EXECUTION_COMPLETED, completeEvent);
      
      // Session 1 should have no active tools now
      expect(webSocketService.getActiveTools('session-1')).toEqual([]);
      
      // Session 2 should still have its active tool
      expect(webSocketService.getActiveTools('session-2').length).toBe(1);
    });
  });
  
  describe('tool execution event forwarding', () => {
    beforeEach(() => {
      // Reset mocks before each test
      mockIo.to.mockClear();
      mockIo.emit.mockClear();
    });
    
    it('should forward tool execution started events', () => {
      const mockEvent = {
        sessionId: 'test-session-id',
        tool: {
          id: 'test-tool-id',
          name: 'TestTool'
        },
        paramSummary: 'param1: value1, param2: value2',
        timestamp: '2023-01-01T00:00:00.000Z'
      };
      
      // Emit the event from agentService - we need to manually call the event handler
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (webSocketService as any).setupAgentEventListeners.bind(webSocketService);
      handler();
      
      // Now trigger the event
      agentService.emit(AgentServiceEvent.TOOL_EXECUTION_STARTED, mockEvent);
      
      // Verify the event was forwarded through the WebSocket
      expect(mockIo.to).toHaveBeenCalledWith('test-session-id');
      expect(mockIo.emit).toHaveBeenCalledWith(
        WebSocketEvent.TOOL_EXECUTION_STARTED, 
        expect.objectContaining({
          sessionId: 'test-session-id',
          tool: {
            id: 'test-tool-id',
            name: 'TestTool'
          },
          paramSummary: 'param1: value1, param2: value2',
          timestamp: '2023-01-01T00:00:00.000Z',
          isActive: true
        })
      );
    });
    
    it('should forward tool execution completed events', () => {
      // Set up the handler
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (webSocketService as any).setupAgentEventListeners.bind(webSocketService);
      handler();
      
      // First start a tool to populate the active tools map
      const startEvent = {
        sessionId: 'test-session-id',
        tool: {
          id: 'test-tool-id',
          name: 'TestTool'
        },
        paramSummary: 'param1: value1, param2: value2',
        timestamp: '2023-01-01T00:00:00.000Z'
      };
      agentService.emit(AgentServiceEvent.TOOL_EXECUTION_STARTED, startEvent);
      
      // Reset the mock for the next test
      mockIo.emit.mockClear();
      mockIo.to.mockClear();
      
      const mockEvent = {
        sessionId: 'test-session-id',
        tool: {
          id: 'test-tool-id',
          name: 'TestTool'
        },
        result: { value: 'test result' },
        paramSummary: 'param1: value1, param2: value2',
        executionTime: 123,
        timestamp: '2023-01-01T00:00:10.000Z'
      };
      
      // Emit the event from agentService
      agentService.emit(AgentServiceEvent.TOOL_EXECUTION_COMPLETED, mockEvent);
      
      // Verify the event was forwarded through the WebSocket
      expect(mockIo.to).toHaveBeenCalledWith('test-session-id');
      expect(mockIo.emit).toHaveBeenCalledWith(
        WebSocketEvent.TOOL_EXECUTION_COMPLETED,
        expect.objectContaining({
          sessionId: 'test-session-id',
          tool: {
            id: 'test-tool-id',
            name: 'TestTool'
          },
          result: { value: 'test result' },
          paramSummary: 'param1: value1, param2: value2',
          executionTime: 123,
          timestamp: '2023-01-01T00:00:10.000Z',
          isActive: false
        })
      );
    });
    
    it('should forward tool execution error events', () => {
      // Set up the handler
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (webSocketService as any).setupAgentEventListeners.bind(webSocketService);
      handler();
      
      // First start a tool to populate the active tools map
      const startEvent = {
        sessionId: 'test-session-id',
        tool: {
          id: 'test-tool-id',
          name: 'TestTool'
        },
        paramSummary: 'param1: value1, param2: value2',
        timestamp: '2023-01-01T00:00:00.000Z'
      };
      agentService.emit(AgentServiceEvent.TOOL_EXECUTION_STARTED, startEvent);
      
      // Reset the mock for the next test
      mockIo.emit.mockClear();
      mockIo.to.mockClear();
      
      const mockEvent = {
        sessionId: 'test-session-id',
        tool: {
          id: 'test-tool-id',
          name: 'TestTool'
        },
        error: {
          message: 'Test error message',
          stack: 'Error stack trace'
        },
        paramSummary: 'param1: value1, param2: value2',
        timestamp: '2023-01-01T00:00:10.000Z'
      };
      
      // Emit the event from agentService
      agentService.emit(AgentServiceEvent.TOOL_EXECUTION_ERROR, mockEvent);
      
      // Verify the event was forwarded through the WebSocket
      expect(mockIo.to).toHaveBeenCalledWith('test-session-id');
      expect(mockIo.emit).toHaveBeenCalledWith(
        WebSocketEvent.TOOL_EXECUTION_ERROR,
        expect.objectContaining({
          sessionId: 'test-session-id',
          tool: {
            id: 'test-tool-id',
            name: 'TestTool'
          },
          error: {
            message: 'Test error message',
            stack: 'Error stack trace'
          },
          paramSummary: 'param1: value1, param2: value2',
          timestamp: '2023-01-01T00:00:10.000Z',
          isActive: false
        })
      );
    });
  });
});