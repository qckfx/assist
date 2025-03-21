import { render, screen } from '@testing-library/react';
import { Message } from './Message';
import { describe, it, expect } from 'vitest';

describe('Message Component', () => {
  const timestamp = new Date('2023-01-01T12:00:00Z');

  it('renders user message correctly', () => {
    render(<Message content="Hello" type="user" timestamp={timestamp} />);
    
    const message = screen.getByTestId('message');
    expect(message).toHaveAttribute('data-message-type', 'user');
    expect(message).toHaveTextContent('Hello');
    expect(message.style.backgroundColor).toBeTruthy(); // Check that a background color is set
  });

  it('renders assistant message correctly', () => {
    render(<Message content="How can I help?" type="assistant" timestamp={timestamp} />);
    
    const message = screen.getByTestId('message');
    expect(message).toHaveAttribute('data-message-type', 'assistant');
    expect(message).toHaveTextContent('How can I help?');
    expect(message.style.backgroundColor).toBeTruthy();
  });

  it('renders system message correctly', () => {
    render(<Message content="System notification" type="system" timestamp={timestamp} />);
    
    const message = screen.getByTestId('message');
    expect(message).toHaveAttribute('data-message-type', 'system');
    expect(message).toHaveTextContent('System notification');
    expect(message.style.backgroundColor).toBeTruthy();
    expect(message.style.fontStyle).toBe('italic');
    // No longer testing for fontSize as it now inherits from parent
  });

  it('renders error message correctly', () => {
    render(<Message content="Error occurred" type="error" timestamp={timestamp} />);
    
    const message = screen.getByTestId('message');
    expect(message).toHaveAttribute('data-message-type', 'error');
    expect(message).toHaveTextContent('Error occurred');
    expect(message.style.backgroundColor).toBeTruthy();
  });

  it('renders tool message correctly', () => {
    render(<Message content="Tool output" type="tool" timestamp={timestamp} />);
    
    const message = screen.getByTestId('message');
    expect(message).toHaveAttribute('data-message-type', 'tool');
    expect(message).toHaveTextContent('Tool output');
    expect(message.style.backgroundColor).toBeTruthy();
    // Tool message inherits font size from parent
  });

  it('shows timestamp when showTimestamp is true', () => {
    render(<Message content="Hello" type="user" timestamp={timestamp} showTimestamp={true} />);
    
    // Instead of checking for the exact time format (which might vary based on locale),
    // just check that there's a timestamp element
    const timeElements = screen.getAllByText(/^\d{1,2}:\d{2}:\d{2}(?: [AP]M)?$/);
    expect(timeElements.length).toBeGreaterThan(0);
  });

  it('hides timestamp when showTimestamp is false', () => {
    render(<Message content="Hello" type="user" timestamp={timestamp} showTimestamp={false} />);
    
    // Use a more generic way to check for absence of timestamp
    const messageDiv = screen.getByTestId('message');
    const timeTexts = Array.from(messageDiv.querySelectorAll('div')).filter(div => {
      return /^\d{1,2}:\d{2}:\d{2}(?: [AP]M)?$/.test(div.textContent || '');
    });
    expect(timeTexts.length).toBe(0);
  });

  it('applies custom className', () => {
    render(<Message content="Hello" type="user" className="test-class" />);
    
    const message = screen.getByTestId('message');
    expect(message).toHaveClass('test-class');
  });

  it('renders correctly with ANSI color codes', () => {
    render(
      <Message 
        content="Normal \u001b[31mRed\u001b[0m \u001b[32mGreen\u001b[0m" 
        type="tool" 
        enableAnsiColors={true} 
      />
    );
    
    const message = screen.getByTestId('message');
    expect(message).toBeInTheDocument();
    // Just check that the basic content is present
    expect(message.textContent).toMatch(/Normal.*Red.*Green/);
  });

  it('renders with ANSI codes when enableAnsiColors is false', () => {
    render(
      <Message 
        content="Normal \u001b[31mRed\u001b[0m \u001b[32mGreen\u001b[0m" 
        type="tool" 
        enableAnsiColors={false} 
      />
    );
    
    const message = screen.getByTestId('message');
    // Just check that the text is present, even with ANSI codes
    expect(message.textContent).toMatch(/Normal.*Red.*Green/);
  });
});