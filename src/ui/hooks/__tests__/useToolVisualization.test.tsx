import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useToolVisualization } from '../useToolVisualization';
import { TimelineItemType } from '../../../types/timeline';
import { PreviewMode } from '../../../types/preview';

// Mock the TimelineContext
jest.mock('../../context/TimelineContext', () => ({
  useTimelineContext: jest.fn(() => ({
    getToolExecutionItems: jest.fn(() => [
      {
        id: 'tool-1',
        type: TimelineItemType.TOOL_EXECUTION,
        sessionId: 'test-session',
        timestamp: '2023-01-01T00:01:00Z',
        toolExecution: {
          id: 'tool-1',
          toolId: 'bash',
          toolName: 'Bash',
          status: 'completed',
          startTime: '2023-01-01T00:01:00Z',
          endTime: '2023-01-01T00:01:05Z',
          executionTime: 5000
        },
        preview: {
          contentType: 'text',
          briefContent: 'Test output',
          fullContent: 'Complete test output',
          metadata: {}
        }
      },
      {
        id: 'tool-2',
        type: TimelineItemType.TOOL_EXECUTION,
        sessionId: 'test-session',
        timestamp: '2023-01-01T00:02:00Z',
        toolExecution: {
          id: 'tool-2',
          toolId: 'bash',
          toolName: 'Bash',
          status: 'running',
          startTime: '2023-01-01T00:02:00Z'
        }
      }
    ])
  }))
}));

describe('useToolVisualization', () => {
  it('returns tools with appropriate view modes', () => {
    const { result } = renderHook(() => useToolVisualization());
    
    // Check default state
    expect(result.current.tools).toHaveLength(2);
    expect(result.current.tools[0].viewMode).toBe(PreviewMode.BRIEF);
    expect(result.current.defaultViewMode).toBe(PreviewMode.BRIEF);
  });

  it('properly categorizes active and recent tools', () => {
    const { result } = renderHook(() => useToolVisualization());
    
    // Check tool categorization
    expect(result.current.activeTools).toHaveLength(1);
    expect(result.current.activeTools[0].id).toBe('tool-2');
    expect(result.current.recentTools).toHaveLength(1);
    expect(result.current.recentTools[0].id).toBe('tool-1');
  });

  it('allows setting tool-specific view modes', () => {
    const { result } = renderHook(() => useToolVisualization());
    
    // Set a tool-specific view mode
    act(() => {
      result.current.setToolViewMode('tool-1', PreviewMode.COMPLETE);
    });
    
    // Check that the view mode was updated for the specific tool
    expect(result.current.tools[0].viewMode).toBe(PreviewMode.COMPLETE);
    expect(result.current.tools[1].viewMode).toBe(PreviewMode.BRIEF);
  });

  it('allows setting default view mode for all tools', () => {
    const { result } = renderHook(() => useToolVisualization());
    
    // Set default view mode
    act(() => {
      result.current.setDefaultViewMode(PreviewMode.RETRACTED);
    });
    
    // The default should be updated
    expect(result.current.defaultViewMode).toBe(PreviewMode.RETRACTED);
    
    // New tools should use the default - we can't test this directly without
    // changing the mocked context data, but we can verify the functionality exists
  });

  it('provides utility methods for accessing tools', () => {
    const { result } = renderHook(() => useToolVisualization());
    
    // Check getToolById utility
    expect(result.current.getToolById('tool-1')).toBeDefined();
    expect(result.current.getToolById('non-existent')).toBeUndefined();
    
    // Check calculated properties
    expect(result.current.hasActiveTools).toBe(true);
    expect(result.current.activeToolCount).toBe(1);
  });
});