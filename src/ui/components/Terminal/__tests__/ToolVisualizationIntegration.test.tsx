import React from 'react';
import { render, screen } from '@testing-library/react';
import { Terminal } from '../Terminal';
import { vi } from 'vitest';
import { useToolStream } from '@/hooks/useToolStream';

// Mock the hooks
vi.mock('@/hooks/useToolStream', () => ({
  useToolStream: vi.fn()
}));

// Mock the contexts
const mockJoinSession = vi.fn();
const mockLeaveSession = vi.fn();

vi.mock('@/context/TerminalContext', () => ({
  useTerminal: () => ({
    state: {
      messages: [],
      theme: {
        fontFamily: 'monospace',
        fontSize: 'md',
        colorScheme: 'dark',
      },
      isProcessing: false,
    },
    typingIndicator: false,
    currentToolExecution: null,
    joinSession: mockJoinSession,
    leaveSession: mockLeaveSession,
  }),
  TerminalProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({
    theme: 'dark',
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

// Create a wrapper for the component with providers
const renderTerminal = (props: any) => {
  return render(<Terminal {...props} />);
};

describe('Terminal Tool Visualization Integration', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Default mock implementation
    (useToolStream as jest.Mock).mockReturnValue({
      getActiveTools: () => [],
      getRecentTools: () => [],
      hasActiveTools: false,
      activeToolCount: 0,
      toolHistory: []
    });
  });
  
  it('shows active tools when available', () => {
    // Setup the mock
    const mockActiveTools = [{
      id: 'tool-1',
      tool: 'GlobTool',
      toolName: 'GlobTool',
      status: 'running' as const,
      args: { pattern: '**/*.ts' },
      paramSummary: 'pattern: **/*.ts',
      startTime: Date.now(),
    }];
    
    (useToolStream as jest.Mock).mockReturnValue({
      getActiveTools: () => mockActiveTools,
      getRecentTools: () => [],
      hasActiveTools: true,
      activeToolCount: 1,
      toolHistory: mockActiveTools
    });
    
    renderTerminal({
      showToolVisualizations: true,
      sessionId: "test-session"
    });
    
    // Check that tools are passed to MessageFeed
    expect(useToolStream).toHaveBeenCalledWith("test-session");
  });
  
  it('shows recent tools when no active tools', () => {
    // Setup the mock
    const mockRecentTools = [{
      id: 'tool-2',
      tool: 'FileReadTool',
      toolName: 'FileReadTool',
      status: 'completed' as const,
      args: { file_path: '/path/to/file.txt' },
      paramSummary: '/path/to/file.txt',
      result: 'file contents...',
      startTime: Date.now() - 1000,
      endTime: Date.now(),
      executionTime: 1000,
    }];
    
    (useToolStream as jest.Mock).mockReturnValue({
      getActiveTools: () => [],
      getRecentTools: () => mockRecentTools,
      hasActiveTools: false,
      activeToolCount: 0,
      toolHistory: mockRecentTools
    });
    
    renderTerminal({
      showToolVisualizations: true,
      sessionId: "test-session"
    });
    
    // Check that the hook was called with the correct sessionId
    expect(useToolStream).toHaveBeenCalledWith("test-session");
  });
  
  it('hides tool visualizations when disabled', () => {
    // Setup the mock with active tools
    const mockActiveTools = [{
      id: 'tool-1',
      tool: 'GlobTool',
      toolName: 'GlobTool',
      status: 'running' as const,
      args: { pattern: '**/*.ts' },
      paramSummary: 'pattern: **/*.ts',
      startTime: Date.now(),
    }];
    
    (useToolStream as jest.Mock).mockReturnValue({
      getActiveTools: () => mockActiveTools,
      getRecentTools: () => [],
      hasActiveTools: true,
      activeToolCount: 1,
      toolHistory: mockActiveTools
    });
    
    renderTerminal({
      showToolVisualizations: false,
      sessionId: "test-session"
    });
    
    // The hook should still be called
    expect(useToolStream).toHaveBeenCalledWith("test-session");
  });

  it('joins and leaves WebSocket session when mounting/unmounting', () => {
    const sessionId = "test-session-websocket";
    
    const { unmount } = renderTerminal({
      showToolVisualizations: true,
      sessionId: sessionId
    });
    
    // Check that joinSession was called with the sessionId
    expect(mockJoinSession).toHaveBeenCalledWith(sessionId);
    
    // Unmount the component
    unmount();
    
    // Check that leaveSession was called
    expect(mockLeaveSession).toHaveBeenCalled();
  });
});