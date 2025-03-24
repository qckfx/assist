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
    
    // Get a consistent timestamp for both events
    const startTimestamp = new Date().toISOString();
    
    // Simulate a tool execution started event
    act(() => {
      subscribedEvents[WebSocketEvent.TOOL_EXECUTION_STARTED]({
        sessionId: 'test-session',
        tool: { id: 'TestTool-1', name: 'TestTool' },
        args: { key: 'value' },
        paramSummary: 'Key: value',
        timestamp: startTimestamp,
      });
    });
    
    // Simulate a tool execution completed event with the same timestamp
    act(() => {
      subscribedEvents[WebSocketEvent.TOOL_EXECUTION_COMPLETED]({
        sessionId: 'test-session',
        tool: { id: 'TestTool-1', name: 'TestTool' },
        result: 'Tool result 1',
        paramSummary: 'Key: value',
        executionTime: 100,
        timestamp: new Date().toISOString(),
        startTime: startTimestamp, // Link to the start event
      });
    });
    
    // Verify state updates
    expect(result.current.state.results['TestTool-1']).toBe('Tool result 1');
    
    // The tool history is now stored in toolHistory array
    expect(result.current.state.toolHistory.length).toBe(1);
    expect(result.current.state.toolHistory[0].tool).toBe('TestTool-1');
    expect(result.current.state.toolHistory[0].result).toBe('Tool result 1');
    
    // Legacy getToolHistory method returns an empty array now because we've deprecated it
    expect(result.current.getToolHistory('TestTool-1')).toEqual([]);
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
    
    // Simulate a tool execution started event
    act(() => {
      subscribedEvents[WebSocketEvent.TOOL_EXECUTION_STARTED]({
        sessionId: 'test-session',
        tool: { id: 'TestTool-3', name: 'TestTool' },
        args: { key: 'value' },
        paramSummary: 'Key: value',
        timestamp: new Date().toISOString(),
      });
    });
    
    // Verify tool is active
    expect(result.current.hasActiveTools).toBe(true);
    expect(result.current.state.activeToolCount).toBe(1);
    
    // Simulate processing completed
    act(() => {
      subscribedEvents[WebSocketEvent.PROCESSING_COMPLETED]({
        sessionId: 'test-session',
        result: {},
      });
    });
    
    // Verify tool is now inactive
    expect(result.current.hasActiveTools).toBe(false);
    expect(result.current.state.activeToolCount).toBe(0);
  });
  
  it('should handle high-frequency tools with throttling', () => {
    vi.useFakeTimers();
    
    // Render the hook
    const { result } = renderHook(() => useToolStream('test-session'), { wrapper });
    
    // Simulate multiple rapid tool executions from a high-frequency tool using the new events
    act(() => {
      // Start a tool execution
      subscribedEvents[WebSocketEvent.TOOL_EXECUTION_STARTED]({
        sessionId: 'test-session',
        tool: { id: 'GrepTool-1', name: 'GrepTool' },
        args: { pattern: 'test' },
        paramSummary: 'pattern: test',
        timestamp: new Date().toISOString(),
      });
      
      // Then complete it several times quickly (simulating batch updates)
      for (let i = 0; i < 5; i++) {
        subscribedEvents[WebSocketEvent.TOOL_EXECUTION_COMPLETED]({
          sessionId: 'test-session',
          tool: { id: 'GrepTool-1', name: 'GrepTool' },
          result: `Grep result ${i}`,
          paramSummary: 'pattern: test',
          executionTime: 10,
          timestamp: new Date().toISOString(),
        });
      }
    });
    
    // Advance timers to allow throttled updates
    act(() => {
      vi.advanceTimersByTime(200);
    });
    
    // Check that it tracked the executions
    expect(result.current.state.toolHistory.length).toBeGreaterThan(0);
    
    vi.useRealTimers();
  });
  
  it('should clear results and tool history', () => {
    // Render the hook
    const { result } = renderHook(() => useToolStream('test-session'), { wrapper });
    
    // Simulate a tool execution using the new events
    act(() => {
      subscribedEvents[WebSocketEvent.TOOL_EXECUTION_STARTED]({
        sessionId: 'test-session',
        tool: { id: 'TestTool-4', name: 'TestTool' },
        args: { key: 'value' },
        paramSummary: 'Key: value',
        timestamp: new Date().toISOString(),
      });
      
      subscribedEvents[WebSocketEvent.TOOL_EXECUTION_COMPLETED]({
        sessionId: 'test-session',
        tool: { id: 'TestTool-4', name: 'TestTool' },
        result: 'Tool result',
        paramSummary: 'Key: value',
        executionTime: 100,
        timestamp: new Date().toISOString(),
      });
    });
    
    // Verify we have results
    expect(result.current.state.results['TestTool-4']).toBe('Tool result');
    expect(result.current.state.toolHistory.length).toBe(1);
    
    // Clear results
    act(() => {
      result.current.clearResults();
    });
    
    // Verify everything is cleared
    expect(result.current.state.results).toEqual({});
    expect(result.current.state.activeTools).toEqual({});
    expect(result.current.state.latestExecution).toBeNull();
    expect(result.current.getToolHistory('TestTool-4').length).toBe(0);
    expect(result.current.state.toolExecutions).toEqual({});
    expect(result.current.state.toolHistory).toEqual([]);
    expect(result.current.state.activeToolCount).toBe(0);
  });

  // New tests for enhanced visualization functionality
  it('should handle tool execution started events', () => {
    // Render the hook
    const { result } = renderHook(() => useToolStream('test-session'), { wrapper });
    
    // Simulate a tool execution started event
    act(() => {
      subscribedEvents[WebSocketEvent.TOOL_EXECUTION_STARTED]({
        sessionId: 'test-session',
        tool: { id: 'VisualizationTool-1', name: 'VisualizationTool' },
        args: { param1: 'value1' },
        paramSummary: 'param1: value1',
        timestamp: new Date().toISOString(),
      });
    });
    
    // Verify state
    expect(result.current.state.activeToolCount).toBe(1);
    expect(result.current.hasActiveTools).toBe(true);
    expect(result.current.getActiveTools().length).toBe(1);
    expect(result.current.getActiveTools()[0].tool).toBe('VisualizationTool-1');
    expect(result.current.getActiveTools()[0].status).toBe('running');
  });
  
  it('should handle tool execution completed events', () => {
    // Render the hook
    const { result } = renderHook(() => useToolStream('test-session'), { wrapper });
    
    // First, simulate a tool started event
    const startTimestamp = new Date().toISOString();
    act(() => {
      subscribedEvents[WebSocketEvent.TOOL_EXECUTION_STARTED]({
        sessionId: 'test-session',
        tool: { id: 'VisualizationTool-2', name: 'VisualizationTool' },
        args: { param1: 'value1' },
        paramSummary: 'param1: value1',
        timestamp: startTimestamp,
      });
    });
    
    // Then, simulate its completion
    act(() => {
      subscribedEvents[WebSocketEvent.TOOL_EXECUTION_COMPLETED]({
        sessionId: 'test-session',
        tool: { id: 'VisualizationTool-2', name: 'VisualizationTool' },
        result: 'Visualization result',
        paramSummary: 'param1: value1',
        executionTime: 123,
        timestamp: new Date().toISOString(),
        startTime: startTimestamp,
      });
    });
    
    // Verify state
    expect(result.current.state.activeToolCount).toBe(0);
    expect(result.current.hasActiveTools).toBe(false);
    expect(result.current.getActiveTools().length).toBe(0);
    expect(result.current.state.toolHistory.length).toBe(1);
    expect(result.current.state.toolHistory[0].status).toBe('completed');
    expect(result.current.state.toolHistory[0].result).toBe('Visualization result');
    expect(result.current.state.toolHistory[0].executionTime).toBe(123);
  });
  
  it('should handle tool execution error events', () => {
    // Render the hook
    const { result } = renderHook(() => useToolStream('test-session'), { wrapper });
    
    // First, simulate a tool started event
    act(() => {
      subscribedEvents[WebSocketEvent.TOOL_EXECUTION_STARTED]({
        sessionId: 'test-session',
        tool: { id: 'VisualizationTool-3', name: 'VisualizationTool' },
        args: { param1: 'value1' },
        paramSummary: 'param1: value1',
        timestamp: new Date().toISOString(),
      });
    });
    
    // Then, simulate an error
    act(() => {
      subscribedEvents[WebSocketEvent.TOOL_EXECUTION_ERROR]({
        sessionId: 'test-session',
        tool: { id: 'VisualizationTool-3', name: 'VisualizationTool' },
        error: { message: 'Tool execution failed' },
        paramSummary: 'param1: value1',
        timestamp: new Date().toISOString(),
      });
    });
    
    // Verify state
    expect(result.current.state.activeToolCount).toBe(0);
    expect(result.current.hasActiveTools).toBe(false);
    expect(result.current.getActiveTools().length).toBe(0);
    expect(result.current.state.toolHistory.length).toBe(1);
    expect(result.current.state.toolHistory[0].status).toBe('error');
    expect(result.current.state.toolHistory[0].error?.message).toBe('Tool execution failed');
  });
  
  it('should properly update tools on processing completed', () => {
    // Render the hook
    const { result } = renderHook(() => useToolStream('test-session'), { wrapper });
    
    // Simulate multiple tool started events
    act(() => {
      for (let i = 1; i <= 3; i++) {
        subscribedEvents[WebSocketEvent.TOOL_EXECUTION_STARTED]({
          sessionId: 'test-session',
          tool: { id: `Tool-${i}`, name: `Tool ${i}` },
          args: { index: i },
          paramSummary: `Tool ${i} params`,
          timestamp: new Date().toISOString(),
        });
      }
    });
    
    // Verify multiple active tools
    expect(result.current.state.activeToolCount).toBe(3);
    expect(result.current.getActiveTools().length).toBe(3);
    
    // Simulate processing completed
    act(() => {
      subscribedEvents[WebSocketEvent.PROCESSING_COMPLETED]({
        sessionId: 'test-session',
      });
    });
    
    // Verify all tools are now completed
    expect(result.current.state.activeToolCount).toBe(0);
    expect(result.current.getActiveTools().length).toBe(0);
    
    // Verify each tool in toolExecutions has status completed
    const toolExecutions = result.current.state.toolExecutions;
    for (const toolId in toolExecutions) {
      expect(toolExecutions[toolId].status).toBe('completed');
      expect(toolExecutions[toolId].endTime).toBeDefined();
    }
  });
  
  it('should provide recent tools through getRecentTools', () => {
    // Render the hook
    const { result } = renderHook(() => useToolStream('test-session'), { wrapper });
    
    // Simulate multiple tool execution cycles with consistent timestamps
    act(() => {
      for (let i = 1; i <= 10; i++) {
        const startTimestamp = new Date().toISOString();
        
        // Start tool
        subscribedEvents[WebSocketEvent.TOOL_EXECUTION_STARTED]({
          sessionId: 'test-session',
          tool: { id: `RecentTool-${i}`, name: `Recent Tool ${i}` },
          args: { index: i },
          paramSummary: `Tool ${i} params`,
          timestamp: startTimestamp,
        });
        
        // Complete tool
        subscribedEvents[WebSocketEvent.TOOL_EXECUTION_COMPLETED]({
          sessionId: 'test-session',
          tool: { id: `RecentTool-${i}`, name: `Recent Tool ${i}` },
          result: `Result ${i}`,
          paramSummary: `Tool ${i} params`,
          executionTime: i * 10,
          timestamp: new Date().toISOString(),
          startTime: startTimestamp,
        });
      }
    });
    
    // Verify we have 10 tools in history
    expect(result.current.state.toolHistory.length).toBe(10);
    
    // Get all recent tools (default parameter is 1000)
    const recentTools = result.current.getRecentTools();
    
    // Verify we get all 10 tools in reverse chronological order
    expect(recentTools.length).toBe(10);
    expect(recentTools[0].tool).toBe('RecentTool-10');
    expect(recentTools[1].tool).toBe('RecentTool-9');
    
    // Test with a specific limit parameter
    const limitedTools = result.current.getRecentTools(5);
    expect(limitedTools.length).toBe(5);
  });
});