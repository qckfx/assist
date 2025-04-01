import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ToolVisualization from '../ToolVisualization';
import { ToolExecution } from '../../../hooks/useToolStream';
import { PreviewContentType, PreviewMode } from '../../../../types/preview';

describe('ToolVisualization with Preview', () => {
  // Create a mock tool with preview data
  const createMockTool = (overrides = {}): ToolExecution => ({
    id: 'test-tool-1',
    tool: 'TestTool',
    toolName: 'Test Tool',
    status: 'completed',
    args: { param1: 'value1' },
    paramSummary: 'Test summary',
    result: { result: 'test result' },
    startTime: Date.now() - 1000,
    endTime: Date.now(),
    executionTime: 1000,
    preview: {
      contentType: PreviewContentType.TEXT,
      briefContent: 'Brief preview content',
      fullContent: 'Full preview content\nwith multiple lines\nand more details',
      metadata: { lineCount: 3 }
    },
    viewMode: PreviewMode.BRIEF,
    ...overrides
  });

  it('renders with retracted preview by default if specified', () => {
    const mockTool = createMockTool({
      viewMode: PreviewMode.RETRACTED // Override the default viewMode
    });
    
    const { container } = render(
      <ToolVisualization 
        tool={mockTool} 
        defaultViewMode={PreviewMode.RETRACTED}
      />
    );
    
    // Preview should not be visible
    expect(container.querySelector('.preview-container')).not.toBeInTheDocument();
    expect(screen.queryByText('Brief preview content')).not.toBeInTheDocument();
  });
  
  it('renders with brief preview by default', () => {
    const mockTool = createMockTool();
    render(<ToolVisualization tool={mockTool} />);
    
    // Brief preview should be visible
    expect(screen.getByTestId('preview-content-code')).toBeInTheDocument();
    expect(screen.getByText('Brief preview content')).toBeInTheDocument();
    expect(screen.queryByText('Full preview content')).not.toBeInTheDocument();
  });
  
  it('supports different view modes via props', () => {
    const mockTool = createMockTool();
    
    // Test with BRIEF mode (default)
    const { container: briefContainer, rerender } = render(
      <ToolVisualization 
        tool={mockTool} 
        defaultViewMode={PreviewMode.BRIEF}
      />
    );
    
    // Verify brief mode
    const briefElement = briefContainer.querySelector('[data-view-mode="brief"]');
    expect(briefElement).toBeInTheDocument();
    expect(screen.getByText('Brief preview content')).toBeInTheDocument();
    
    // Test with COMPLETE mode
    rerender(
      <ToolVisualization 
        tool={{...mockTool, viewMode: PreviewMode.COMPLETE}}
      />
    );
    
    // Verify complete mode
    const completeElement = briefContainer.querySelector('[data-view-mode="complete"]');
    expect(completeElement).toBeInTheDocument();
    
    // Test with RETRACTED mode
    rerender(
      <ToolVisualization 
        tool={{...mockTool, viewMode: PreviewMode.RETRACTED}}
      />
    );
    
    // Verify retracted mode
    const retractedElement = briefContainer.querySelector('[data-view-mode="retracted"]');
    expect(retractedElement).toBeInTheDocument();
    // Preview container should not be shown in retracted mode
    expect(briefContainer.querySelector('.preview-container')).not.toBeInTheDocument();
  });
  
  // Add a separate test for callback
  it('calls onViewModeChange when view mode button is clicked', () => {
    const mockTool = createMockTool();
    const onViewModeChange = vi.fn();
    render(
      <ToolVisualization 
        tool={mockTool} 
        onViewModeChange={onViewModeChange}
      />
    );
    
    // Find and click the toggle button
    const toggleButton = screen.getByLabelText(/Toggle view mode/);
    fireEvent.click(toggleButton);
    
    // Verify callback was called
    expect(onViewModeChange).toHaveBeenCalledWith('test-tool-1', PreviewMode.COMPLETE);
  });
  
  it('renders diff content with appropriate highlighting', () => {
    const mockTool = createMockTool({
      tool: 'FileEditTool',
      args: {
        file_path: 'test.txt',
      },
      preview: {
        contentType: PreviewContentType.DIFF,
        briefContent: '+ Added line\n- Removed line\n  Unchanged line',
        fullContent: '+ Added line\n- Removed line\n  Unchanged line',
        metadata: {
          filePath: 'test.txt',
          changesSummary: { additions: 1, deletions: 1 },
          oldString: 'Old content',
          newString: 'New content',
          isEmptyFile: true
        }
      }
    });
    
    render(<ToolVisualization tool={mockTool} />);
    
    // Since we're using isEmptyFile: true, we should see the empty file info
    const diffContainer = screen.getByTestId('preview-content-diff-empty');
    expect(diffContainer).toBeInTheDocument();
    expect(screen.getByText('Creating empty file: test.txt')).toBeInTheDocument();
  });
  
  it('renders directory content with file icons', () => {
    const mockTool = createMockTool({
      preview: {
        contentType: PreviewContentType.DIRECTORY,
        briefContent: 'Directory listing',
        fullContent: 'Directory listing with more details',
        metadata: {
          entries: [
            { name: 'file.txt', isDirectory: false, size: 1024 },
            { name: 'folder', isDirectory: true }
          ]
        }
      }
    });
    
    // Render with complete mode to see directory entries
    render(
      <ToolVisualization 
        tool={{...mockTool, viewMode: PreviewMode.COMPLETE}}
      />
    );
    
    expect(screen.getByTestId('preview-content-directory')).toBeInTheDocument();
    expect(screen.getByText('Directory listing with more details')).toBeInTheDocument();
    
    // In complete mode, we should see the file entries
    expect(screen.getByText('file.txt')).toBeInTheDocument();
    expect(screen.getByText('folder')).toBeInTheDocument();
    expect(screen.getByText('(1.0 KB)')).toBeInTheDocument();
  });
  
  it('shows preview for running tools', () => {
    const mockTool = createMockTool({ 
      status: 'running',
      preview: {
        contentType: PreviewContentType.TEXT,
        briefContent: 'Running preview',
        fullContent: 'Running preview with more details',
        metadata: {}
      }
    });
    
    render(<ToolVisualization tool={mockTool} />);
    
    // With the new implementation, preview IS visible for running tools
    expect(screen.getByTestId('preview-content-code')).toBeInTheDocument();
    expect(screen.getByText('Running preview')).toBeInTheDocument();
  });
});