import React from 'react';
import { render } from '@testing-library/react';
import { ToolVisualization } from '../ToolVisualization';

// Note: This is a placeholder for actual visual regression testing
// A real implementation would use tools like Percy, Chromatic, or Storybook
describe('ToolVisualization Visual Tests', () => {
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
  
  it('renders with correct visual styles for running tool', () => {
    const { container } = render(<ToolVisualization tool={mockRunningTool} />);
    
    // In a real visual test, we'd take a screenshot here and compare
    // For this placeholder, we'll just check a few CSS classes
    const toolElement = container.querySelector('.tool-visualization');
    expect(toolElement).toHaveClass('border-l-4');
    
    // Check for the running status style 
    expect(toolElement).toHaveAttribute('data-tool-status', 'running');
    
    // Check for blue color for running status
    const hasBlueClass = Array.from(toolElement!.classList).some(
      cls => cls.includes('border-blue')
    );
    expect(hasBlueClass).toBe(true);
    
    // Check for animated element (pulse animation)
    const animatedElement = container.querySelector('.animate-pulse');
    expect(animatedElement).toBeInTheDocument();
  });
  
  it('renders with correct visual styles for completed tool', () => {
    const { container } = render(<ToolVisualization tool={mockCompletedTool} />);
    
    const toolElement = container.querySelector('.tool-visualization');
    expect(toolElement).toHaveAttribute('data-tool-status', 'completed');
    
    // Check for green color for completed status
    const hasGreenClass = Array.from(toolElement!.classList).some(
      cls => cls.includes('border-green')
    );
    expect(hasGreenClass).toBe(true);
    
    // Check for completion time - now in .text-gray-500 or .text-gray-400 element
    const timeElement = container.querySelector('.text-gray-500, .text-gray-400');
    expect(timeElement).toBeInTheDocument();
    expect(timeElement?.textContent).toContain('1.00s');
  });
  
  it('renders with correct visual styles for error tool', () => {
    const { container } = render(<ToolVisualization tool={mockErrorTool} />);
    
    const toolElement = container.querySelector('.tool-visualization');
    expect(toolElement).toHaveAttribute('data-tool-status', 'error');
    
    // Check for red color for error status
    const hasRedClass = Array.from(toolElement!.classList).some(
      cls => cls.includes('border-red')
    );
    expect(hasRedClass).toBe(true);
    
    // Check for error message - now in .text-red-600 or .text-red-400 element
    const errorElement = container.querySelector('.text-red-600, .text-red-400');
    expect(errorElement).toBeInTheDocument();
    expect(errorElement?.textContent).toContain('File not found');
  });
  
  it('renders with compact property if provided', () => {
    const { container } = render(<ToolVisualization tool={mockCompletedTool} compact={true} />);
    
    // Check that the component renders correctly
    const toolElement = container.querySelector('.tool-visualization');
    expect(toolElement).toBeInTheDocument();
    
    // Check that tool name is displayed
    expect(toolElement?.textContent).toContain('BashTool');
  });
  
  it('renders expanded parameters when showExpandedParams is true', () => {
    const { container } = render(
      <ToolVisualization tool={mockRunningTool} showExpandedParams={true} />
    );
    
    // Check that there's a div with whitespace-pre-wrap class for expanded params
    const expandedElement = container.querySelector('.whitespace-pre-wrap');
    expect(expandedElement).toBeInTheDocument();
  });
});