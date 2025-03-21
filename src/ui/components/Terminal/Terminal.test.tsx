import { render, screen, fireEvent } from '@testing-library/react';
import { Terminal } from './Terminal';
import { Message } from '@/components/MessageFeed';
import { describe, it, expect, vi } from 'vitest';

const mockMessages: Message[] = [
  {
    id: '1',
    content: 'Test message',
    type: 'system',
    timestamp: new Date(),
  },
  {
    id: '2',
    content: 'Message with \u001b[31mcolors\u001b[0m',
    type: 'tool',
    timestamp: new Date(),
  },
];

describe('Terminal Component', () => {
  it('renders correctly', () => {
    render(<Terminal />);
    
    const terminal = screen.getByTestId('terminal-container');
    expect(terminal).toBeInTheDocument();
  });

  it('renders with messages', () => {
    render(<Terminal messages={mockMessages} />);
    
    // The MessageFeed component will be tested separately
    // Here we just verify that the Terminal renders without errors
    const terminal = screen.getByTestId('terminal-container');
    expect(terminal).toBeInTheDocument();
  });

  it('calls onCommand when command is submitted', () => {
    const mockOnCommand = vi.fn();
    render(<Terminal onCommand={mockOnCommand} />);
    
    const input = screen.getByTestId('input-field');
    fireEvent.change(input, { target: { value: 'test command' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    
    expect(mockOnCommand).toHaveBeenCalledWith('test command');
  });

  it('disables input when inputDisabled is true', () => {
    render(<Terminal inputDisabled={true} />);
    
    const input = screen.getByTestId('input-field');
    expect(input).toBeDisabled();
  });

  it('applies fullScreen class when fullScreen is true', () => {
    render(<Terminal fullScreen={true} />);
    
    const terminal = screen.getByTestId('terminal-container');
    expect(terminal).toHaveClass('h-full w-full');
  });

  it('applies custom className', () => {
    render(<Terminal className="test-class" />);
    
    const terminal = screen.getByTestId('terminal-container');
    expect(terminal).toHaveClass('test-class');
  });
});