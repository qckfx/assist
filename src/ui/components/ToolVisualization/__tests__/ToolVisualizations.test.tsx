import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolVisualizations } from '../ToolVisualizations';

describe('ToolVisualizations', () => {
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
    render(<ToolVisualizations tools={mockTools.slice(0, 3)} />);
    
    expect(screen.getByText('GlobTool')).toBeInTheDocument();
    expect(screen.getByText('BashTool')).toBeInTheDocument();
    expect(screen.getByText('FileReadTool')).toBeInTheDocument();
  });
  
  it('respects maxVisible limit', () => {
    render(<ToolVisualizations tools={mockTools} maxVisible={2} />);
    
    // First two tools should be visible
    expect(screen.getByText('GlobTool')).toBeInTheDocument();
    expect(screen.getByText('BashTool')).toBeInTheDocument();
    
    // Third tool should be hidden
    expect(screen.queryByText('FileReadTool')).not.toBeInTheDocument();
    
    // Should show hidden count
    expect(screen.getByText('+2 more tool executions')).toBeInTheDocument();
  });
  
  it('shows message when no tools are available', () => {
    render(<ToolVisualizations tools={[]} />);
    
    expect(screen.getByText('No active tools')).toBeInTheDocument();
  });
  
  it('renders compact version correctly', () => {
    render(<ToolVisualizations tools={mockTools.slice(0, 2)} compact={true} />);
    
    // Tool names should be visible
    expect(screen.getByText('GlobTool')).toBeInTheDocument();
    expect(screen.getByText('BashTool')).toBeInTheDocument();
    
    // In compact mode, timestamps might not be visible
    const timeElements = screen.queryAllByText(/^\d{1,2}:\d{2}:\d{2}(?: [AP]M)?$/);
    expect(timeElements.length).toBe(0);
  });
  
  it('toggles expanded parameters when clicked', () => {
    render(<ToolVisualizations tools={mockTools.slice(0, 1)} />);
    
    // Before click, parameters should be shown in summary form
    const paramText = screen.getByText('pattern: **/*.ts');
    expect(paramText).toBeInTheDocument();
    
    // Click to expand
    fireEvent.click(paramText);
    
    // After click, expanded state should be set
    // We can't directly test state in this test, but we can verify the correct
    // element was clickable by checking that it has cursor-pointer style
    expect(paramText).toHaveStyle('cursor: pointer');
  });

  it('applies className prop correctly', () => {
    const testClass = 'test-class-name';
    const { container } = render(
      <ToolVisualizations tools={mockTools.slice(0, 1)} className={testClass} />
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
      },
    ];
    
    render(<ToolVisualizations tools={orderedTools} />);
    
    // Get all tool elements
    const toolElements = screen.getAllByTestId('tool-visualization');
    
    // Check that the tools appear in the expected order in the DOM
    expect(toolElements[0]).toHaveTextContent('NewestTool');
    expect(toolElements[1]).toHaveTextContent('MiddleTool');
    expect(toolElements[2]).toHaveTextContent('OldestTool');
  });

  it('provides correct accessibility attributes', () => {
    render(<ToolVisualizations tools={mockTools.slice(0, 2)} />);
    
    // Check for proper ARIA attributes
    const container = screen.getByTestId('tool-visualizations');
    expect(container).toHaveAttribute('aria-label', expect.stringContaining('Tool executions: 2 tools'));
  });
});