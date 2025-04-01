/**
 * Tests for useToolStream hook
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { WebSocketContext } from '../../context/WebSocketContext';
import { WebSocketEvent, ConnectionStatus } from '../../types/api';
import { useToolStream } from '../useToolStream';
import { PreviewMode } from '../../../types/preview';

// Mock socket for emitting events
const mockEmit = vi.fn();
const mockSocket = {
  connected: true,
  emit: mockEmit
};

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
  socket: mockSocket,
  getSessionId: vi.fn().mockReturnValue('test-session-1'),
  subscribe: mockOn,
  unsubscribe: mockOff,
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
  let subscribedEvents: Record<string, (data: unknown) => void> = {};
  
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
  
  it('should handle tool state updates', () => {
    // Render the hook
    const { result } = renderHook(() => useToolStream(), { wrapper });
    
    // Verify initial state
    expect(result.current.toolHistory).toEqual([]);
    expect(result.current.activeToolCount).toBe(0);
    expect(result.current.hasActiveTools).toBe(false);
    expect(result.current.isInitialized).toBe(false);
    
    // Create a tool state object
    const toolState = {
      id: 'tool-1',
      tool: 'TestTool',
      toolName: 'Test Tool',
      status: 'running',
      args: { param1: 'value1' },
      startTime: Date.now(),
      paramSummary: 'Test tool execution'
    };
    
    // Simulate a tool state update
    act(() => {
      subscribedEvents[WebSocketEvent.TOOL_STATE_UPDATE]({
        sessionId: 'test-session-1',
        tool: toolState
      });
    });
    
    // Verify that the state was updated
    expect(result.current.hasActiveTools).toBe(true);
    expect(result.current.activeToolCount).toBe(1);
    expect(result.current.isInitialized).toBe(true);
    
    // Verify that getActiveTools returns the active tool
    const activeTools = result.current.getActiveTools();
    expect(activeTools).toHaveLength(1);
    expect(activeTools[0].id).toBe('tool-1');
    expect(activeTools[0].status).toBe('running');
    
    // Simulate completing the tool
    act(() => {
      subscribedEvents[WebSocketEvent.TOOL_STATE_UPDATE]({
        sessionId: 'test-session-1',
        tool: {
          ...toolState,
          status: 'completed',
          endTime: Date.now(),
          executionTime: 100,
          result: { success: true }
        }
      });
    });
    
    // Verify that the tool is no longer active
    expect(result.current.hasActiveTools).toBe(false);
    expect(result.current.activeToolCount).toBe(0);
    
    // Verify that getRecentTools returns the completed tool
    const recentTools = result.current.getRecentTools();
    expect(recentTools).toHaveLength(1);
    expect(recentTools[0].id).toBe('tool-1');
    expect(recentTools[0].status).toBe('completed');
  });
  
  it('should handle tool history', () => {
    // Render the hook
    const { result } = renderHook(() => useToolStream(), { wrapper });
    
    // Simulate loading tool history
    const historyTools = [
      {
        id: 'history-1',
        tool: 'HistoryTool1',
        toolName: 'History Tool 1',
        status: 'completed',
        args: { param1: 'value1' },
        startTime: Date.now() - 1000,
        endTime: Date.now() - 900,
        executionTime: 100,
        result: { success: true }
      },
      {
        id: 'history-2',
        tool: 'HistoryTool2',
        toolName: 'History Tool 2',
        status: 'error',
        args: { param1: 'value2' },
        startTime: Date.now() - 2000,
        endTime: Date.now() - 1950,
        executionTime: 50,
        error: { message: 'Test error' }
      }
    ];
    
    act(() => {
      subscribedEvents[WebSocketEvent.TOOL_HISTORY]({
        sessionId: 'test-session-1',
        tools: historyTools
      });
    });
    
    // Verify that the history was loaded
    expect(result.current.isInitialized).toBe(true);
    expect(result.current.toolHistory).toHaveLength(2);
    
    // Verify getRecentTools returns the historical tools
    const recentTools = result.current.getRecentTools();
    expect(recentTools).toHaveLength(2);
    expect(recentTools[0].id).toBe('history-1'); // Most recent first
    expect(recentTools[1].id).toBe('history-2');
  });
  
  it('should clear results', () => {
    // Render the hook
    const { result } = renderHook(() => useToolStream(), { wrapper });
    
    // Add a tool to the state
    act(() => {
      subscribedEvents[WebSocketEvent.TOOL_STATE_UPDATE]({
        sessionId: 'test-session-1',
        tool: {
          id: 'tool-to-clear',
          tool: 'ClearTool',
          toolName: 'Clear Tool',
          status: 'completed',
          args: { param1: 'value1' },
          startTime: Date.now() - 500,
          endTime: Date.now() - 400,
          executionTime: 100,
          result: { success: true }
        }
      });
    });
    
    // Verify tool was added
    expect(result.current.toolHistory).toHaveLength(1);
    
    // Clear results
    act(() => {
      result.current.clearResults();
    });
    
    // Verify state is cleared
    expect(result.current.toolHistory).toHaveLength(0);
    expect(result.current.isInitialized).toBe(false);
  });
  
  it('should update view mode for a tool', () => {
    // Render the hook
    const { result } = renderHook(() => useToolStream(), { wrapper });
    
    // Add a tool with a preview
    act(() => {
      subscribedEvents[WebSocketEvent.TOOL_STATE_UPDATE]({
        sessionId: 'test-session-1',
        tool: {
          id: 'view-mode-tool',
          tool: 'ViewModeTool',
          toolName: 'View Mode Tool',
          status: 'completed',
          args: { param1: 'value1' },
          startTime: Date.now() - 500,
          endTime: Date.now() - 400,
          executionTime: 100,
          result: { success: true },
          preview: {
            contentType: 'text',
            briefContent: 'Brief content',
            fullContent: 'Full content with more details'
          }
        }
      });
    });
    
    // Verify tool uses default view mode
    expect(result.current.defaultViewMode).toBe(PreviewMode.BRIEF);
    
    // Get tool by ID
    const tool = result.current.getToolExecutionById('view-mode-tool');
    expect(tool?.viewMode).toBe(PreviewMode.BRIEF);
    
    // Update view mode for the tool
    act(() => {
      result.current.setToolViewMode('view-mode-tool', PreviewMode.COMPLETE);
    });
    
    // Verify view mode was updated
    const updatedTool = result.current.getToolExecutionById('view-mode-tool');
    expect(updatedTool?.viewMode).toBe(PreviewMode.COMPLETE);
  });
  
  it('should update default view mode', () => {
    // Render the hook
    const { result } = renderHook(() => useToolStream(), { wrapper });
    
    // Verify default view mode
    expect(result.current.defaultViewMode).toBe(PreviewMode.BRIEF);
    
    // Change default view mode
    act(() => {
      result.current.setDefaultViewMode(PreviewMode.COMPLETE);
    });
    
    // Verify default view mode was updated
    expect(result.current.defaultViewMode).toBe(PreviewMode.COMPLETE);
    
    // Add a tool after changing default view mode
    act(() => {
      subscribedEvents[WebSocketEvent.TOOL_STATE_UPDATE]({
        sessionId: 'test-session-1',
        tool: {
          id: 'default-view-tool',
          tool: 'DefaultViewTool',
          toolName: 'Default View Tool',
          status: 'completed',
          args: { param1: 'value1' },
          startTime: Date.now(),
          endTime: Date.now() + 100,
          executionTime: 100,
          result: { success: true },
          preview: {
            contentType: 'text',
            briefContent: 'Brief content'
          }
        }
      });
    });
    
    // Verify new tool uses the updated default view mode
    const tool = result.current.getToolExecutionById('default-view-tool');
    expect(tool?.viewMode).toBe(PreviewMode.COMPLETE);
  });
  
  it('should handle processing completed event', () => {
    // Render the hook
    const { result } = renderHook(() => useToolStream(), { wrapper });
    
    // Add multiple active tools
    act(() => {
      // Add first running tool
      subscribedEvents[WebSocketEvent.TOOL_STATE_UPDATE]({
        sessionId: 'test-session-1',
        tool: {
          id: 'running-tool-1',
          tool: 'RunningTool1',
          toolName: 'Running Tool 1',
          status: 'running',
          args: { param1: 'value1' },
          startTime: Date.now() - 500,
        }
      });
      
      // Add second running tool
      subscribedEvents[WebSocketEvent.TOOL_STATE_UPDATE]({
        sessionId: 'test-session-1',
        tool: {
          id: 'running-tool-2',
          tool: 'RunningTool2',
          toolName: 'Running Tool 2',
          status: 'running',
          args: { param1: 'value2' },
          startTime: Date.now() - 300,
        }
      });
    });
    
    // Verify we have active tools
    expect(result.current.activeToolCount).toBe(2);
    expect(result.current.hasActiveTools).toBe(true);
    
    // Send processing completed event
    act(() => {
      subscribedEvents[WebSocketEvent.PROCESSING_COMPLETED]({
        sessionId: 'test-session-1',
        result: {}
      });
    });
    
    // Verify that all tools are marked as inactive
    expect(result.current.activeToolCount).toBe(0);
    expect(result.current.hasActiveTools).toBe(false);
  });
});