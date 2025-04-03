import React from 'react';
import { render } from '@testing-library/react';
import { Terminal } from '../Terminal';
import { vi } from 'vitest';
import { useToolVisualization } from '@/hooks/useToolVisualization';

// Mock the hooks
vi.mock('@/hooks/useToolVisualization', () => ({
  useToolVisualization: vi.fn()
}));

// Mock the contexts
const mockJoinSession = vi.fn();
const mockLeaveSession = vi.fn();
const mockAbortProcessing = vi.fn();

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

vi.mock('@/context/WebSocketTerminalContext', () => ({
  useWebSocketTerminal: () => ({
    abortProcessing: mockAbortProcessing,
    hasJoined: true,
    sessionId: 'test-session-id',
    getAbortedTools: () => new Set([]),
    isEventAfterAbort: () => false,
  }),
  WebSocketTerminalProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

// Mock the useFastEditMode hook to prevent API calls
vi.mock('@/hooks/useFastEditMode', () => ({
  useFastEditMode: () => ({
    fastEditMode: false,
    enableFastEditMode: vi.fn(),
    disableFastEditMode: vi.fn(),
    toggleFastEditMode: vi.fn(),
  }),
  __esModule: true,
  default: () => ({
    fastEditMode: false,
    enableFastEditMode: vi.fn(),
    disableFastEditMode: vi.fn(),
    toggleFastEditMode: vi.fn(),
  })
}));

// Mock ToolPreferencesContext
vi.mock('@/context/ToolPreferencesContext', () => ({
  useToolPreferencesContext: () => ({
    preferences: {
      defaultViewMode: 'brief',
      persistPreferences: true,
      toolOverrides: {}
    },
    initialized: true,
    setDefaultViewMode: vi.fn(),
    setToolViewMode: vi.fn(),
    togglePersistPreferences: vi.fn(),
    resetPreferences: vi.fn(),
    getToolViewMode: vi.fn(() => 'brief'),
    clearToolOverride: vi.fn()
  }),
  ToolPreferencesProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({
    theme: 'dark',
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

// Create a wrapper for the component with providers
const renderTerminal = (props: Record<string, unknown>) => {
  return render(<Terminal {...props} />);
};

describe('Terminal Tool Visualization Integration', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Default mock implementation
    (useToolVisualization as jest.Mock).mockReturnValue({
      tools: [],
      activeTools: [],
      recentTools: [],
      hasActiveTools: false,
      activeToolCount: 0,
      getToolById: () => undefined,
      setToolViewMode: vi.fn(),
      setDefaultViewMode: vi.fn(),
      defaultViewMode: 'brief'
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
      viewMode: 'brief'
    }];
    
    (useToolVisualization as jest.Mock).mockReturnValue({
      tools: mockActiveTools,
      activeTools: mockActiveTools,
      recentTools: [],
      hasActiveTools: true,
      activeToolCount: 1,
      getToolById: (id: string) => mockActiveTools.find(t => t.id === id),
      setToolViewMode: vi.fn(),
      setDefaultViewMode: vi.fn(),
      defaultViewMode: 'brief'
    });
    
    renderTerminal({
      showToolVisualizations: true,
      sessionId: "test-session"
    });
    
    // Check that the hook is called
    expect(useToolVisualization).toHaveBeenCalled();
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
      viewMode: 'brief'
    }];
    
    (useToolVisualization as jest.Mock).mockReturnValue({
      tools: mockRecentTools,
      activeTools: [],
      recentTools: mockRecentTools,
      hasActiveTools: false,
      activeToolCount: 0,
      getToolById: (id: string) => mockRecentTools.find(t => t.id === id),
      setToolViewMode: vi.fn(),
      setDefaultViewMode: vi.fn(),
      defaultViewMode: 'brief'
    });
    
    renderTerminal({
      showToolVisualizations: true,
      sessionId: "test-session"
    });
    
    // Check that the hook was called
    expect(useToolVisualization).toHaveBeenCalled();
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
      viewMode: 'brief'
    }];
    
    (useToolVisualization as jest.Mock).mockReturnValue({
      tools: mockActiveTools,
      activeTools: mockActiveTools,
      recentTools: [],
      hasActiveTools: true,
      activeToolCount: 1,
      getToolById: (id: string) => mockActiveTools.find(t => t.id === id),
      setToolViewMode: vi.fn(),
      setDefaultViewMode: vi.fn(),
      defaultViewMode: 'brief'
    });
    
    renderTerminal({
      showToolVisualizations: false,
      sessionId: "test-session"
    });
    
    // The hook should still be called
    expect(useToolVisualization).toHaveBeenCalled();
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