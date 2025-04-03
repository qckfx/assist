import React from 'react';
import { render, screen } from '@testing-library/react';
import { MessageFeed } from '../MessageFeed';
import { TimelineItemType } from '../../../../types/timeline';

// Mock the TimelineContext
jest.mock('../../../context/TimelineContext', () => ({
  useTimelineContext: () => ({
    timeline: [
      {
        id: 'msg-1',
        type: TimelineItemType.MESSAGE,
        sessionId: 'test-session',
        timestamp: '2023-01-01T00:00:00Z',
        message: {
          id: 'msg-1',
          role: 'system',
          content: [{ type: 'text', text: 'System message' }]
        }
      },
      {
        id: 'msg-2',
        type: TimelineItemType.MESSAGE,
        sessionId: 'test-session',
        timestamp: '2023-01-01T00:00:01Z',
        message: {
          id: 'msg-2',
          role: 'user',
          content: [{ type: 'text', text: 'User message' }]
        }
      },
      {
        id: 'msg-3',
        type: TimelineItemType.MESSAGE,
        sessionId: 'test-session',
        timestamp: '2023-01-01T00:00:02Z',
        message: {
          id: 'msg-3',
          role: 'assistant',
          content: [{ type: 'text', text: 'Assistant message' }]
        }
      },
      {
        id: 'msg-4',
        type: TimelineItemType.MESSAGE,
        sessionId: 'test-session',
        timestamp: '2023-01-01T00:00:03Z',
        message: {
          id: 'msg-4',
          role: 'error',
          content: [{ type: 'text', text: 'Error message' }]
        }
      },
      {
        id: 'tool-1',
        type: TimelineItemType.TOOL_EXECUTION,
        sessionId: 'test-session',
        timestamp: '2023-01-01T00:00:04Z',
        toolExecution: {
          id: 'tool-1',
          toolId: 'bash',
          toolName: 'Bash',
          status: 'completed',
          startTime: '2023-01-01T00:00:04Z',
          endTime: '2023-01-01T00:00:05Z'
        }
      }
    ],
    isLoading: false,
    error: null
  })
}));

// Mock the ToolVisualization hook
jest.mock('../../../hooks/useToolVisualization', () => ({
  useToolVisualization: () => ({
    setToolViewMode: jest.fn(),
    defaultViewMode: 'brief'
  })
}));

describe('MessageFeed Component', () => {
  it('renders empty state when timeline is empty', () => {
    // Override the mock for this test
    jest.spyOn(require('../../../context/TimelineContext'), 'useTimelineContext').mockReturnValue({
      timeline: [],
      isLoading: false,
      error: null
    });
    
    render(<MessageFeed sessionId="test-session" />);
    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });
  
  it('renders loading state when timeline is loading', () => {
    // Override the mock for this test
    jest.spyOn(require('../../../context/TimelineContext'), 'useTimelineContext').mockReturnValue({
      timeline: [],
      isLoading: true,
      error: null
    });
    
    render(<MessageFeed sessionId="test-session" />);
    expect(screen.getByText('Loading timeline...')).toBeInTheDocument();
  });
  
  it('renders error state when timeline has error', () => {
    // Override the mock for this test
    jest.spyOn(require('../../../context/TimelineContext'), 'useTimelineContext').mockReturnValue({
      timeline: [],
      isLoading: false,
      error: new Error('Test error')
    });
    
    render(<MessageFeed sessionId="test-session" />);
    expect(screen.getByText(/Error loading timeline/)).toBeInTheDocument();
    expect(screen.getByText(/Test error/)).toBeInTheDocument();
  });
  
  it('renders all messages and tools with correct content', () => {
    render(<MessageFeed sessionId="test-session" />);
    
    // Check all messages are rendered
    expect(screen.getByText('System message')).toBeInTheDocument();
    expect(screen.getByText('User message')).toBeInTheDocument();
    expect(screen.getByText('Assistant message')).toBeInTheDocument();
    expect(screen.getByText('Error message')).toBeInTheDocument();
    
    // Tool visualization is rendered by ToolVisualization component 
    // which is already tested separately and mocked here
    expect(screen.getByTestId('tool-tool-1')).toBeInTheDocument();
  });
  
  it('applies custom class name', () => {
    render(<MessageFeed sessionId="test-session" className="test-class" />);
    
    const messageFeed = screen.getByTestId('message-feed');
    expect(messageFeed).toHaveClass('test-class');
  });
  
  it('sets correct ARIA attributes for accessibility', () => {
    render(<MessageFeed sessionId="test-session" ariaLabelledBy="test-label" />);
    
    const messageFeed = screen.getByTestId('message-feed');
    expect(messageFeed).toHaveAttribute('aria-labelledby', 'test-label');
    expect(messageFeed).toHaveAttribute('role', 'list');
  });
});