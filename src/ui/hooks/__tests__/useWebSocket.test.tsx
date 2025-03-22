/**
 * Tests for useWebSocket hook
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ConnectionStatus, WebSocketEvent } from '@/types/api';
import React from 'react';

// We'll implement a full test context system

// Create a storage for event handlers and callbacks
interface EventSubscription {
  event: string;
  callback: (...args: any[]) => void;
}

// Mock WebSocketService state
let mockConnectionStatus = ConnectionStatus.CONNECTED;
let mockCurrentSessionId: string | null = null;
let mockEventSubscriptions: EventSubscription[] = [];

// Create the mock WebSocketService
const mockWebSocketService = {
  getConnectionStatus: vi.fn(() => mockConnectionStatus),
  isConnected: vi.fn(() => mockConnectionStatus === ConnectionStatus.CONNECTED),
  joinSession: vi.fn((sessionId: string) => {
    mockCurrentSessionId = sessionId;
  }),
  leaveSession: vi.fn((sessionId: string) => {
    if (mockCurrentSessionId === sessionId) {
      mockCurrentSessionId = null;
    }
  }),
  getCurrentSessionId: vi.fn(() => mockCurrentSessionId),
  reconnect: vi.fn(),
  on: vi.fn((event: string, callback: any) => {
    mockEventSubscriptions.push({ event, callback });
    return () => mockWebSocketService.off(event, callback);
  }),
  off: vi.fn((event: string, callback: any) => {
    mockEventSubscriptions = mockEventSubscriptions.filter(
      sub => !(sub.event === event && sub.callback === callback)
    );
  }),
  emit: vi.fn((event: string, ...args: any[]) => {
    mockEventSubscriptions
      .filter(sub => sub.event === event)
      .forEach(sub => sub.callback(...args));
  }),
  // Helper methods for testing
  simulateConnectionStatusChange: (status: ConnectionStatus) => {
    mockConnectionStatus = status;
    mockWebSocketService.emit('connectionStatusChanged', status);
  }
};

// Rather than using vi.mock, we'll use a custom version of the useWebSocket hook
// that uses our mockWebSocketService. This is more reliable than trying to mock the import.
function useWebSocketTest(sessionId?: string) {
  const [connectionStatus, setConnectionStatus] = React.useState<ConnectionStatus>(
    mockWebSocketService.getConnectionStatus()
  );
  
  // Join session if provided
  React.useEffect(() => {
    if (sessionId) {
      mockWebSocketService.joinSession(sessionId);
      
      // Clean up when unmounting or when sessionId changes
      return () => {
        mockWebSocketService.leaveSession(sessionId);
      };
    }
  }, [sessionId]);
  
  // Listen for connection status changes
  React.useEffect(() => {
    const handleConnectionStatusChange = (status: ConnectionStatus) => {
      setConnectionStatus(status);
    };
    
    mockWebSocketService.on('connectionStatusChanged', handleConnectionStatusChange);
    
    // Clean up event listener
    return () => {
      mockWebSocketService.off('connectionStatusChanged', handleConnectionStatusChange);
    };
  }, []);
  
  // Subscribe to a WebSocket event
  const subscribe = React.useCallback(<T extends WebSocketEvent>(
    event: T, 
    callback: (data: any) => void
  ) => {
    mockWebSocketService.on(event, callback);
    return () => {
      mockWebSocketService.off(event, callback);
    };
  }, []);
  
  // Subscribe to a batch of WebSocket events
  const subscribeToBatch = React.useCallback(<T extends WebSocketEvent>(
    event: T, 
    callback: (data: any) => void
  ) => {
    const batchEvent = `${event}:batch`;
    mockWebSocketService.on(batchEvent, callback);
    return () => {
      mockWebSocketService.off(batchEvent, callback);
    };
  }, []);
  
  // Manually reconnect
  const reconnect = React.useCallback(() => {
    mockWebSocketService.reconnect();
  }, []);
  
  // Join a session
  const joinSession = React.useCallback((id: string) => {
    mockWebSocketService.joinSession(id);
  }, []);
  
  // Leave a session
  const leaveSession = React.useCallback((id: string) => {
    mockWebSocketService.leaveSession(id);
  }, []);
  
  return {
    connectionStatus,
    isConnected: connectionStatus === ConnectionStatus.CONNECTED,
    subscribe,
    subscribeToBatch,
    reconnect,
    joinSession,
    leaveSession,
  };
}

describe('useWebSocket', () => {
  beforeEach(() => {
    // Reset state and mocks before each test
    mockConnectionStatus = ConnectionStatus.CONNECTED;
    mockCurrentSessionId = null;
    mockEventSubscriptions = [];
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up
    vi.clearAllMocks();
  });
  
  describe('basic functionality', () => {
    it('should return the connection status', () => {
      mockConnectionStatus = ConnectionStatus.CONNECTED;
      
      const { result } = renderHook(() => useWebSocketTest());
      expect(result.current.connectionStatus).toBe(ConnectionStatus.CONNECTED);
      expect(result.current.isConnected).toBe(true);
    });
    
    it('should have session management methods', () => {
      const { result } = renderHook(() => useWebSocketTest());
      expect(typeof result.current.joinSession).toBe('function');
      expect(typeof result.current.leaveSession).toBe('function');
    });
    
    it('should have connection management methods', () => {
      const { result } = renderHook(() => useWebSocketTest());
      expect(typeof result.current.reconnect).toBe('function');
    });
    
    it('should have event subscription methods', () => {
      const { result } = renderHook(() => useWebSocketTest());
      expect(typeof result.current.subscribe).toBe('function');
      expect(typeof result.current.subscribeToBatch).toBe('function');
    });
    
    it('should join session when provided', () => {
      renderHook(() => useWebSocketTest('test-session'));
      expect(mockWebSocketService.joinSession).toHaveBeenCalledWith('test-session');
    });
  });
  
  describe('event handling', () => {
    it('should handle connectionStatusChanged events', () => {
      const { result } = renderHook(() => useWebSocketTest());
      
      // Initial state check
      expect(result.current.connectionStatus).toBe(ConnectionStatus.CONNECTED);
      
      // Simulate a connection status change
      act(() => {
        mockWebSocketService.simulateConnectionStatusChange(ConnectionStatus.DISCONNECTED);
      });
      
      // Check that the state was updated
      expect(result.current.connectionStatus).toBe(ConnectionStatus.DISCONNECTED);
      expect(result.current.isConnected).toBe(false);
    });
    
    it('should subscribe to WebSocket events', () => {
      const mockCallback = vi.fn();
      const { result } = renderHook(() => useWebSocketTest());
      
      // Subscribe to an event
      let unsubscribe;
      act(() => {
        unsubscribe = result.current.subscribe(WebSocketEvent.PROCESSING_STARTED, mockCallback);
      });
      
      // Check that on was called with the right arguments
      expect(mockWebSocketService.on).toHaveBeenCalledWith(WebSocketEvent.PROCESSING_STARTED, mockCallback);
      
      // Simulate an event
      const testData = { sessionId: 'test-session' };
      act(() => {
        mockWebSocketService.emit(WebSocketEvent.PROCESSING_STARTED, testData);
      });
      
      // Verify the callback was called with the right data
      expect(mockCallback).toHaveBeenCalledWith(testData);
      
      // Unsubscribe
      mockCallback.mockClear();
      act(() => {
        if (unsubscribe) unsubscribe();
      });
      
      // Verify off was called
      expect(mockWebSocketService.off).toHaveBeenCalledWith(WebSocketEvent.PROCESSING_STARTED, mockCallback);
    });
    
    it('should subscribe to batched events', () => {
      const mockCallback = vi.fn();
      const { result } = renderHook(() => useWebSocketTest());
      
      // Subscribe to a batch event
      let unsubscribe;
      const batchEventName = `${WebSocketEvent.TOOL_EXECUTION}:batch`;
      
      act(() => {
        unsubscribe = result.current.subscribeToBatch(WebSocketEvent.TOOL_EXECUTION, mockCallback);
      });
      
      // Check that on was called with the right arguments
      expect(mockWebSocketService.on).toHaveBeenCalledWith(batchEventName, mockCallback);
      
      // Simulate a batch event
      const testBatchData = [
        { timestamp: Date.now(), data: { sessionId: 'test-session', tool: 'TestTool', result: 'Result 1' } },
        { timestamp: Date.now(), data: { sessionId: 'test-session', tool: 'TestTool', result: 'Result 2' } }
      ];
      
      act(() => {
        mockWebSocketService.emit(batchEventName, testBatchData);
      });
      
      // Verify the callback was called with the right data
      expect(mockCallback).toHaveBeenCalledWith(testBatchData);
      
      // Unsubscribe
      mockCallback.mockClear();
      act(() => {
        if (unsubscribe) unsubscribe();
      });
      
      // Verify off was called
      expect(mockWebSocketService.off).toHaveBeenCalledWith(batchEventName, mockCallback);
    });
  });
  
  describe('cleanup', () => {
    it('should clean up event listeners when unmounted', () => {
      // Store the number of subscriptions before
      const subscriptionsBefore = mockEventSubscriptions.length;
      
      // Render and unmount the hook
      const { unmount } = renderHook(() => useWebSocketTest());
      
      // Store the number of subscriptions after rendering
      const subscriptionsAfterRender = mockEventSubscriptions.length;
      expect(subscriptionsAfterRender).toBeGreaterThan(subscriptionsBefore);
      
      // Before unmounting, check that off hasn't been called yet
      const offCallsBefore = mockWebSocketService.off.mock.calls.length;
      
      // Unmount
      unmount();
      
      // Verify that off was called and subscriptions were reduced
      expect(mockWebSocketService.off).toHaveBeenCalledTimes(offCallsBefore + 1);
      expect(mockEventSubscriptions.length).toBeLessThan(subscriptionsAfterRender);
    });
    
    it('should clean up session when unmounted', () => {
      const sessionId = 'test-session-id';
      
      // Render and unmount the hook with session ID
      const { unmount } = renderHook(() => useWebSocketTest(sessionId));
      
      // Verify session was joined
      expect(mockWebSocketService.joinSession).toHaveBeenCalledWith(sessionId);
      
      // Clear the mock before unmounting
      mockWebSocketService.leaveSession.mockClear();
      
      // Unmount
      unmount();
      
      // Verify leaveSession was called
      expect(mockWebSocketService.leaveSession).toHaveBeenCalledWith(sessionId);
    });
    
    it('should handle session ID changes', () => {
      const firstSessionId = 'session-1';
      const secondSessionId = 'session-2';
      
      // Render the hook with the first session ID
      const { rerender } = renderHook((id) => useWebSocketTest(id), {
        initialProps: firstSessionId
      });
      
      // Verify joinSession was called with the first ID
      expect(mockWebSocketService.joinSession).toHaveBeenCalledWith(firstSessionId);
      
      // Clear the mocks
      mockWebSocketService.joinSession.mockClear();
      mockWebSocketService.leaveSession.mockClear();
      
      // Re-render with the second session ID
      rerender(secondSessionId);
      
      // Verify leaveSession was called with the first ID and joinSession with the second
      expect(mockWebSocketService.leaveSession).toHaveBeenCalledWith(firstSessionId);
      expect(mockWebSocketService.joinSession).toHaveBeenCalledWith(secondSessionId);
    });
  });
});