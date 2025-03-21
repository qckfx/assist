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
  
  return {
    AgentServiceEvent: {
      PROCESSING_STARTED: 'processing:started',
      PROCESSING_COMPLETED: 'processing:completed',
      PROCESSING_ERROR: 'processing:error',
      PROCESSING_ABORTED: 'processing:aborted',
      TOOL_EXECUTION: 'tool:execution',
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
      getSession: jest.fn((id) => {
        if (id === 'test-session-id') {
          return mockSession;
        }
        return null;
      }),
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
    // Set up client socket before each test
    clientSocket = ioc(`http://localhost:${port}`);
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up client socket after each test
    clientSocket.disconnect();
  });

  it('should be a singleton', () => {
    const instance1 = WebSocketService.getInstance();
    const instance2 = WebSocketService.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should connect a client socket', (done) => {
    clientSocket.on('connect', () => {
      expect(clientSocket.connected).toBe(true);
      done();
    });
  });

  it('should handle join session events', (done) => {
    const testSessionId = 'test-session-id';

    clientSocket.emit(WebSocketEvent.JOIN_SESSION, testSessionId);

    clientSocket.on(WebSocketEvent.SESSION_UPDATED, (session) => {
      expect(session.id).toBe(testSessionId);
      expect(sessionManager.getSession).toHaveBeenCalledWith(testSessionId);
      done();
    });
  });

  it('should emit error if session not found', (done) => {
    const nonExistentSessionId = 'non-existent-session';
    
    // Force sessionManager to return null for this test
    sessionManager.getSession.mockImplementationOnce(() => null);

    clientSocket.emit(WebSocketEvent.JOIN_SESSION, nonExistentSessionId);

    clientSocket.on(WebSocketEvent.ERROR, (data) => {
      expect(data.message).toContain(nonExistentSessionId);
      expect(data.message).toContain('not found');
      done();
    });
  });

  it('should forward agent events to connected clients', (done) => {
    const testSessionId = 'test-session-id';
    const mockResult = { content: 'Test result' };

    // Join the session
    clientSocket.emit(WebSocketEvent.JOIN_SESSION, testSessionId);

    // Wait for join to complete
    clientSocket.on(WebSocketEvent.SESSION_UPDATED, () => {
      // Now trigger an agent event
      const mockEventData = { sessionId: testSessionId, result: mockResult };
      agentService.emit(AgentServiceEvent.PROCESSING_COMPLETED, mockEventData);

      // Listen for the forwarded event
      clientSocket.on(WebSocketEvent.PROCESSING_COMPLETED, (data) => {
        expect(data.sessionId).toBe(testSessionId);
        expect(data.result).toEqual(mockResult);
        done();
      });
    });
  });
});