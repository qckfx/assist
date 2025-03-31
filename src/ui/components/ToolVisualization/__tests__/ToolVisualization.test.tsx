import React from 'react';
import { render, screen } from '@testing-library/react';
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
  
  const mockAwaitingPermissionTool = {
    id: 'tool-3',
    tool: 'BashTool',
    toolName: 'BashTool',
    status: 'awaiting-permission' as const,
    requiresPermission: true,
    permissionId: 'perm-123',
    args: { command: 'ls -la' },
    paramSummary: 'command: ls -la',
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
    const { container } = render(<ToolVisualization tool={mockRunningTool} />);
    
    expect(screen.getByText('GlobTool')).toBeInTheDocument();
    expect(container.querySelector('[data-tool-status="running"]')).toBeInTheDocument();
    expect(screen.getByText('pattern: **/*.ts')).toBeInTheDocument();
  });
  
  it('renders completed tool correctly', () => {
    const { container } = render(<ToolVisualization tool={mockCompletedTool} />);
    
    expect(screen.getByText('BashTool')).toBeInTheDocument();
    expect(container.querySelector('[data-tool-status="completed"]')).toBeInTheDocument();
    expect(screen.getByText('command: ls -la')).toBeInTheDocument();
    
    // Time is now displayed like (1.00s) - look for partial match since it's inside a span
    const timeElement = container.querySelector('.text-gray-500,.text-gray-400');
    expect(timeElement).toBeInTheDocument();
    expect(timeElement?.textContent).toMatch(/1\.00s/);
  });
  
  it('renders error tool correctly', () => {
    const { container } = render(<ToolVisualization tool={mockErrorTool} />);
    
    expect(screen.getByText('FileReadTool')).toBeInTheDocument();
    expect(container.querySelector('[data-tool-status="error"]')).toBeInTheDocument();
    expect(screen.getByText('/path/to/file.txt')).toBeInTheDocument();
    expect(screen.getByText('File not found')).toBeInTheDocument();
  });
  
  it('shows tool description', () => {
    const { getByText } = render(
      <ToolVisualization 
        tool={mockCompletedTool}
      />
    );
    
    // Check description is shown
    expect(getByText('command: ls -la')).toBeInTheDocument();
  });
  
  it('renders with compact property if provided', () => {
    render(<ToolVisualization tool={mockCompletedTool} compact />);
    
    expect(screen.getByText('BashTool')).toBeInTheDocument();
    // Compact version still renders all content but may have modified styling
    const toolVisualization = screen.getByTestId('tool-visualization');
    expect(toolVisualization).toBeInTheDocument();
  });
  
  it('displays permission banner for tools awaiting permission', () => {
    render(<ToolVisualization tool={mockAwaitingPermissionTool} />);
    
    // Check for permission banner
    const banner = screen.getByTestId('permission-banner');
    expect(banner).toBeInTheDocument();
    
    // Check banner content is displayed
    expect(screen.getByText(/Permission Required/)).toBeInTheDocument();
  });
  
  it('does not display permission banner for tools not awaiting permission', () => {
    render(<ToolVisualization tool={mockRunningTool} />);
    expect(screen.queryByTestId('permission-banner')).not.toBeInTheDocument();
  });
});