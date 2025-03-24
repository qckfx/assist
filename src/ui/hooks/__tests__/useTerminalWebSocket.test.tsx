/**
 * Tests for useTerminalWebSocket hook using React Context
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ConnectionStatus } from '../../types/api';
import { EventEmitter } from 'events';

// Create hoisted mocks for terminal functions
const mockAddSystemMessage = vi.fn();
const mockAddUserMessage = vi.fn();
const mockAddAssistantMessage = vi.fn();
const mockAddToolMessage = vi.fn();
const mockAddErrorMessage = vi.fn();
const mockSetProcessing = vi.fn();

// Create a mock event emitter for the Socket Connection Manager
class MockEventEmitter extends EventEmitter {
  joinSession = vi.fn();
  leaveSession = vi.fn();
  getSessionState = vi.fn().mockReturnValue({
    currentSessionId: 'test-session-id',
    hasJoined: true,
    pendingSession: null
  });
}
const mockConnectionManager = new MockEventEmitter();

// Use vi.hoisted for mock function that will be manipulated in tests
const mockUseWebSocketFn = vi.hoisted(() => 
  vi.fn(() => ({
    connectionStatus: ConnectionStatus.CONNECTED,
    isConnected: true,
    currentSessionId: 'test-session-id'
  }))
);

// Mock websocket utils to return our mock connection manager
vi.mock('@/utils/websocket', () => ({
  getSocketConnectionManager: () => mockConnectionManager
}));

// Mock terminal context
vi.mock('@/context/TerminalContext', () => ({
  useTerminal: () => ({
    addSystemMessage: mockAddSystemMessage,
    addErrorMessage: mockAddErrorMessage,
    addUserMessage: mockAddUserMessage,
    addAssistantMessage: mockAddAssistantMessage,
    addToolMessage: mockAddToolMessage,
    setProcessing: mockSetProcessing,
    state: { isProcessing: false, messages: [], history: [] },
    dispatch: vi.fn(),
    addMessage: vi.fn(),
    clearMessages: vi.fn(),
    addToHistory: vi.fn()
  })
}));

// Mock useWebSocket hook
vi.mock('../useWebSocket', () => ({
  useWebSocket: mockUseWebSocketFn
}));

// Import the hook after mocks are set up
import { useTerminalWebSocket } from '../useTerminalWebSocket';

describe('useTerminalWebSocket using React Context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset the mock to its default behavior before each test
    mockUseWebSocketFn.mockReturnValue({
      connectionStatus: ConnectionStatus.CONNECTED,
      isConnected: true,
      currentSessionId: 'test-session-id'
    });
    
    // Reset session state
    mockConnectionManager.getSessionState.mockReturnValue({
      currentSessionId: null,
      hasJoined: false,
      pendingSession: null
    });
    
    // Remove all event listeners to start fresh
    mockConnectionManager.removeAllListeners();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('requests a session join when provided a sessionId', () => {
    const sessionId = 'test-session-' + Date.now();
    
    // Render the hook
    renderHook(() => useTerminalWebSocket(sessionId));
    
    // Verify it calls joinSession on the connectionManager
    expect(mockConnectionManager.joinSession).toHaveBeenCalledWith(sessionId);
  });

  it('listens for session change events', async () => {
    const sessionId = 'test-session-' + Date.now();
    
    // Render the hook
    renderHook(() => useTerminalWebSocket(sessionId));
    
    // Verify it subscribes to events
    expect(mockConnectionManager.listenerCount('session_change')).toBeGreaterThan(0);
    
    // Emit a session change event
    mockConnectionManager.emit('session_change', sessionId);
    
    // Verify the system message is added
    expect(mockAddSystemMessage).toHaveBeenCalledWith(`Connected to session: ${sessionId}`);
    
    // Now emit a session change event with null (disconnection)
    mockAddSystemMessage.mockClear();
    mockConnectionManager.emit('session_change', null);
    
    // Verify the disconnection message
    expect(mockAddSystemMessage).toHaveBeenCalledWith('Disconnected from session');
  });
  
  it('updates system messages when connection status changes', async () => {
    const sessionId = 'test-session-' + Date.now();
    
    // Render hook with initial connected state
    const { rerender } = renderHook(() => useTerminalWebSocket(sessionId));
    
    // Wait for initial render operations to complete
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Clear message mocks after initial render
    vi.clearAllMocks();
    
    // Change to RECONNECTING
    mockUseWebSocketFn.mockReturnValue({
      connectionStatus: ConnectionStatus.RECONNECTING,
      isConnected: false,
      currentSessionId: sessionId
    });
    
    // Force re-render to trigger effect
    rerender();
    
    // Wait for effects to run
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Verify "Reconnecting" message
    expect(mockAddSystemMessage).toHaveBeenCalledWith(
      expect.stringContaining('Reconnecting')
    );
    
    // Clear message mocks again
    vi.clearAllMocks();
    
    // Change to ERROR
    mockUseWebSocketFn.mockReturnValue({
      connectionStatus: ConnectionStatus.ERROR,
      isConnected: false,
      currentSessionId: sessionId
    });
    
    // Force re-render to trigger effect
    rerender();
    
    // Wait for effects to run
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Verify error message
    expect(mockAddErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('error')
    );
  });
  
  it('provides connect and disconnect functions', () => {
    // Mock session state for this test
    mockConnectionManager.getSessionState.mockReturnValue({
      currentSessionId: 'existing-session',
      hasJoined: true,
      pendingSession: null
    });
    
    const { result } = renderHook(() => useTerminalWebSocket());
    
    expect(typeof result.current.connect).toBe('function');
    expect(typeof result.current.disconnect).toBe('function');
    
    // Test the connect function
    act(() => {
      result.current.connect('new-session');
    });
    
    expect(mockConnectionManager.joinSession).toHaveBeenCalledWith('new-session');
    
    // Test the disconnect function
    vi.clearAllMocks();
    mockConnectionManager.getSessionState.mockReturnValue({
      currentSessionId: 'new-session',
      hasJoined: true,
      pendingSession: null
    });
    
    act(() => {
      result.current.disconnect();
    });
    
    expect(mockConnectionManager.leaveSession).toHaveBeenCalledWith('new-session');
  });
  
  it('provides session state information', () => {
    // Mock session state
    mockConnectionManager.getSessionState.mockReturnValue({
      currentSessionId: 'test-session',
      hasJoined: true,
      pendingSession: null
    });
    
    const { result } = renderHook(() => useTerminalWebSocket('test-session'));
    
    // Should expose the session state from the connection manager
    expect(result.current.sessionId).toBe('test-session');
    expect(result.current.hasJoined).toBe(true);
  });
});