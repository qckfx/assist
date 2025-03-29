import { renderHook, act } from '@testing-library/react';
import { useAbortShortcuts } from '../useAbortShortcuts';
import { fireEvent } from '@testing-library/dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useWebSocketTerminal } from '../../context/WebSocketTerminalContext';
import { ConnectionStatus } from '../../types/api';

vi.mock('../../context/WebSocketTerminalContext', () => {
  return {
    useWebSocketTerminal: vi.fn(() => ({
      connectionStatus: ConnectionStatus.CONNECTED,
      isConnected: true,
      sessionId: 'test-session',
      createSession: vi.fn().mockResolvedValue('test-session'),
      handleCommand: vi.fn().mockResolvedValue(undefined),
      isProcessing: false,
      abortProcessing: vi.fn().mockResolvedValue(undefined),
      isStreaming: false,
      hasPendingPermissions: false,
      resolvePermission: vi.fn().mockResolvedValue(true),
    })),
  };
});

describe('useAbortShortcuts', () => {
  const mockAbortProcessing = vi.fn().mockResolvedValue(undefined);
  const defaultMockContext = {
    connectionStatus: ConnectionStatus.CONNECTED,
    isConnected: true,
    sessionId: 'test-session',
    createSession: vi.fn().mockResolvedValue('test-session'),
    handleCommand: vi.fn().mockResolvedValue(undefined),
    isStreaming: false,
    hasPendingPermissions: false,
    resolvePermission: vi.fn().mockResolvedValue(true),
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useWebSocketTerminal).mockReturnValue({
      ...defaultMockContext,
      isProcessing: false,
      abortProcessing: mockAbortProcessing,
    });
  });
  
  it('should not trigger abort when processing is inactive', () => {
    // Render hook with processing inactive
    const { result: _result } = renderHook(() => useAbortShortcuts());
    
    // Simulate Ctrl+C keydown
    act(() => {
      fireEvent.keyDown(document, { key: 'c', ctrlKey: true });
    });
    
    // Ensure abortProcessing wasn't called
    expect(mockAbortProcessing).not.toHaveBeenCalled();
  });
  
  it('should abort processing on Ctrl+C when processing is active', () => {
    vi.mocked(useWebSocketTerminal).mockReturnValue({
      ...defaultMockContext,
      isProcessing: true,
      abortProcessing: mockAbortProcessing,
    });
    
    const { result: _result } = renderHook(() => useAbortShortcuts());
    act(() => {
      fireEvent.keyDown(document, { key: 'c', ctrlKey: true });
    });
    expect(mockAbortProcessing).toHaveBeenCalledTimes(1);
  });
  
  it('should abort processing on Escape when not in a text field', () => {
    vi.mocked(useWebSocketTerminal).mockReturnValue({
      ...defaultMockContext,
      isProcessing: true,
      abortProcessing: mockAbortProcessing,
    });
    
    const { result: _result } = renderHook(() => useAbortShortcuts());
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(mockAbortProcessing).toHaveBeenCalledTimes(1);
  });
  
  it('should abort processing on Escape in an empty input field', () => {
    vi.mocked(useWebSocketTerminal).mockReturnValue({
      ...defaultMockContext,
      isProcessing: true,
      abortProcessing: mockAbortProcessing,
    });
    
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    
    const { result: _result } = renderHook(() => useAbortShortcuts());
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape', target: input });
    });
    expect(mockAbortProcessing).toHaveBeenCalledTimes(1);
    document.body.removeChild(input);
  });
  
  it('should not abort processing on Escape in a non-empty input field', () => {
    vi.mocked(useWebSocketTerminal).mockReturnValue({
      ...defaultMockContext,
      isProcessing: true,
      abortProcessing: mockAbortProcessing,
    });
    
    const input = document.createElement('input');
    input.value = 'some text';
    document.body.appendChild(input);
    input.focus();
    
    const { result: _result } = renderHook(() => useAbortShortcuts());
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape', target: input });
    });
    expect(mockAbortProcessing).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
  
  it('should not abort on Ctrl+C if text is selected (to allow copying)', () => {
    vi.mocked(useWebSocketTerminal).mockReturnValue({
      ...defaultMockContext,
      isProcessing: true,
      abortProcessing: mockAbortProcessing,
    });
    
    const originalGetSelection = window.getSelection;
    window.getSelection = vi.fn().mockReturnValue({
      toString: () => 'selected text',
    });
    
    const { result: _result } = renderHook(() => useAbortShortcuts());
    act(() => {
      fireEvent.keyDown(document, { key: 'c', ctrlKey: true });
    });
    expect(mockAbortProcessing).not.toHaveBeenCalled();
    window.getSelection = originalGetSelection;
  });
  
  it('should provide shortcuts list for documentation', () => {
    vi.mocked(useWebSocketTerminal).mockReturnValue({
      ...defaultMockContext,
      isProcessing: true,
      abortProcessing: mockAbortProcessing,
    });
    
    const { result } = renderHook(() => useAbortShortcuts());
    expect(result.current.shortcuts).toHaveLength(2);
    expect(result.current.shortcuts[0].description).toContain('Ctrl+C');
    expect(result.current.shortcuts[1].description).toContain('Esc');
  });
  
  it('should not attach event listeners when enabled is false', () => {
    vi.mocked(useWebSocketTerminal).mockReturnValue({
      ...defaultMockContext,
      isProcessing: true,
      abortProcessing: mockAbortProcessing,
    });
    
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    renderHook(() => useAbortShortcuts(false));
    expect(addEventListenerSpy).not.toHaveBeenCalled();
    addEventListenerSpy.mockRestore();
  });
});