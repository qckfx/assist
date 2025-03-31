/**
 * Tests for WebSocketService preview integration
 * Using a more focused unit testing approach
 */

// Import the Server type from http module for proper typing
import { Server as HTTPServer } from 'http';

// Place all jest.mock calls at the top before any imports or variable declarations
// This is critical since these are hoisted to the top at runtime

// Mock the types we need
const mockEventEnum = {
  TOOL_EXECUTION_STARTED: 'tool_execution_started',
  TOOL_EXECUTION_COMPLETED: 'tool_execution_completed',
  TOOL_EXECUTION_ERROR: 'tool_execution_error',
  TOOL_EXECUTION_ABORTED: 'tool_execution_aborted'
};

// Mock dependencies before importing
jest.mock('../../logger', () => ({
  serverLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}));

// Create mock server instance
const mockSocketToEmit = jest.fn();
const mockTo = jest.fn().mockReturnValue({ emit: mockSocketToEmit });
const mockSocketOn = jest.fn();
const mockSocketEmit = jest.fn();

const mockServerInstance = {
  engine: { on: jest.fn() },
  close: jest.fn(cb => setTimeout(cb, 0)),
  on: mockSocketOn,
  to: mockTo,
  emit: mockSocketEmit
};

// Mock Socket.IO - simplified approach
jest.mock('socket.io', () => {
  return {
    Server: jest.fn().mockImplementation(() => mockServerInstance)
  };
});

// Mock the AgentService module
jest.mock('../AgentService', () => ({
  getAgentService: jest.fn(),
  AgentServiceEvent: mockEventEnum
}));

// Mock session manager
jest.mock('../SessionManager', () => ({
  sessionManager: {
    getSession: jest.fn().mockReturnValue({ id: 'test-session', state: {} })
  }
}));

// Mock preview service
jest.mock('../preview', () => {
  // Import PreviewContentType directly to avoid circular dependencies
  const { PreviewContentType } = jest.requireActual('../../../types/preview');
  
  // Create reusable mock data
  const mockTextPreview = {
    contentType: PreviewContentType.TEXT,
    briefContent: 'Test preview content',
    hasFullContent: true,
    metadata: { test: true }
  };

  const mockErrorPreview = {
    contentType: PreviewContentType.ERROR,
    briefContent: 'Test error',
    hasFullContent: true,
    metadata: {
      errorName: 'Error',
      errorType: 'Error',
      stack: 'Error: Test error\n  at ...'
    }
  };

  return {
    previewService: {
      generatePreview: jest.fn().mockResolvedValue(mockTextPreview),
      generateErrorPreview: jest.fn().mockReturnValue(mockErrorPreview)
    }
  };
});

// Import modules after mocks are defined
import { EventEmitter } from 'events';
import { WebSocketEvent } from '../../../types/websocket';
import { PreviewContentType } from '../../../types/preview';
import { WebSocketService } from '../WebSocketService';
import { previewService } from '../preview';

// Create a custom interface for our mocked AgentService
interface MockAgentService extends EventEmitter {
  getToolArgs: jest.Mock;
  getPermissionRequests: jest.Mock;
  getActiveTools: jest.Mock;
}

