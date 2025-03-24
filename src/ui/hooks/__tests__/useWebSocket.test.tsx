/**
 * Tests for useWebSocket hook using React Context
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWebSocket } from '../useWebSocket';
import { WebSocketProvider } from '../../context/WebSocketContext';
import { ConnectionStatus, WebSocketEvent } from '../../types/api';
import { EventEmitter } from 'events';

// Mock context values
const mockJoinSession = vi.fn();
const mockLeaveSession = vi.fn();
const mockOn = vi.fn(() => () => {});
const mockOnBatch = vi.fn(() => () => {});
const _mockEmit = vi.fn();

// Mock the connection manager
class MockConnectionManager extends EventEmitter {
  joinSession = mockJoinSession;
  leaveSession = mockLeaveSession;
  getCurrentSessionId = vi.fn().mockReturnValue('test-session-id');
  getSessionState = vi.fn().mockReturnValue({
    currentSessionId: 'test-session-id',
    hasJoined: true,
    pendingSession: null
  });
  getStatus = vi.fn().mockReturnValue(ConnectionStatus.CONNECTED);
  getReconnectAttempts = vi.fn().mockReturnValue(0);
  connect = vi.fn();
  disconnect = vi.fn();
  reconnect = vi.fn();
  reset = vi.fn();
  getSocket = vi.fn().mockReturnValue(null);
  isConnected = vi.fn().mockReturnValue(true);
}

const mockConnectionManager = new MockConnectionManager();

// Mock the WebSocketContext for testing
const mockContextValue = {
  connectionStatus: ConnectionStatus.CONNECTED,
  isConnected: true,
  reconnectAttempts: 0,
  reconnect: vi.fn(),
  on: mockOn,
  onBatch: mockOnBatch,
  socket: null,
  currentSessionId: 'test-session-id',
  joinSession: vi.fn(),
  leaveSession: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  offBatch: vi.fn()
};

// Mock WebSocketMessageBufferManager
class MockMessageBufferManager extends EventEmitter {
  start = vi.fn();
  stop = vi.fn();
  add = vi.fn();
  onFlush = vi.fn();
  removeListener = vi.fn();
  removeAllListeners = vi.fn();
  clear = vi.fn();
  getCount = vi.fn().mockReturnValue(0);
  getActiveCategories = vi.fn().mockReturnValue([]);
  isRunning = vi.fn().mockReturnValue(true);
  flushCategory = vi.fn();
}

const mockMessageBufferManager = new MockMessageBufferManager();

// Mock websocket utils to return our mock managers
vi.mock('@/utils/websocket', () => ({
  getSocketConnectionManager: () => mockConnectionManager,
  getWebSocketMessageBufferManager: () => mockMessageBufferManager
}));

// Import WebSocketContext properly
import { WebSocketContext } from '../../context/WebSocketContext';

// Test wrapper with mocked context
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <WebSocketContext.Provider value={mockContextValue}>
    {children}
  </WebSocketContext.Provider>
);

describe('useWebSocket using React Context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  it('returns the expected properties', () => {
    const { result } = renderHook(() => useWebSocket(), {
      wrapper: TestWrapper,
    });
    
    // Verify expected properties
    expect(result.current).toHaveProperty('connectionStatus');
    expect(result.current).toHaveProperty('isConnected');
    expect(result.current).toHaveProperty('subscribe');
    expect(result.current).toHaveProperty('subscribeToBatch');
    expect(result.current).toHaveProperty('joinSession');
    expect(result.current).toHaveProperty('leaveSession');
    expect(result.current).toHaveProperty('reconnect');
    expect(result.current).toHaveProperty('currentSessionId');
  });
  
  it('provides access to the SocketConnectionManager', () => {
    const { result } = renderHook(() => useWebSocket(), {
      wrapper: TestWrapper,
    });
    
    // Test that it's accessing the connection manager
    expect(result.current.currentSessionId).toBe('test-session-id');
    
    // Call join session
    result.current.joinSession('new-session-id');
    expect(mockJoinSession).toHaveBeenCalledWith('new-session-id');
    
    // Call leave session
    result.current.leaveSession('test-session-id');
    expect(mockLeaveSession).toHaveBeenCalledWith('test-session-id');
  });
  
  it('provides a subscribe function that calls context.on', () => {
    const { result } = renderHook(() => useWebSocket(), {
      wrapper: TestWrapper,
    });
    
    const callback = vi.fn();
    const event = 'connect' as WebSocketEvent;
    
    // Call subscribe
    const unsubscribe = result.current.subscribe(event, callback);
    
    // Verify on was called
    expect(mockOn).toHaveBeenCalledWith(event, callback);
    expect(typeof unsubscribe).toBe('function');
  });
  
  it('provides a subscribeToBatch function that calls context.onBatch', () => {
    const { result } = renderHook(() => useWebSocket(), {
      wrapper: TestWrapper,
    });
    
    const callback = vi.fn();
    const event = 'connect' as WebSocketEvent;
    
    // Call subscribeToBatch
    const unsubscribe = result.current.subscribeToBatch(event, callback);
    
    // Verify onBatch was called
    expect(mockOnBatch).toHaveBeenCalledWith(event, callback);
    expect(typeof unsubscribe).toBe('function');
  });
});

// Test with actual provider implementation
describe('useWebSocket with WebSocketProvider', () => {
  it('integrates with the WebSocketProvider', () => {
    const { result } = renderHook(() => useWebSocket(), {
      wrapper: ({ children }) => (
        <WebSocketProvider testMode={true}>
          {children}
        </WebSocketProvider>
      ),
    });
    
    // In test mode, it should be connected
    expect(result.current.isConnected).toBe(true);
    expect(result.current.connectionStatus).toBe(ConnectionStatus.CONNECTED);
  });
});