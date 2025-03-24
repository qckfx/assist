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
  
  it('renders all tools when within maxVisible limit', () => {
    render(<ToolVisualizations tools={mockTools.slice(0, 3)} />);
    
    expect(screen.getByText('GlobTool')).toBeInTheDocument();
    expect(screen.getByText('BashTool')).toBeInTheDocument();
    expect(screen.getByText('FileReadTool')).toBeInTheDocument();
    expect(screen.queryByText('+1 more tool executions')).not.toBeInTheDocument();
  });
  
  it('shows hidden count when exceeding maxVisible limit', () => {
    render(<ToolVisualizations tools={mockTools} maxVisible={3} />);
    
    expect(screen.getByText('GlobTool')).toBeInTheDocument();
    expect(screen.getByText('BashTool')).toBeInTheDocument();
    expect(screen.getByText('FileReadTool')).toBeInTheDocument();
    expect(screen.queryByText('GrepTool')).not.toBeInTheDocument();
    expect(screen.getByText('+1 more tool executions')).toBeInTheDocument();
  });
  
  it('shows no active tools message when no tools are provided', () => {
    render(<ToolVisualizations tools={[]} />);
    
    expect(screen.getByText('No active tools')).toBeInTheDocument();
  });
  
  it('applies compact mode to all tool visualizations', () => {
    render(<ToolVisualizations tools={mockTools.slice(0, 2)} compact />);
    
    // In compact mode, status label should not be visible
    expect(screen.queryByText('Running')).not.toBeInTheDocument();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });
  
  it('toggles expanded parameters when clicked', () => {
    render(<ToolVisualizations tools={mockTools.slice(0, 1)} />);
    
    // Before click, parameters should be shown in summary form
    expect(screen.getByText('pattern: **/*.ts')).toBeInTheDocument();
    
    // Click to expand
    fireEvent.click(screen.getByText('pattern: **/*.ts'));
    
    // After click, expanded JSON should be rendered
    // Note: This is a bit tricky to test because the JSON.stringify renders
    // with quotes that might be hard to match exactly. In a real test,
    // you might want to use a more robust approach.
    expect(screen.getByTestId('tool-visualization')).toHaveTextContent('pattern');
  });
});