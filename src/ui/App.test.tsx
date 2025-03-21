import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@/test/utils';
import App from './App';

describe('App', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText(/Welcome to QCKFX Terminal/i)).toBeInTheDocument();
  });

  it('displays the assistant message', () => {
    render(<App />);
    expect(screen.getByText(/How can I help you today?/i)).toBeInTheDocument();
  });

  it('renders the terminal component', () => {
    render(<App />);
    expect(screen.getByTestId('terminal-container')).toBeInTheDocument();
  });

  it('handles user commands and displays responses', () => {
    render(<App />);
    
    // Find the input field
    const inputField = screen.getByTestId('input-field');
    
    // Type a command
    act(() => {
      fireEvent.change(inputField, { target: { value: 'hello world' } });
      // Submit the command
      fireEvent.keyDown(inputField, { key: 'Enter' });
    });
    
    // Verify user message is displayed
    expect(screen.getByText('hello world')).toBeInTheDocument();
    
    // Fast-forward timer to trigger the response
    act(() => {
      vi.advanceTimersByTime(500);
    });
    
    // Verify response is displayed
    expect(screen.getByText('You said: hello world')).toBeInTheDocument();
  });
});