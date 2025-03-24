import { createServer, Server as HTTPServer } from 'http';
import { AddressInfo } from 'net';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { WebSocketService, WebSocketEvent } from '../WebSocketService';
import { AgentServiceEvent, getAgentService } from '../AgentService';
import { sessionManager } from '../SessionManager';

// Mock the imports
jest.mock('../AgentService', () => {
  const EventEmitter = require('events');
  // Create a mock agent service class that extends EventEmitter
  const mockAgentService = new EventEmitter();
  
  mockAgentService.getPermissionRequests = jest.fn().mockReturnValue([]);
  mockAgentService.emit = jest.fn();
  
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
  let agentService: any;
  let clientSocket: ClientSocket;
  let port: number;

  beforeAll(() => {
    // Create HTTP server
    httpServer = createServer();
    httpServer.listen(() => {
      port = (httpServer.address() as AddressInfo).port;
    });

    // Initialize the WebSocketService
    webSocketService = WebSocketService.getInstance(httpServer);
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
  
  describe('tool execution event forwarding', () => {
    let mockIo: any;
    
    beforeEach(() => {
      // Create a mock Socket.IO instance
      mockIo = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn()
      };
      
      // Replace the io property with our mock
      (webSocketService as any).io = mockIo;
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
      
      // Emit the event from agentService
      agentService.emit(AgentServiceEvent.TOOL_EXECUTION_STARTED, mockEvent);
      
      // Verify the event was forwarded through the WebSocket
      expect(mockIo.to).toHaveBeenCalledWith('test-session-id');
      expect(mockIo.emit).toHaveBeenCalledWith(
        WebSocketEvent.TOOL_EXECUTION_STARTED,
        mockEvent
      );
    });
    
    it('should forward tool execution completed events', () => {
      const mockEvent = {
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
      
      // Emit the event from agentService
      agentService.emit(AgentServiceEvent.TOOL_EXECUTION_COMPLETED, mockEvent);
      
      // Verify the event was forwarded through the WebSocket
      expect(mockIo.to).toHaveBeenCalledWith('test-session-id');
      expect(mockIo.emit).toHaveBeenCalledWith(
        WebSocketEvent.TOOL_EXECUTION_COMPLETED,
        mockEvent
      );
    });
    
    it('should forward tool execution error events', () => {
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
        timestamp: '2023-01-01T00:00:00.000Z'
      };
      
      // Emit the event from agentService
      agentService.emit(AgentServiceEvent.TOOL_EXECUTION_ERROR, mockEvent);
      
      // Verify the event was forwarded through the WebSocket
      expect(mockIo.to).toHaveBeenCalledWith('test-session-id');
      expect(mockIo.emit).toHaveBeenCalledWith(
        WebSocketEvent.TOOL_EXECUTION_ERROR,
        mockEvent
      );
    });
  });
});