// After all imports, create and configure mock objects 
describe('WebSocketService Preview Integration', () => {
  let _webSocketService: WebSocketService;
  let mockServer: Record<string, unknown>;
  let mockAgentEventEmitter: MockAgentService;
  const sessionId = 'test-session';
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear mock calls
    mockTo.mockClear();
    mockSocketToEmit.mockClear();
    
    // Create mock agent service with the proper type
    mockAgentEventEmitter = new EventEmitter() as MockAgentService;
    
    // Add necessary methods for WebSocketService to use
    mockAgentEventEmitter.getToolArgs = jest.fn().mockReturnValue({ file_path: '/test/file.txt' });
    mockAgentEventEmitter.getPermissionRequests = jest.fn().mockReturnValue([]);
    mockAgentEventEmitter.getActiveTools = jest.fn().mockReturnValue([]);
    
    // Configure the mock to return our event emitter
    // Use dynamic import instead of require
    jest.requireMock('../AgentService').getAgentService.mockReturnValue(mockAgentEventEmitter);
    
    // Create service instance 
    // Create a minimal mock server
    mockServer = { on: jest.fn() };
    
    // Create a new WebSocketService instance
    // @ts-ignore - We're using a minimal mock that doesn't need all Server properties
    _webSocketService = WebSocketService.create(mockServer as HTTPServer);
    
    // For debugging
    console.log('WebSocketService instance created');
  });
  
  afterEach(() => {
    // Clean up any event listeners to avoid memory leaks
    mockAgentEventEmitter.removeAllListeners();
  });
  
  it('should add preview data to tool execution completed events', async () => {
    // Use the shared mockServerInstance directly
    
    // Setup test data
    const testTool = { id: 'file_read', name: 'File Read' };
    const testResult = { content: 'Test file content' };
    
    // Trigger the tool execution completed event
    mockAgentEventEmitter.emit(mockEventEnum.TOOL_EXECUTION_COMPLETED, {
      sessionId,
      tool: testTool,
      result: testResult,
      paramSummary: 'test parameter summary',
      executionTime: 100,
      timestamp: new Date().toISOString()
    });
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Verify preview service was called with correct args
    expect(previewService.generatePreview).toHaveBeenCalledWith(
      { id: 'file_read', name: 'File Read' },
      { file_path: '/test/file.txt' },
      testResult
    );
    
    // Verify socket emit was called with preview data
    expect(mockServerInstance.to).toHaveBeenCalledWith(sessionId);
    expect(mockServerInstance.to().emit).toHaveBeenCalledWith(
      WebSocketEvent.TOOL_EXECUTION_COMPLETED,
      expect.objectContaining({
        preview: expect.objectContaining({
          contentType: PreviewContentType.TEXT,
          briefContent: 'Test preview content'
        })
      })
    );
  });
  
  it('should add error preview data to tool execution error events', async () => {
    // Use the shared mockServerInstance directly
    
    // Print event listener count for debugging
    console.log(`Event listeners for TOOL_EXECUTION_ERROR: ${mockAgentEventEmitter.listenerCount(mockEventEnum.TOOL_EXECUTION_ERROR)}`);
    
    // Setup test data
    const testTool = { id: 'file_read', name: 'File Read' };
    const testError = {
      name: 'Error',
      message: 'Test error',
      stack: 'Error: Test error\n  at ...'
    };
    
    // Add a direct listener for debugging
    mockAgentEventEmitter.on(mockEventEnum.TOOL_EXECUTION_ERROR, (data) => {
      console.log('Mock event emitter received TOOL_EXECUTION_ERROR event:', data);
    });
    
    console.log('Triggering TOOL_EXECUTION_ERROR event');
    
    // Trigger the tool execution error event
    mockAgentEventEmitter.emit(mockEventEnum.TOOL_EXECUTION_ERROR, {
      sessionId,
      tool: testTool,
      error: testError,
      paramSummary: 'test parameter summary',
      timestamp: new Date().toISOString()
    });
    
    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('Preview service generateErrorPreview call count:', (previewService.generateErrorPreview as jest.Mock).mock.calls.length);
    
    // Verify error preview generator was called
    expect(previewService.generateErrorPreview).toHaveBeenCalledWith(
      { id: 'file_read', name: 'File Read' },
      testError,
      expect.objectContaining({ paramSummary: 'test parameter summary' })
    );
    
    // Verify socket emit was called with error preview data
    expect(mockServerInstance.to).toHaveBeenCalledWith(sessionId);
    expect(mockServerInstance.to().emit).toHaveBeenCalledWith(
      WebSocketEvent.TOOL_EXECUTION_ERROR,
      expect.objectContaining({
        preview: expect.objectContaining({
          contentType: PreviewContentType.ERROR,
          briefContent: 'Test error'
        })
      })
    );
  });
  
  it('should handle errors in preview generation', async () => {
    // Use the shared mockServerInstance directly
    
    // Setup preview service to return null
    (previewService.generatePreview as jest.Mock).mockResolvedValueOnce(null);
    
    // Setup test data
    const testTool = { id: 'file_read', name: 'File Read' };
    const testResult = { content: 'Test file content' };
    
    // Trigger the tool execution completed event
    mockAgentEventEmitter.emit(mockEventEnum.TOOL_EXECUTION_COMPLETED, {
      sessionId,
      tool: testTool,
      result: testResult,
      paramSummary: 'test parameter summary',
      executionTime: 100,
      timestamp: new Date().toISOString()
    });
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Verify socket emit was called without preview data
    expect(mockServerInstance.to).toHaveBeenCalledWith(sessionId);
    expect(mockServerInstance.to().emit).toHaveBeenCalledWith(
      WebSocketEvent.TOOL_EXECUTION_COMPLETED,
      expect.objectContaining({
        preview: null  // Should pass null preview when generation fails
      })
    );
  });
});