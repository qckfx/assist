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
    expect(screen.getByText('1.00s')).toBeInTheDocument();
  });
  
  it('renders error tool correctly', () => {
    const { container } = render(<ToolVisualization tool={mockErrorTool} />);
    
    expect(screen.getByText('FileReadTool')).toBeInTheDocument();
    expect(container.querySelector('[data-tool-status="error"]')).toBeInTheDocument();
    expect(screen.getByText('/path/to/file.txt')).toBeInTheDocument();
    expect(screen.getByText('File not found')).toBeInTheDocument();
  });
  
  it('toggles expanded parameters when clicked', () => {
    const toggleMock = vi.fn();
    const { getByText } = render(
      <ToolVisualization 
        tool={mockCompletedTool} 
        onToggleExpand={toggleMock} 
      />
    );
    
    // Click to expand
    getByText('command: ls -la').click();
    expect(toggleMock).toHaveBeenCalledTimes(1);
  });
  
  it('renders compact version correctly', () => {
    render(<ToolVisualization tool={mockCompletedTool} compact />);
    
    expect(screen.getByText('BashTool')).toBeInTheDocument();
    // Compact version should have less details
    const compactEl = screen.getByTestId('tool-visualization');
    expect(compactEl).toHaveClass('text-sm');
  });
  
  it('displays permission banner for tools awaiting permission', () => {
    render(<ToolVisualization tool={mockAwaitingPermissionTool} />);
    
    // Check for permission banner
    const banner = screen.getByTestId('permission-banner');
    expect(banner).toBeInTheDocument();
    
    // Check banner content
    expect(screen.getByText('Permission Required')).toBeInTheDocument();
    expect(screen.getByText('Type \'y\' to allow, anything else to deny')).toBeInTheDocument();
  });
  
  it('does not display permission banner for tools not awaiting permission', () => {
    render(<ToolVisualization tool={mockRunningTool} />);
    expect(screen.queryByTestId('permission-banner')).not.toBeInTheDocument();
  });
});