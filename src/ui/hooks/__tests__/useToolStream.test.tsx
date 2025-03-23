/**
 * Tests for useToolStream hook
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { WebSocketContext } from '../../context/WebSocketContext';
import { WebSocketEvent, ConnectionStatus } from '../../types/api';
import { useToolStream } from '../useToolStream';

// Mock the context value
const mockOn = vi.fn();
const mockOff = vi.fn();

const mockContextValue = {
  isConnected: true,
  connectionStatus: ConnectionStatus.CONNECTED,
  reconnectAttempts: 0,
  currentSessionId: 'test-session-1',
  joinSession: vi.fn(),
  leaveSession: vi.fn(),
  reconnect: vi.fn(),
  on: mockOn,
  off: mockOff,
  onBatch: vi.fn(),
  offBatch: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  socket: {} as any,
};

// Mock context wrapper
function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <WebSocketContext.Provider value={mockContextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}

describe('useToolStream', () => {
  let subscribedEvents: Record<string, (data: any) => void> = {};
  
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    subscribedEvents = {};
    
    // Set up the on/off mocks to track subscribed callbacks
    mockOn.mockImplementation((event, callback) => {
      subscribedEvents[event] = callback;
      return () => {
        delete subscribedEvents[event];
        mockOff(event, callback);
      };
    });
  });
  
  it('should handle individual tool executions', () => {
    // Render the hook
    const { result } = renderHook(() => useToolStream('test-session'), { wrapper });
    
    // Verify initial state
    expect(result.current.state.results).toEqual({});
    expect(result.current.state.activeTools).toEqual({});
    expect(result.current.state.latestExecution).toBeNull();
    
    // Simulate a tool execution event
    act(() => {
      subscribedEvents[WebSocketEvent.TOOL_EXECUTION]({
        sessionId: 'test-session',
        tool: { id: 'TestTool-1', name: 'TestTool' },
        result: 'Tool result 1',
      });
    });
    
    // Verify state updates
    expect(result.current.state.results['TestTool-1']).toBe('Tool result 1');
    expect(result.current.state.activeTools['TestTool-1']).toBe(true);
    expect(result.current.state.latestExecution).not.toBeNull();
    
    // Verify tool history
    expect(result.current.getToolHistory('TestTool-1').length).toBe(1);
  });
  
  it('should handle batched tool executions', () => {
    // Render the hook
    const { result } = renderHook(() => useToolStream('test-session'), { wrapper });
    
    // Simulate a batched tool execution event
    act(() => {
      subscribedEvents[WebSocketEvent.TOOL_EXECUTION_BATCH]({
        toolId: 'TestTool-2',
        results: [
          {
            sessionId: 'test-session',
            tool: { id: 'TestTool-2', name: 'TestTool' },
            result: 'Batch result 1',
          },
          {
            sessionId: 'test-session',
            tool: { id: 'TestTool-2', name: 'TestTool' },
            result: 'Batch result 2',
          },
        ],
        isBatched: true,
        batchSize: 2,
      });
    });
    
    // Verify state has the latest result
    expect(result.current.state.results['TestTool-2']).toBe('Batch result 2');
    expect(result.current.state.activeTools['TestTool-2']).toBe(true);
    
    // Verify tool history has both results
    expect(result.current.getToolHistory('TestTool-2').length).toBe(2);
  });
  
  it('should mark tools as inactive when processing completes', () => {
    // Render the hook
    const { result } = renderHook(() => useToolStream('test-session'), { wrapper });
    
    // Simulate a tool execution
    act(() => {
      subscribedEvents[WebSocketEvent.TOOL_EXECUTION]({
        sessionId: 'test-session',
        tool: { id: 'TestTool-3', name: 'TestTool' },
        result: 'Tool result',
      });
    });
    
    // Verify tool is active
    expect(result.current.state.activeTools['TestTool-3']).toBe(true);
    
    // Simulate processing completed
    act(() => {
      subscribedEvents[WebSocketEvent.PROCESSING_COMPLETED]({
        sessionId: 'test-session',
        result: {},
      });
    });
    
    // Verify tool is now inactive
    expect(result.current.state.activeTools['TestTool-3']).toBe(false);
  });
  
  it('should handle high-frequency tools with throttling', () => {
    vi.useFakeTimers();
    
    // Render the hook
    const { result } = renderHook(() => useToolStream('test-session'), { wrapper });
    
    // Simulate multiple rapid tool executions from a high-frequency tool
    act(() => {
      // Emit several events quickly
      for (let i = 0; i < 5; i++) {
        subscribedEvents[WebSocketEvent.TOOL_EXECUTION]({
          sessionId: 'test-session',
          tool: { id: 'GrepTool-1', name: 'GrepTool' },
          result: `Grep result ${i}`,
        });
      }
    });
    
    // First event should update immediately
    expect(result.current.state.results['GrepTool-1']).toBe('Grep result 0');
    
    // Advance timers to allow throttled updates
    act(() => {
      vi.advanceTimersByTime(200);
    });
    
    // Should now have all events in history but only latest in results
    expect(result.current.getToolHistory('GrepTool-1').length).toBe(5);
    
    vi.useRealTimers();
  });
  
  it('should clear results and tool history', () => {
    // Render the hook
    const { result } = renderHook(() => useToolStream('test-session'), { wrapper });
    
    // Simulate a tool execution
    act(() => {
      subscribedEvents[WebSocketEvent.TOOL_EXECUTION]({
        sessionId: 'test-session',
        tool: { id: 'TestTool-4', name: 'TestTool' },
        result: 'Tool result',
      });
    });
    
    // Verify we have results
    expect(result.current.state.results['TestTool-4']).toBe('Tool result');
    expect(result.current.getToolHistory('TestTool-4').length).toBe(1);
    
    // Clear results
    act(() => {
      result.current.clearResults();
    });
    
    // Verify everything is cleared
    expect(result.current.state.results).toEqual({});
    expect(result.current.state.activeTools).toEqual({});
    expect(result.current.state.latestExecution).toBeNull();
    expect(result.current.getToolHistory('TestTool-4').length).toBe(0);
  });
});