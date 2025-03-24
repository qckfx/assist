/**
 * Tests for useWebSocket hook using React Context
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../useWebSocket';
import { WebSocketProvider, WebSocketContext } from '../../context/WebSocketContext';
import { ConnectionStatus, WebSocketEvent } from '../../types/api';
import React from 'react';

// Mock context values
const mockJoinSession = vi.fn();
const mockLeaveSession = vi.fn();
const mockOn = vi.fn(() => () => {});
const mockOnBatch = vi.fn(() => () => {});
const mockEmit = vi.fn();

// Mock the WebSocketContext for testing
const mockContextValue = {
  connectionStatus: ConnectionStatus.CONNECTED,
  isConnected: true,
  reconnectAttempts: 0,
  currentSessionId: null,
  joinSession: mockJoinSession,
  leaveSession: mockLeaveSession,
  connect: vi.fn(),
  disconnect: vi.fn(),
  reconnect: vi.fn(),
  on: mockOn,
  onBatch: mockOnBatch,
  socket: null,
};

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
  });
  
  it('connects to a session when sessionId is provided', () => {
    const sessionId = 'test-session-' + Date.now();
    
    renderHook(() => useWebSocket(sessionId), {
      wrapper: TestWrapper,
    });
    
    // Verify joinSession was called with the sessionId
    expect(mockJoinSession).toHaveBeenCalledWith(sessionId);
  });
  
  it('provides a subscribe function that calls context.on', () => {
    const { result } = renderHook(() => useWebSocket(), {
      wrapper: TestWrapper,
    });
    
    const callback = vi.fn();
    const event = 'connect' as any;
    
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
    const event = 'connect' as any;
    
    // Call subscribeToBatch
    const unsubscribe = result.current.subscribeToBatch(event, callback);
    
    // Verify onBatch was called
    expect(mockOnBatch).toHaveBeenCalledWith(event, callback);
    expect(typeof unsubscribe).toBe('function');
  });
  
  it('does not call joinSession if already joined with the same sessionId', () => {
    // Create a context value with an existing session
    const sessionId = 'existing-session';
    const customContextValue = {
      ...mockContextValue,
      currentSessionId: sessionId,
    };
    
    // Custom wrapper with the existing session
    const CustomWrapper = ({ children }: { children: React.ReactNode }) => (
      <WebSocketContext.Provider value={customContextValue}>
        {children}
      </WebSocketContext.Provider>
    );
    
    // Render with the same sessionId
    renderHook(() => useWebSocket(sessionId), {
      wrapper: CustomWrapper,
    });
    
    // Verify joinSession was not called again
    expect(mockJoinSession).not.toHaveBeenCalled();
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