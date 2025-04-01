import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionList } from '../SessionList';
import useSessionManager from '../../../hooks/useSessionManager';

// Mock the useSessionManager hook
jest.mock('../../../hooks/useSessionManager');

describe('SessionList', () => {
  const mockSessions = [
    {
      id: 'session-1',
      createdAt: '2023-01-01T00:00:00Z',
      lastActiveAt: '2023-01-01T01:00:00Z',
      messageCount: 10,
      toolCount: 5,
      initialQuery: 'Hello, Claude',
      lastMessage: {
        role: 'assistant',
        content: 'Hello! How can I help you today?',
        timestamp: '2023-01-01T01:00:00Z'
      },
      repositoryInfo: {
        repoName: 'qckfx/agent',
        commitHash: 'abcd1234efgh5678',
        branch: 'main',
        isDirty: false
      }
    },
    {
      id: 'session-2',
      createdAt: '2023-01-02T00:00:00Z',
      lastActiveAt: '2023-01-02T01:00:00Z',
      messageCount: 5,
      toolCount: 2,
      initialQuery: 'Can you help me with code?',
      lastMessage: {
        role: 'user',
        content: 'Thanks!',
        timestamp: '2023-01-02T01:00:00Z'
      },
      repositoryInfo: {
        repoName: 'qckfx/agent',
        commitHash: '9876fedc5432',
        branch: 'feature',
        isDirty: true
      }
    }
  ];
  
  const mockSessionManager = {
    sessions: mockSessions,
    isLoading: false,
    deleteSession: jest.fn().mockResolvedValue(true),
    loadSession: jest.fn().mockResolvedValue(true),
    refreshSessions: jest.fn()
  };
  
  beforeEach(() => {
    (useSessionManager as jest.Mock).mockReturnValue(mockSessionManager);
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  it('should render the session list', () => {
    render(<SessionList />);
    
    // Check for session items
    expect(screen.getByText('Hello, Claude')).toBeInTheDocument();
    expect(screen.getByText('Can you help me with code?')).toBeInTheDocument();
  });
  
  it('should show loading state', () => {
    (useSessionManager as jest.Mock).mockReturnValue({
      ...mockSessionManager,
      isLoading: true
    });
    
    render(<SessionList />);
    
    expect(screen.getByText('Loading sessions...')).toBeInTheDocument();
  });
  
  it('should show empty state', () => {
    (useSessionManager as jest.Mock).mockReturnValue({
      ...mockSessionManager,
      sessions: []
    });
    
    render(<SessionList />);
    
    expect(screen.getByText('No saved sessions found.')).toBeInTheDocument();
  });
  
  it('should toggle session details', () => {
    render(<SessionList />);
    
    // Initially details should not be visible
    expect(screen.queryByText('Session ID:')).not.toBeInTheDocument();
    
    // Click Details button
    fireEvent.click(screen.getAllByText('Details')[0]);
    
    // Now details should be visible
    expect(screen.getByText('Session ID:')).toBeInTheDocument();
    expect(screen.getByText('session-1')).toBeInTheDocument();
    
    // Should show repository info
    expect(screen.getByText('Repository:')).toBeInTheDocument();
    expect(screen.getByText('qckfx/agent')).toBeInTheDocument();
    
    // Click Details button again to hide
    fireEvent.click(screen.getByText('Hide'));
    
    // Details should be hidden again
    expect(screen.queryByText('Session ID:')).not.toBeInTheDocument();
  });
  
  it('should show warning for dirty repository', () => {
    render(<SessionList />);
    
    // Open details for the second session (which has isDirty=true)
    fireEvent.click(screen.getAllByText('Details')[1]);
    
    // Warning should be visible
    expect(screen.getByText(/This session had uncommitted changes/)).toBeInTheDocument();
  });
  
  it('should call loadSession when Load button is clicked', () => {
    render(<SessionList />);
    
    // Click Load button for the first session
    fireEvent.click(screen.getAllByText('Load')[0]);
    
    // loadSession should be called with the correct session ID
    expect(mockSessionManager.loadSession).toHaveBeenCalledWith('session-1');
  });
  
  it('should show delete confirmation', () => {
    render(<SessionList />);
    
    // Click Delete button
    fireEvent.click(screen.getAllByText('Delete')[0]);
    
    // Confirmation should be visible
    expect(screen.getByText(/Are you sure you want to delete this session?/)).toBeInTheDocument();
    
    // Confirm buttons should be visible
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
  });
  
  it('should delete session when confirmed', () => {
    render(<SessionList />);
    
    // Click Delete button
    fireEvent.click(screen.getAllByText('Delete')[0]);
    
    // Click Confirm Delete
    fireEvent.click(screen.getByText('Confirm Delete'));
    
    // deleteSession should be called with the correct session ID
    expect(mockSessionManager.deleteSession).toHaveBeenCalledWith('session-1');
  });
  
  it('should cancel deletion when Cancel is clicked', () => {
    render(<SessionList />);
    
    // Click Delete button
    fireEvent.click(screen.getAllByText('Delete')[0]);
    
    // Click Cancel
    fireEvent.click(screen.getByText('Cancel'));
    
    // Confirmation should be hidden
    expect(screen.queryByText(/Are you sure you want to delete this session?/)).not.toBeInTheDocument();
    
    // deleteSession should not be called
    expect(mockSessionManager.deleteSession).not.toHaveBeenCalled();
  });
  
  it('should call onSessionSelect when provided', () => {
    const onSessionSelect = jest.fn();
    render(<SessionList onSessionSelect={onSessionSelect} />);
    
    // Click Load button
    fireEvent.click(screen.getAllByText('Load')[0]);
    
    // onSessionSelect should be called instead of loadSession
    expect(onSessionSelect).toHaveBeenCalledWith('session-1');
    expect(mockSessionManager.loadSession).not.toHaveBeenCalled();
  });
});