import { renderHook, act } from '@testing-library/react-hooks';
import useSessionManager from '../useSessionManager';
import { WebSocketEvent } from '../../../types/websocket';
import { WebSocketContext } from '../../context/WebSocketContext';
import React from 'react';

// Mock socket.io-client
jest.mock('socket.io-client');

describe('useSessionManager', () => {
  // Mock socket
  const mockSocket = {
    emit: jest.fn((event, data, callback) => {
      if (callback) {
        callback({ success: true, sessions: [] });
      }
    }),
    on: jest.fn(),
    off: jest.fn()
  };
  
  // Mock WebSocketContext
  const mockSubscribe = jest.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <WebSocketContext.Provider
      value={{
        socket: mockSocket as any,
        isConnected: true,
        subscribe: mockSubscribe,
        getSessionId: () => 'test-session'
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock the subscribe function
    mockSubscribe.mockImplementation((event, callback) => {
      return () => {}; // Return unsubscribe function
    });
  });
  
  it('should fetch sessions on initial render', () => {
    renderHook(() => useSessionManager(), { wrapper });
    
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'list_sessions',
      {},
      expect.any(Function)
    );
  });
  
  it('should subscribe to session events', () => {
    renderHook(() => useSessionManager(), { wrapper });
    
    expect(mockSubscribe).toHaveBeenCalledWith(
      WebSocketEvent.SESSION_LIST_UPDATED,
      expect.any(Function)
    );
    
    expect(mockSubscribe).toHaveBeenCalledWith(
      WebSocketEvent.SESSION_SAVED,
      expect.any(Function)
    );
    
    expect(mockSubscribe).toHaveBeenCalledWith(
      WebSocketEvent.SESSION_DELETED,
      expect.any(Function)
    );
  });
  
  it('should update sessions when receiving SESSION_LIST_UPDATED event', () => {
    // Capture the subscription callback
    let listUpdatedCallback: any;
    mockSubscribe.mockImplementation((event, callback) => {
      if (event === WebSocketEvent.SESSION_LIST_UPDATED) {
        listUpdatedCallback = callback;
      }
      return () => {};
    });
    
    const { result } = renderHook(() => useSessionManager(), { wrapper });
    
    // Initially empty
    expect(result.current.sessions).toEqual([]);
    
    // Simulate receiving sessions
    const mockSessions = [
      { id: 'session-1', createdAt: '2023-01-01T00:00:00Z', lastActiveAt: '2023-01-01T01:00:00Z' }
    ];
    
    act(() => {
      listUpdatedCallback({ sessions: mockSessions });
    });
    
    // Should update sessions
    expect(result.current.sessions).toEqual(mockSessions);
  });
  
  it('should save current session', async () => {
    // Mock localStorage
    const getItemSpy = jest.spyOn(Storage.prototype, 'getItem');
    getItemSpy.mockReturnValue('test-session');
    
    const { result } = renderHook(() => useSessionManager(), { wrapper });
    
    let saveSuccess: boolean = false;
    
    await act(async () => {
      saveSuccess = await result.current.saveCurrentSession();
    });
    
    expect(saveSuccess).toBe(true);
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'save_session',
      { sessionId: 'test-session' },
      expect.any(Function)
    );
    
    // Cleanup
    getItemSpy.mockRestore();
  });
  
  it('should delete a session', async () => {
    const { result } = renderHook(() => useSessionManager(), { wrapper });
    
    let deleteSuccess: boolean = false;
    
    await act(async () => {
      deleteSuccess = await result.current.deleteSession('test-session');
    });
    
    expect(deleteSuccess).toBe(true);
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'delete_session',
      { sessionId: 'test-session' },
      expect.any(Function)
    );
  });
  
  it('should load a session', async () => {
    // Mock localStorage and location
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    const originalLocation = window.location;
    delete window.location;
    window.location = { ...originalLocation, reload: jest.fn() } as any;
    
    const { result } = renderHook(() => useSessionManager(), { wrapper });
    
    let loadSuccess: boolean = false;
    
    await act(async () => {
      loadSuccess = await result.current.loadSession('test-session');
    });
    
    expect(loadSuccess).toBe(true);
    expect(setItemSpy).toHaveBeenCalledWith('sessionId', 'test-session');
    expect(window.location.reload).toHaveBeenCalled();
    
    // Cleanup
    setItemSpy.mockRestore();
    window.location = originalLocation;
  });
  
  it('should refresh sessions', () => {
    const { result } = renderHook(() => useSessionManager(), { wrapper });
    
    act(() => {
      result.current.refreshSessions();
    });
    
    // Should have called list_sessions twice (once on init, once on refresh)
    expect(mockSocket.emit).toHaveBeenCalledTimes(2);
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'list_sessions',
      undefined,
      undefined
    );
  });
});