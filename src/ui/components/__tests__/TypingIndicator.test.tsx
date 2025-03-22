import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { TypingIndicator } from '../TypingIndicator';

// Mock the useAgentEvents hook
vi.mock('../../hooks/useAgentEvents', () => ({
  useAgentEvents: () => ({
    isProcessing: true
  })
}));

describe('TypingIndicator Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  
  afterEach(() => {
    vi.useRealTimers();
  });
  
  it('renders with default props', () => {
    render(<TypingIndicator />);
    
    expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();
    expect(screen.getByText(/Agent is thinking/)).toBeInTheDocument();
  });
  
  it('renders with custom className', () => {
    render(<TypingIndicator className="custom-class" />);
    
    const indicator = screen.getByTestId('typing-indicator');
    expect(indicator).toHaveClass('custom-class');
  });
  
  it('has the correct accessibility attributes', () => {
    render(<TypingIndicator />);
    
    const indicator = screen.getByTestId('typing-indicator');
    expect(indicator).toHaveAttribute('role', 'status');
    expect(indicator).toHaveAttribute('aria-label', 'Agent is thinking');
    expect(indicator).toHaveAttribute('aria-live', 'polite');
  });
});