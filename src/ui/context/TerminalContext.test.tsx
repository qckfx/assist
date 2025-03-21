import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { TerminalProvider, useTerminal } from './TerminalContext';
import { describe, it, expect, vi } from 'vitest';

// Test component that uses the context
const TestComponent = () => {
  const { 
    state, 
    addUserMessage, 
    addAssistantMessage, 
    clearMessages, 
    setProcessing,
    addToHistory 
  } = useTerminal();
  
  return (
    <div>
      <div data-testid="message-count">{state.messages.length}</div>
      <div data-testid="history-count">{state.history.length}</div>
      <div data-testid="processing">{state.isProcessing ? 'true' : 'false'}</div>
      <button 
        data-testid="add-user-message" 
        onClick={() => addUserMessage('User message')}
      >
        Add User Message
      </button>
      <button 
        data-testid="add-assistant-message" 
        onClick={() => addAssistantMessage('Assistant message')}
      >
        Add Assistant Message
      </button>
      <button 
        data-testid="clear-messages" 
        onClick={() => clearMessages()}
      >
        Clear Messages
      </button>
      <button 
        data-testid="toggle-processing" 
        onClick={() => setProcessing(!state.isProcessing)}
      >
        Toggle Processing
      </button>
      <button 
        data-testid="add-to-history" 
        onClick={() => addToHistory('test command')}
      >
        Add To History
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
    
    // Initial state should have 3 messages: welcome, greeting, and example
    expect(screen.getByTestId('message-count').textContent).toBe('3');
    expect(screen.getByTestId('history-count').textContent).toBe('0');
    expect(screen.getByTestId('processing').textContent).toBe('false');
  });
  
  it('adds messages correctly', () => {
    render(
      <TerminalProvider>
        <TestComponent />
      </TerminalProvider>
    );
    
    act(() => {
      screen.getByTestId('add-user-message').click();
    });
    
    expect(screen.getByTestId('message-count').textContent).toBe('4');
    
    act(() => {
      screen.getByTestId('add-assistant-message').click();
    });
    
    expect(screen.getByTestId('message-count').textContent).toBe('5');
  });
  
  it('clears messages correctly', () => {
    render(
      <TerminalProvider>
        <TestComponent />
      </TerminalProvider>
    );
    
    act(() => {
      screen.getByTestId('add-user-message').click();
      screen.getByTestId('add-assistant-message').click();
    });
    
    expect(screen.getByTestId('message-count').textContent).toBe('5');
    
    act(() => {
      screen.getByTestId('clear-messages').click();
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
    
    expect(screen.getByTestId('processing').textContent).toBe('false');
    
    act(() => {
      screen.getByTestId('toggle-processing').click();
    });
    
    expect(screen.getByTestId('processing').textContent).toBe('true');
    
    act(() => {
      screen.getByTestId('toggle-processing').click();
    });
    
    expect(screen.getByTestId('processing').textContent).toBe('false');
  });
  
  it('adds to command history', () => {
    render(
      <TerminalProvider>
        <TestComponent />
      </TerminalProvider>
    );
    
    expect(screen.getByTestId('history-count').textContent).toBe('0');
    
    act(() => {
      screen.getByTestId('add-to-history').click();
    });
    
    expect(screen.getByTestId('history-count').textContent).toBe('1');
    
    // Adding the same command twice shouldn't increase the count
    act(() => {
      screen.getByTestId('add-to-history').click();
    });
    
    expect(screen.getByTestId('history-count').textContent).toBe('1');
  });
});