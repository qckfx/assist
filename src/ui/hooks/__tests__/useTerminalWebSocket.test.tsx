/**
 * Tests for useTerminalWebSocket hook using React Context
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ConnectionStatus } from '../../types/api';
import React from 'react';

// Create hoisted mocks for terminal functions
const mockAddSystemMessage = vi.fn();
const mockAddUserMessage = vi.fn();
const mockAddAssistantMessage = vi.fn();
const mockAddToolMessage = vi.fn();
const mockAddErrorMessage = vi.fn();
const mockSetProcessing = vi.fn();

// Create hoisted mocks for useWebSocket hook
const mockJoinSession = vi.fn();
const mockLeaveSession = vi.fn();
const mockReconnect = vi.fn();
const mockSubscribe = vi.fn();
const mockSubscribeToBatch = vi.fn();

// Use vi.hoisted for mock function that will be manipulated in tests
const mockUseWebSocketFn = vi.hoisted(() => 
  vi.fn(() => ({
    connectionStatus: ConnectionStatus.CONNECTED,
    isConnected: true,
    joinSession: mockJoinSession,
    leaveSession: mockLeaveSession,
    reconnect: mockReconnect,
    subscribe: mockSubscribe,
    subscribeToBatch: mockSubscribeToBatch
  }))
);

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
      joinSession: mockJoinSession,
      leaveSession: mockLeaveSession,
      reconnect: mockReconnect,
      subscribe: mockSubscribe,
      subscribeToBatch: mockSubscribeToBatch
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('connects to a session when provided a sessionId', () => {
    const sessionId = 'test-session-' + Date.now();
    
    // Render the hook
    renderHook(() => useTerminalWebSocket(sessionId));
    
    // Verify it adds a system message
    expect(mockAddSystemMessage).toHaveBeenCalledWith(
      expect.stringContaining(sessionId)
    );
  });

  it('handles cleanup when unmounted', async () => {
    const sessionId = 'test-session-' + Date.now();
    
    // Render and get unmount function
    const { unmount } = renderHook(() => useTerminalWebSocket(sessionId));
    
    // Clear mocks to focus on cleanup
    vi.clearAllMocks();
    
    // Unmount to trigger cleanup
    unmount();
    
    // Wait for any async cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Verify leaveSession was called
    expect(mockLeaveSession).toHaveBeenCalledWith(sessionId);
    
    // Check that disconnection message was added
    expect(mockAddSystemMessage).toHaveBeenCalledWith(
      expect.stringContaining('Disconnected')
    );
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
      joinSession: mockJoinSession,
      leaveSession: mockLeaveSession,
      reconnect: mockReconnect,
      subscribe: mockSubscribe,
      subscribeToBatch: mockSubscribeToBatch
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
      joinSession: mockJoinSession,
      leaveSession: mockLeaveSession,
      reconnect: mockReconnect,
      subscribe: mockSubscribe,
      subscribeToBatch: mockSubscribeToBatch
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
    const { result } = renderHook(() => useTerminalWebSocket());
    
    expect(typeof result.current.connect).toBe('function');
    expect(typeof result.current.disconnect).toBe('function');
  });
});