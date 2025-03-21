import { render, screen, fireEvent } from '@testing-library/react';
import { InputField } from './InputField';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('InputField Component', () => {
  const mockSubmit = vi.fn();
  
  beforeEach(() => {
    mockSubmit.mockClear();
  });

  it('renders correctly', () => {
    render(<InputField onSubmit={mockSubmit} />);
    
    expect(screen.getByTestId('input-field')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type a command...')).toBeInTheDocument();
  });

  it('handles input change', () => {
    render(<InputField onSubmit={mockSubmit} />);
    
    const input = screen.getByTestId('input-field');
    fireEvent.change(input, { target: { value: 'test command' } });
    
    expect(input).toHaveValue('test command');
  });

  it('calls onSubmit when Enter is pressed', () => {
    render(<InputField onSubmit={mockSubmit} />);
    
    const input = screen.getByTestId('input-field');
    fireEvent.change(input, { target: { value: 'test command' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    
    expect(mockSubmit).toHaveBeenCalledWith('test command');
    expect(input).toHaveValue(''); // Input should be cleared after submit
  });

  it('does not call onSubmit when input is empty', () => {
    render(<InputField onSubmit={mockSubmit} />);
    
    const input = screen.getByTestId('input-field');
    fireEvent.keyDown(input, { key: 'Enter' });
    
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('does not call onSubmit when disabled', () => {
    render(<InputField onSubmit={mockSubmit} disabled />);
    
    const input = screen.getByTestId('input-field');
    fireEvent.change(input, { target: { value: 'test command' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(input).toBeDisabled();
  });

  it('clears input when Escape is pressed', () => {
    render(<InputField onSubmit={mockSubmit} />);
    
    const input = screen.getByTestId('input-field');
    fireEvent.change(input, { target: { value: 'test command' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    
    expect(input).toHaveValue('');
  });

  it('navigates command history with arrow keys', () => {
    render(<InputField onSubmit={mockSubmit} />);
    
    const input = screen.getByTestId('input-field');
    
    // Submit two commands to build history
    fireEvent.change(input, { target: { value: 'first command' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    
    fireEvent.change(input, { target: { value: 'second command' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    
    // Navigate up in history
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveValue('second command');
    
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveValue('first command');
    
    // Navigate down in history
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveValue('second command');
    
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveValue(''); // Back to empty input
  });

  it('applies custom className', () => {
    render(<InputField onSubmit={mockSubmit} className="test-class" />);
    
    const container = screen.getByTestId('input-field-container');
    expect(container).toHaveClass('test-class');
  });

  it('uses custom placeholder', () => {
    render(<InputField onSubmit={mockSubmit} placeholder="Custom placeholder" />);
    
    expect(screen.getByPlaceholderText('Custom placeholder')).toBeInTheDocument();
  });
});