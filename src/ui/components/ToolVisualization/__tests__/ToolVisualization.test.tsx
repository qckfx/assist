import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { ToolVisualization } from '../ToolVisualization';

describe('ToolVisualization', () => {
  const mockRunningTool = {
    id: 'tool-1',
    tool: 'GlobTool',
    toolName: 'GlobTool',
    status: 'running' as const,
    args: { pattern: '**/*.ts' },
    paramSummary: 'pattern: **/*.ts',
    startTime: Date.now(),
  };
  
  const mockCompletedTool = {
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
  };
  
  const mockErrorTool = {
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
  };
  
  it('renders running tool correctly', () => {
    render(<ToolVisualization tool={mockRunningTool} />);
    
    expect(screen.getByText('GlobTool')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('pattern: **/*.ts')).toBeInTheDocument();
    expect(screen.getByText('In progress...')).toBeInTheDocument();
  });
  
  it('renders completed tool correctly', () => {
    render(<ToolVisualization tool={mockCompletedTool} />);
    
    expect(screen.getByText('BashTool')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('command: ls -la')).toBeInTheDocument();
    expect(screen.getByText('1.00s')).toBeInTheDocument();
  });
  
  it('renders error tool correctly', () => {
    render(<ToolVisualization tool={mockErrorTool} />);
    
    expect(screen.getByText('FileReadTool')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('/path/to/file.txt')).toBeInTheDocument();
    expect(screen.getByText('File not found')).toBeInTheDocument();
  });
  
  it('toggles expanded parameters when clicked', () => {
    const toggleMock = vi.fn();
    render(
      <ToolVisualization 
        tool={mockCompletedTool} 
        onToggleExpand={toggleMock} 
      />
    );
    
    fireEvent.click(screen.getByText('command: ls -la'));
    expect(toggleMock).toHaveBeenCalledTimes(1);
  });
  
  it('renders compact version correctly', () => {
    render(<ToolVisualization tool={mockCompletedTool} compact />);
    
    expect(screen.getByText('BashTool')).toBeInTheDocument();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });
});