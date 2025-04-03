import React from 'react';
import { render, screen, renderHook, act } from '@testing-library/react';
import { TimelineProvider, useTimelineContext } from '../TimelineContext';
import { TimelineItemType } from '../../../types/timeline';

// Mock the useTimeline hook
jest.mock('../../hooks/useTimeline', () => ({
  useTimeline: jest.fn(() => ({
    timeline: [
      {
        id: 'msg-1',
        type: TimelineItemType.MESSAGE,
        sessionId: 'test-session',
        timestamp: '2023-01-01T00:00:00Z',
        message: {
          id: 'msg-1',
          role: 'user',
          content: 'Test message'
        }
      },
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
          endTime: '2023-01-01T00:01:05Z'
        }
      }
    ],
    isLoading: false,
    error: null,
    hasMore: false,
    totalCount: 2,
    loadMore: jest.fn(),
    reload: jest.fn()
  }))
}));

describe('TimelineContext', () => {
  it('provides timeline data to child components', () => {
    const TestComponent = () => {
      const { timeline } = useTimelineContext();
      return <div data-testid="timeline-count">{timeline.length}</div>;
    };

    render(
      <TimelineProvider sessionId="test-session">
        <TestComponent />
      </TimelineProvider>
    );

    expect(screen.getByTestId('timeline-count')).toHaveTextContent('2');
  });

  it('provides helper methods for filtering timeline items', () => {
    const { result } = renderHook(() => useTimelineContext(), {
      wrapper: ({ children }) => (
        <TimelineProvider sessionId="test-session">{children}</TimelineProvider>
      )
    });

    expect(result.current.getMessageItems()).toHaveLength(1);
    expect(result.current.getToolExecutionItems()).toHaveLength(1);
    expect(result.current.getItemById('msg-1')).toBeDefined();
    expect(result.current.getItemById('non-existent')).toBeUndefined();
  });

  it('throws error when used outside of provider', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => {
      renderHook(() => useTimelineContext());
    }).toThrow('useTimelineContext must be used within a TimelineProvider');
    
    consoleErrorSpy.mockRestore();
  });

  it('exposes loadMore and refreshTimeline methods', () => {
    const { result } = renderHook(() => useTimelineContext(), {
      wrapper: ({ children }) => (
        <TimelineProvider sessionId="test-session">{children}</TimelineProvider>
      )
    });

    act(() => {
      result.current.loadMore();
      result.current.refreshTimeline();
    });

    // Just testing that these methods exist and don't throw
    expect(result.current.loadMore).toBeDefined();
    expect(result.current.refreshTimeline).toBeDefined();
  });
});