import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ToolVisualizations } from '../ToolVisualizations';
import { PreviewMode } from '../../../../types/preview';

// Mock the useToolVisualization hook
vi.mock('../../../hooks/useToolVisualization', () => ({
  useToolVisualization: vi.fn(() => ({
    tools: [],
    activeTools: [],
    recentTools: [],
    hasActiveTools: false,
    activeToolCount: 0,
    defaultViewMode: PreviewMode.BRIEF,
    setToolViewMode: vi.fn(),
    setDefaultViewMode: vi.fn(),
    getToolById: vi.fn()
  }))
}));

// Import the hook after mocking
import { useToolVisualization } from '../../../hooks/useToolVisualization';

describe('ToolVisualizations', () => {
  // Reset mocks between tests
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  const mockTools = [
    {
      id: 'tool-1',
      tool: 'GlobTool',
      toolName: 'GlobTool',
      status: 'running' as const,
      args: { pattern: '**/*.ts' },
      paramSummary: 'pattern: **/*.ts',
      startTime: Date.now(),
    },
    {
      id: 'tool-2',
      tool: 'BashTool',
      toolName: 'BashTool',
      status: 'completed' as const,
      args: { command: 'ls -la' },
      paramSummary: 'command: ls -la',
      result: 'file1.txt\nfile2.txt',
      startTime: Date.now() - 1000,
      endTime: Date.now(),
      executionTime: 1000,
    },
    {
      id: 'tool-3',
      tool: 'FileReadTool',
      toolName: 'FileReadTool',
      status: 'error' as const,
      args: { file_path: '/path/to/file.txt' },
      paramSummary: '/path/to/file.txt',
      error: { message: 'File not found' },
      startTime: Date.now() - 500,
      endTime: Date.now(),
      executionTime: 500,
    },
    {
      id: 'tool-4',
      tool: 'GrepTool',
      toolName: 'GrepTool',
      status: 'completed' as const,
      args: { pattern: 'function' },
      paramSummary: 'pattern: function',
      result: '10 matches found',
      startTime: Date.now() - 800,
      endTime: Date.now(),
      executionTime: 800,
    },
  ];
  
  it('renders multiple tools correctly', () => {
    // Update mock to return multiple tools
    const mockDisplayTools = mockTools.slice(0, 3).map(tool => ({
      ...tool,
      viewMode: PreviewMode.BRIEF
    }));
    
    (useToolVisualization as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      tools: mockDisplayTools,
      activeTools: mockDisplayTools.filter(t => t.status === 'running'),
      recentTools: mockDisplayTools.filter(t => t.status !== 'running'),
      hasActiveTools: mockDisplayTools.some(t => t.status === 'running'),
      activeToolCount: mockDisplayTools.filter(t => t.status === 'running').length,
      defaultViewMode: PreviewMode.BRIEF,
      setToolViewMode: vi.fn(),
      setDefaultViewMode: vi.fn(),
      getToolById: (id: string) => mockDisplayTools.find(t => t.id === id)
    });
    
    render(<ToolVisualizations />);
    
    expect(screen.getByText('GlobTool')).toBeInTheDocument();
    expect(screen.getByText('BashTool')).toBeInTheDocument();
    expect(screen.getByText('FileReadTool')).toBeInTheDocument();
  });
  
  it('respects maxVisible limit', () => {
    // Update mock to return all tools
    const mockDisplayTools = mockTools.map(tool => ({
      ...tool,
      viewMode: PreviewMode.BRIEF
    }));
    
    (useToolVisualization as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      tools: mockDisplayTools,
      activeTools: [mockDisplayTools[0]],
      recentTools: mockDisplayTools.slice(1),
      hasActiveTools: true,
      activeToolCount: 1,
      defaultViewMode: PreviewMode.BRIEF,
      setToolViewMode: vi.fn(),
      setDefaultViewMode: vi.fn(),
      getToolById: (id: string) => mockDisplayTools.find(t => t.id === id)
    });
    
    render(<ToolVisualizations maxVisible={2} />);
    
    // First active tool and first recent tool should be visible
    expect(screen.getByText('GlobTool')).toBeInTheDocument();
    expect(screen.getByText('BashTool')).toBeInTheDocument();
    
    // Third tool should be hidden
    expect(screen.queryByText('FileReadTool')).not.toBeInTheDocument();
    
    // Should show hidden count
    expect(screen.getByText('+2 more tool executions')).toBeInTheDocument();
  });
  
  it('shows message when no tools are available', () => {
    // Mock empty tools array
    (useToolVisualization as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      tools: [],
      activeTools: [],
      recentTools: [],
      hasActiveTools: false,
      activeToolCount: 0,
      defaultViewMode: PreviewMode.BRIEF,
      setToolViewMode: vi.fn(),
      setDefaultViewMode: vi.fn(),
      getToolById: () => undefined
    });
    
    render(<ToolVisualizations />);
    
    expect(screen.getByText('No active tools')).toBeInTheDocument();
  });
  
  it('renders compact version correctly', () => {
    // Mock 2 tools
    const mockDisplayTools = mockTools.slice(0, 2).map(tool => ({
      ...tool,
      viewMode: PreviewMode.BRIEF
    }));
    
    (useToolVisualization as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      tools: mockDisplayTools,
      activeTools: mockDisplayTools.filter(t => t.status === 'running'),
      recentTools: mockDisplayTools.filter(t => t.status !== 'running'),
      hasActiveTools: mockDisplayTools.some(t => t.status === 'running'),
      activeToolCount: mockDisplayTools.filter(t => t.status === 'running').length,
      defaultViewMode: PreviewMode.BRIEF,
      setToolViewMode: vi.fn(),
      setDefaultViewMode: vi.fn(),
      getToolById: (id: string) => mockDisplayTools.find(t => t.id === id)
    });
    
    render(<ToolVisualizations compact={true} />);
    
    // Tool names should be visible
    expect(screen.getByText('GlobTool')).toBeInTheDocument();
    expect(screen.getByText('BashTool')).toBeInTheDocument();
    
    // In compact mode, timestamps might not be visible
    const timeElements = screen.queryAllByText(/^\d{1,2}:\d{2}:\d{2}(?: [AP]M)?$/);
    expect(timeElements.length).toBe(0);
  });
  
  it('renders tool parameters properly', () => {
    // Mock one tool
    const mockDisplayTools = mockTools.slice(0, 1).map(tool => ({
      ...tool,
      viewMode: PreviewMode.BRIEF
    }));
    
    (useToolVisualization as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      tools: mockDisplayTools,
      activeTools: mockDisplayTools,
      recentTools: [],
      hasActiveTools: true,
      activeToolCount: 1,
      defaultViewMode: PreviewMode.BRIEF,
      setToolViewMode: vi.fn(),
      setDefaultViewMode: vi.fn(),
      getToolById: (id: string) => mockDisplayTools.find(t => t.id === id)
    });
    
    render(<ToolVisualizations />);
    
    // Parameters should be shown in summary form
    const paramText = screen.getByText('pattern: **/*.ts');
    expect(paramText).toBeInTheDocument();
  });

  it('applies className prop correctly', () => {
    const testClass = 'test-class-name';
    
    // Mock one tool
    const mockDisplayTools = mockTools.slice(0, 1).map(tool => ({
      ...tool,
      viewMode: PreviewMode.BRIEF
    }));
    
    (useToolVisualization as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      tools: mockDisplayTools,
      activeTools: mockDisplayTools,
      recentTools: [],
      hasActiveTools: true,
      activeToolCount: 1,
      defaultViewMode: PreviewMode.BRIEF,
      setToolViewMode: vi.fn(),
      setDefaultViewMode: vi.fn(),
      getToolById: (id: string) => mockDisplayTools.find(t => t.id === id)
    });
    
    const { container } = render(
      <ToolVisualizations className={testClass} />
    );
    
    const toolVisualizationsEl = container.querySelector('.tool-visualizations');
    expect(toolVisualizationsEl).toHaveClass(testClass);
  });

  it('renders tools in correct order (most recent first)', () => {
    // Create mock tools with clearly different timestamps
    const orderedTools = [
      {
        id: 'newest',
        tool: 'New',
        toolName: 'NewestTool',
        status: 'running' as const,
        args: { key: 'value' },
        paramSummary: 'newest tool',
        startTime: Date.now(),
        viewMode: PreviewMode.BRIEF
      },
      {
        id: 'middle',
        tool: 'Mid',
        toolName: 'MiddleTool',
        status: 'completed' as const,
        args: { key: 'value' },
        paramSummary: 'middle tool',
        startTime: Date.now() - 5000,
        endTime: Date.now() - 4000,
        executionTime: 1000,
        viewMode: PreviewMode.BRIEF
      },
      {
        id: 'oldest',
        tool: 'Old',
        toolName: 'OldestTool',
        status: 'completed' as const,
        args: { key: 'value' },
        paramSummary: 'oldest tool',
        startTime: Date.now() - 10000,
        endTime: Date.now() - 9000,
        executionTime: 1000,
        viewMode: PreviewMode.BRIEF
      },
    ];
    
    (useToolVisualization as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      tools: orderedTools,
      activeTools: [orderedTools[0]],
      recentTools: [orderedTools[1], orderedTools[2]],
      hasActiveTools: true,
      activeToolCount: 1,
      defaultViewMode: PreviewMode.BRIEF,
      setToolViewMode: vi.fn(),
      setDefaultViewMode: vi.fn(),
      getToolById: (id: string) => orderedTools.find(t => t.id === id)
    });
    
    render(<ToolVisualizations />);
    
    // Get all tool elements
    const toolElements = screen.getAllByTestId('tool-visualization');
    
    // Check that the tools appear in the expected order in the DOM
    expect(toolElements[0]).toHaveTextContent('NewestTool');
    expect(toolElements[1]).toHaveTextContent('MiddleTool');
    expect(toolElements[2]).toHaveTextContent('OldestTool');
  });

  it('provides correct accessibility attributes', () => {
    // Mock 2 tools
    const mockDisplayTools = mockTools.slice(0, 2).map(tool => ({
      ...tool,
      viewMode: PreviewMode.BRIEF
    }));
    
    (useToolVisualization as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      tools: mockDisplayTools,
      activeTools: mockDisplayTools.filter(t => t.status === 'running'),
      recentTools: mockDisplayTools.filter(t => t.status !== 'running'),
      hasActiveTools: mockDisplayTools.some(t => t.status === 'running'),
      activeToolCount: mockDisplayTools.filter(t => t.status === 'running').length,
      defaultViewMode: PreviewMode.BRIEF,
      setToolViewMode: vi.fn(),
      setDefaultViewMode: vi.fn(),
      getToolById: (id: string) => mockDisplayTools.find(t => t.id === id)
    });
    
    render(<ToolVisualizations />);
    
    // Check for proper ARIA attributes
    const container = screen.getByTestId('tool-visualizations');
    expect(container).toHaveAttribute('aria-label', expect.stringContaining('Tool executions: 2 tools'));
  });
});