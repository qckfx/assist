/**
 * Tests for WebSocketService preview integration
 * Using a more focused unit testing approach
 */

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

// Mock Socket.IO
jest.mock('socket.io', () => {
  const mockSocketEmit = jest.fn();
  const mockSocketJoin = jest.fn();
  const mockSocketLeave = jest.fn();
  const mockSocketOn = jest.fn();
  const mockSocketToEmit = jest.fn();

  // Mock Socket.IO rooms feature
  const mockTo = jest.fn().mockReturnValue({
    emit: mockSocketToEmit
  });

  // Return the mock Socket.IO constructor
  return {
    Server: jest.fn().mockImplementation(() => ({
      engine: {
        on: jest.fn()
      },
      close: jest.fn(cb => setTimeout(cb, 0)),
      on: mockSocketOn,
      to: mockTo,
      emit: mockSocketEmit
    }))
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
import { PreviewContentType, ToolPreviewData } from '../../../types/preview';
import { WebSocketService } from '../WebSocketService';
import { previewService } from '../preview';
import * as socketIo from 'socket.io';

// Create a custom interface for our mocked AgentService
interface MockAgentService extends EventEmitter {
  getToolArgs: jest.Mock;
  getPermissionRequests: jest.Mock;
  getActiveTools: jest.Mock;
}

// After all imports, create and configure mock objects 
describe('WebSocketService Preview Integration', () => {
  let webSocketService: WebSocketService;
  let mockServer: any;
  let mockAgentEventEmitter: MockAgentService;
  const sessionId = 'test-session';
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock agent service with the proper type
    mockAgentEventEmitter = new EventEmitter() as MockAgentService;
    
    // Add necessary methods for WebSocketService to use
    mockAgentEventEmitter.getToolArgs = jest.fn().mockReturnValue({ file_path: '/test/file.txt' });
    mockAgentEventEmitter.getPermissionRequests = jest.fn().mockReturnValue([]);
    mockAgentEventEmitter.getActiveTools = jest.fn().mockReturnValue([]);
    
    // Configure the mock to return our event emitter
    require('../AgentService').getAgentService.mockReturnValue(mockAgentEventEmitter);
    
    // Create service instance
    mockServer = { on: jest.fn() };
    webSocketService = WebSocketService.getInstance(mockServer as any);
  });
  
  afterEach(() => {
    // Clean up any event listeners to avoid memory leaks
    mockAgentEventEmitter.removeAllListeners();
  });
  
  it('should add preview data to tool execution completed events', async () => {
    // Get Socket.IO instance
    const socketIoInstance = (socketIo.Server as unknown as jest.Mock).mock.results[0].value;
    
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
    expect(socketIoInstance.to).toHaveBeenCalledWith(sessionId);
    expect(socketIoInstance.to().emit).toHaveBeenCalledWith(
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
    // Get Socket.IO instance
    const socketIoInstance = (socketIo.Server as unknown as jest.Mock).mock.results[0].value;
    
    // Setup test data
    const testTool = { id: 'file_read', name: 'File Read' };
    const testError = {
      name: 'Error',
      message: 'Test error',
      stack: 'Error: Test error\n  at ...'
    };
    
    // Trigger the tool execution error event
    mockAgentEventEmitter.emit(mockEventEnum.TOOL_EXECUTION_ERROR, {
      sessionId,
      tool: testTool,
      error: testError,
      paramSummary: 'test parameter summary',
      timestamp: new Date().toISOString()
    });
    
    // Verify error preview generator was called
    expect(previewService.generateErrorPreview).toHaveBeenCalledWith(
      { id: 'file_read', name: 'File Read' },
      testError,
      expect.objectContaining({ paramSummary: 'test parameter summary' })
    );
    
    // Verify socket emit was called with error preview data
    expect(socketIoInstance.to).toHaveBeenCalledWith(sessionId);
    expect(socketIoInstance.to().emit).toHaveBeenCalledWith(
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
    // Get Socket.IO instance
    const socketIoInstance = (socketIo.Server as unknown as jest.Mock).mock.results[0].value;
    
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
    expect(socketIoInstance.to).toHaveBeenCalledWith(sessionId);
    expect(socketIoInstance.to().emit).toHaveBeenCalledWith(
      WebSocketEvent.TOOL_EXECUTION_COMPLETED,
      expect.objectContaining({
        preview: null  // Should pass null preview when generation fails
      })
    );
  });
});