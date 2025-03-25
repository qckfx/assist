import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TerminalProvider, useTerminal } from '../TerminalContext';
import { WebSocketEvent } from '@/types/api';
import type { SessionState } from '../../../types/model';

import { vi } from 'vitest';

// Mock the WebSocketContext
const mockOn = vi.fn().mockReturnValue(() => {});

vi.mock('@/context/WebSocketContext', () => ({
  useWebSocketContext: vi.fn().mockImplementation(() => ({
    on: mockOn,
    onBatch: vi.fn().mockReturnValue(() => {}),
    currentSessionId: 'test-session-id',
    isConnected: true,
    connectionStatus: 'connected',
    joinSession: vi.fn(),
    leaveSession: vi.fn()
  }))
}));

// Test component that uses the context
const TestComponent = () => {
  const { 
    state, 
    addUserMessage, 
    addAssistantMessage, 
    addSystemMessage,
    addErrorMessage,
    clearMessages, 
    setProcessing,
    addToHistory,
    dispatch
  } = useTerminal();
  
  return (
    <div>
      <div data-testid="message-count">{state.messages.length}</div>
      <div data-testid="history-count">{state.history.length}</div>
      <div data-testid="processing-state">{state.isProcessing ? 'true' : 'false'}</div>
      <div data-testid="font-family">{state.theme.fontFamily}</div>
      <div data-testid="color-scheme">{state.theme.colorScheme}</div>
      
      <button data-testid="add-user-message" onClick={() => addUserMessage('User message')}>
        Add User Message
      </button>
      <button data-testid="add-assistant-message" onClick={() => addAssistantMessage('Assistant message')}>
        Add Assistant Message
      </button>
      <button data-testid="add-system-message" onClick={() => addSystemMessage('System message')}>
        Add System Message
      </button>
      <button data-testid="add-error-message" onClick={() => addErrorMessage('Error message')}>
        Add Error Message
      </button>
      <button data-testid="clear-messages" onClick={() => clearMessages()}>
        Clear Messages
      </button>
      <button data-testid="toggle-processing" onClick={() => setProcessing(!state.isProcessing)}>
        Toggle Processing
      </button>
      <button data-testid="add-to-history" onClick={() => addToHistory('test command')}>
        Add To History
      </button>
      <button 
        data-testid="set-font-family" 
        onClick={() => dispatch({ type: 'SET_FONT_FAMILY', payload: 'Courier New' })}
      >
        Change Font
      </button>
      <button 
        data-testid="set-color-scheme" 
        onClick={() => dispatch({ type: 'SET_COLOR_SCHEME', payload: 'light' })}
      >
        Change Theme
      </button>
    </div>
  );
};

