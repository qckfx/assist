/**
 * Isolated tests for useTerminalWebSocket hook
 * 
 * This file is specifically designed to run in isolation to avoid
 * memory leaks and interference with other tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { ConnectionStatus } from '../../types/api';
import { WebSocketServiceFactory } from '../../services/factories/WebSocketServiceFactory';
import { MockWebSocketService } from '../../services/implementations/MockWebSocketService';

// Create mocks for terminal functions
const mockAddSystemMessage = vi.fn();
const mockAddUserMessage = vi.fn();
const mockAddAssistantMessage = vi.fn();
const mockAddToolMessage = vi.fn();
const mockAddErrorMessage = vi.fn();
const mockSetProcessing = vi.fn();

// Mock terminal context - use the same path as in the hook
vi.mock('@/context/TerminalContext', () => ({
  useTerminal: () => ({
    addSystemMessage: mockAddSystemMessage,
    addErrorMessage: mockAddErrorMessage,
    addUserMessage: mockAddUserMessage,
    addAssistantMessage: mockAddAssistantMessage,
    addToolMessage: mockAddToolMessage,
    setProcessing: mockSetProcessing,
    state: { isProcessing: false, messages: [], history: [] },
    dispatch: vi.fn(),
    addMessage: vi.fn(),
    clearMessages: vi.fn(),
    addToHistory: vi.fn()
  })
}));

// This helper function creates an isolated testing environment
function setupIsolatedTest() {
  // Reset the factory and use test implementation
  WebSocketServiceFactory.reset();
  WebSocketServiceFactory.useTestImplementation();
  const mockService = WebSocketServiceFactory.getInstance() as MockWebSocketService;
  
  // Ensure clean state
  mockService.removeAllListeners();
  vi.clearAllMocks();
  
  return { mockService };
}

// Import the hook after mocks are set up
import { useTerminalWebSocket } from '../useTerminalWebSocket';

// These tests should be run in isolation from other tests
// Run with: npm run test:ui -- src/ui/hooks/__tests__/useTerminalWebSocket.isolated.test.tsx
describe.skip('useTerminalWebSocket (Isolated Tests)', () => {
  afterEach(() => {
    // Cleanup is critical to avoid memory leaks
    WebSocketServiceFactory.reset();
    vi.clearAllMocks();
  });

  it('connects to a session when provided a sessionId', () => {
    // Set up an isolated environment for this test
    const { mockService } = setupIsolatedTest();
    const sessionId = 'test-session-' + Date.now();
    
    // Render the hook with explicit cleanup
    const { unmount } = renderHook(() => useTerminalWebSocket(sessionId));
    
    // Verify it called joinSession and added system message
    expect(mockAddSystemMessage).toHaveBeenCalledWith(
      expect.stringContaining(sessionId)
    );
    
    // Explicitly unmount to trigger all cleanup functions
    unmount();
    
    // Force additional cleanup
    mockService.removeAllListeners();
  });

  it('handles cleanup when unmounted', () => {
    // Set up an isolated environment for this test
    const { mockService } = setupIsolatedTest();
    const sessionId = 'test-session-' + Date.now();
    
    // Create a spy on the mock service
    const leaveSessionSpy = vi.spyOn(mockService, 'leaveSession');
    
    // Render and get unmount function
    const { unmount } = renderHook(() => useTerminalWebSocket(sessionId));
    
    // Clear mocks to focus on cleanup
    vi.clearAllMocks();
    
    // Unmount to trigger cleanup
    unmount();
    
    // Verify leaveSession was called with the right session ID
    expect(leaveSessionSpy).toHaveBeenCalledWith(sessionId);
    
    // Force additional cleanup
    mockService.removeAllListeners();
  });
});