describe('TerminalContext', () => {
  it('provides initial state', () => {
    render(
      <TerminalProvider>
        <TestComponent />
      </TerminalProvider>
    );
    
    // Initial state should have welcome messages (2 in this case, after removing tool example)
    expect(screen.getByTestId('message-count').textContent).toBe('2');
    expect(screen.getByTestId('history-count').textContent).toBe('0');
    expect(screen.getByTestId('processing-state').textContent).toBe('false');
    expect(screen.getByTestId('font-family').textContent).toBe('monospace');
    expect(screen.getByTestId('color-scheme').textContent).toBe('dark');
  });
  
  it('adds different types of messages correctly', () => {
    render(
      <TerminalProvider>
        <TestComponent />
      </TerminalProvider>
    );
    
    // Initial count
    const initialCount = Number(screen.getByTestId('message-count').textContent);
    
    // Add user message
    act(() => {
      fireEvent.click(screen.getByTestId('add-user-message'));
    });
    expect(screen.getByTestId('message-count').textContent).toBe((initialCount + 1).toString());
    
    // Add assistant message
    act(() => {
      fireEvent.click(screen.getByTestId('add-assistant-message'));
    });
    expect(screen.getByTestId('message-count').textContent).toBe((initialCount + 2).toString());
    
    // Add system message
    act(() => {
      fireEvent.click(screen.getByTestId('add-system-message'));
    });
    expect(screen.getByTestId('message-count').textContent).toBe((initialCount + 3).toString());
    
    // Add error message
    act(() => {
      fireEvent.click(screen.getByTestId('add-error-message'));
    });
    expect(screen.getByTestId('message-count').textContent).toBe((initialCount + 4).toString());
    
    // Tool messages have been removed in favor of ToolVisualization
  });
  
  it('clears messages correctly', () => {
    render(
      <TerminalProvider>
        <TestComponent />
      </TerminalProvider>
    );
    
    // Add some messages
    act(() => {
      fireEvent.click(screen.getByTestId('add-user-message'));
      fireEvent.click(screen.getByTestId('add-assistant-message'));
    });
    
    // Clear messages
    act(() => {
      fireEvent.click(screen.getByTestId('clear-messages'));
    });
    
    // After clearing, there should be 1 system message indicating terminal was cleared
    expect(screen.getByTestId('message-count').textContent).toBe('1');
  });
  
  it('toggles processing state', () => {
    render(
      <TerminalProvider>
        <TestComponent />
      </TerminalProvider>
    );
    
    expect(screen.getByTestId('processing-state').textContent).toBe('false');
    
    act(() => {
      fireEvent.click(screen.getByTestId('toggle-processing'));
    });
    
    expect(screen.getByTestId('processing-state').textContent).toBe('true');
    
    act(() => {
      fireEvent.click(screen.getByTestId('toggle-processing'));
    });
    
    expect(screen.getByTestId('processing-state').textContent).toBe('false');
  });
  
  it('adds to command history', () => {
    render(
      <TerminalProvider>
        <TestComponent />
      </TerminalProvider>
    );
    
    expect(screen.getByTestId('history-count').textContent).toBe('0');
    
    act(() => {
      fireEvent.click(screen.getByTestId('add-to-history'));
    });
    
    expect(screen.getByTestId('history-count').textContent).toBe('1');
  });
  
  it('updates theme settings', () => {
    render(
      <TerminalProvider>
        <TestComponent />
      </TerminalProvider>
    );
    
    // Initial values
    expect(screen.getByTestId('font-family').textContent).toBe('monospace');
    expect(screen.getByTestId('color-scheme').textContent).toBe('dark');
    
    // Change font family
    act(() => {
      fireEvent.click(screen.getByTestId('set-font-family'));
    });
    expect(screen.getByTestId('font-family').textContent).toBe('Courier New');
    
    // Change color scheme
    act(() => {
      fireEvent.click(screen.getByTestId('set-color-scheme'));
    });
    expect(screen.getByTestId('color-scheme').textContent).toBe('light');
  });

  describe('handleSessionUpdated', () => {
    // Helper function to get all registered event handlers for a given event
    const getEventHandler = (eventType: WebSocketEvent) => {
      // Find the call to on() for the specific event
      // Make sure we handle both jest and vitest mock formats
      const calls = mockOn.mock?.calls || [];
      const filtered = calls.filter(
        call => call[0] === eventType
      );
      
      if (filtered.length === 0) {
        return null;
      }
      
      // Return the registered callback function
      return filtered[0][1];
    };

    beforeEach(() => {
      mockOn.mockClear();
      
      // Render the component to initialize the context and register event handlers
      render(
        <TerminalProvider>
          <TestComponent />
        </TerminalProvider>
      );
    });

    it('processes classic object content with type/text format', () => {
      // Get the SESSION_UPDATED event handler
      const handleSessionUpdated = getEventHandler(WebSocketEvent.SESSION_UPDATED);
      expect(handleSessionUpdated).toBeTruthy();
      
      // Initial message count
      const initialCount = Number(screen.getByTestId('message-count').textContent);
      
      // Simulate receiving session data with classic format
      act(() => {
        handleSessionUpdated({
          id: 'test-session-id',
          state: {
            conversationHistory: [
              {
                role: 'user',
                content: [{ type: 'text', text: 'Hello' }]
              },
              {
                role: 'assistant',
                content: [
                  { type: 'text', text: 'This is an assistant response' }
                ]
              }
            ]
          } as SessionState
        });
      });
      
      // Verify a new message was added
      expect(screen.getByTestId('message-count').textContent)
        .toBe((initialCount + 1).toString());
    });

    it('processes array content with string items', () => {
      // Get the SESSION_UPDATED event handler
      const handleSessionUpdated = getEventHandler(WebSocketEvent.SESSION_UPDATED);
      
      // Initial message count
      const initialCount = Number(screen.getByTestId('message-count').textContent);
      
      // Simulate receiving session data with string array content
      act(() => {
        handleSessionUpdated({
          id: 'test-session-id',
          state: {
            conversationHistory: [
              {
                role: 'user',
                content: ['Hello'] as unknown as SessionState['conversationHistory'][0]['content']
              },
              {
                role: 'assistant',
                content: ['This is another format of assistant response'] as unknown as SessionState['conversationHistory'][0]['content']
              }
            ]
          } as SessionState
        });
      });
      
      // Verify a new message was added
      expect(screen.getByTestId('message-count').textContent)
        .toBe((initialCount + 1).toString());
    });

    it('processes legacy history format', () => {
      // Get the SESSION_UPDATED event handler
      const handleSessionUpdated = getEventHandler(WebSocketEvent.SESSION_UPDATED);
      
      // Initial message count
      const initialCount = Number(screen.getByTestId('message-count').textContent);
      
      // Simulate receiving session data with legacy history format
      act(() => {
        handleSessionUpdated({
          id: 'test-session-id',
          history: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hello' }]
            },
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Legacy format response' }]
            }
          ]
        });
      });
      
      // Verify a new message was added
      expect(screen.getByTestId('message-count').textContent)
        .toBe((initialCount + 1).toString());
    });

    it('processes simple string content', () => {
      // Get the SESSION_UPDATED event handler
      const handleSessionUpdated = getEventHandler(WebSocketEvent.SESSION_UPDATED);
      
      // Initial message count
      const initialCount = Number(screen.getByTestId('message-count').textContent);
      
      // Simulate receiving session data with simple string content
      act(() => {
        handleSessionUpdated({
          id: 'test-session-id',
          state: {
            conversationHistory: [
              {
                role: 'user',
                content: 'Hello' as unknown as SessionState['conversationHistory'][0]['content']
              },
              {
                role: 'assistant',
                content: 'Simple string response' as unknown as SessionState['conversationHistory'][0]['content']
              }
            ]
          } as SessionState
        });
      });
      
      // Verify a new message was added
      expect(screen.getByTestId('message-count').textContent)
        .toBe((initialCount + 1).toString());
    });

    it('does not process empty or non-assistant messages', () => {
      // Get the SESSION_UPDATED event handler
      const handleSessionUpdated = getEventHandler(WebSocketEvent.SESSION_UPDATED);
      
      // Initial message count
      const initialCount = Number(screen.getByTestId('message-count').textContent);
      
      // Simulate receiving session data with no assistant message
      act(() => {
        handleSessionUpdated({
          id: 'test-session-id',
          state: {
            conversationHistory: [
              {
                role: 'user',
                content: [{ type: 'text', text: 'Hello' }]
              }
              // No assistant message
            ]
          } as SessionState
        });
      });
      
      // Verify no new message was added
      expect(screen.getByTestId('message-count').textContent)
        .toBe(initialCount.toString());
      
      // Simulate receiving session data with empty assistant message
      act(() => {
        handleSessionUpdated({
          id: 'test-session-id',
          state: {
            conversationHistory: [
              {
                role: 'user',
                content: [{ type: 'text', text: 'Hello' }]
              },
              {
                role: 'assistant',
                content: [] // Empty content
              }
            ]
          } as SessionState
        });
      });
      
      // Verify no new message was added
      expect(screen.getByTestId('message-count').textContent)
        .toBe(initialCount.toString());
    });
  });
});