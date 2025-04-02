import React from 'react';
import { render, screen } from '@testing-library/react';
import { Message } from '../Message';
import { StructuredContent } from '../../../../types/message';

describe('Message Component', () => {
  it('renders user message correctly', () => {
    const content: StructuredContent = [{ type: 'text', text: 'User input' }];
    render(<Message content={content} type="user" />);
    
    const message = screen.getByTestId('message');
    expect(message).toHaveAttribute('data-message-type', 'user');
    expect(message).toHaveTextContent('User input');
  });
  
  it('renders assistant message correctly', () => {
    const content: StructuredContent = [{ type: 'text', text: 'Assistant response' }];
    render(<Message content={content} type="assistant" />);
    
    const message = screen.getByTestId('message');
    expect(message).toHaveAttribute('data-message-type', 'assistant');
    expect(message).toHaveTextContent('Assistant response');
  });
  
  it('renders system message correctly', () => {
    const content: StructuredContent = [{ type: 'text', text: 'System notification' }];
    render(<Message content={content} type="system" />);
    
    const message = screen.getByTestId('message');
    expect(message).toHaveAttribute('data-message-type', 'system');
    expect(message).toHaveTextContent('System notification');
  });
  
  it('renders error message correctly', () => {
    const content: StructuredContent = [{ type: 'text', text: 'Error occurred' }];
    render(<Message content={content} type="error" />);
    
    const message = screen.getByTestId('message');
    expect(message).toHaveAttribute('data-message-type', 'error');
    expect(message).toHaveTextContent('Error occurred');
    expect(message).toHaveAttribute('role', 'alert'); // Error messages should have alert role
  });
  
  // Tool message type has been removed and replaced with ToolVisualization component
  
  it('shows timestamp when provided', () => {
    const testDate = new Date('2023-01-01T12:00:00Z');
    const content: StructuredContent = [{ type: 'text', text: 'Message with time' }];
    render(<Message content={content} type="system" timestamp={testDate} />);
    
    // This will depend on the timezone setting of where the test runs
    // So we'll just check that the timestamp is rendered
    const messageWithTime = screen.getByTestId('message');
    expect(messageWithTime.textContent).toContain(testDate.toLocaleTimeString());
  });
  
  it('hides timestamp when showTimestamp is false', () => {
    const testDate = new Date('2023-01-01T12:00:00Z');
    const content: StructuredContent = [{ type: 'text', text: 'Message without time' }];
    render(
      <Message 
        content={content} 
        type="system" 
        timestamp={testDate} 
        showTimestamp={false} 
      />
    );
    
    const messageWithoutTime = screen.getByTestId('message');
    expect(messageWithoutTime.textContent).not.toContain(testDate.toLocaleTimeString());
  });
  
  it('applies custom className', () => {
    const content: StructuredContent = [{ type: 'text', text: 'Custom styled message' }];
    render(<Message content={content} type="user" className="test-class" />);
    
    const message = screen.getByTestId('message');
    expect(message).toHaveClass('test-class');
  });
  
  it('sets aria-label when provided', () => {
    const content: StructuredContent = [{ type: 'text', text: 'Accessible message' }];
    render(
      <Message 
        content={content} 
        type="system" 
        ariaLabel="This is a system message" 
      />
    );
    
    const message = screen.getByTestId('message');
    expect(message).toHaveAttribute('aria-label', 'This is a system message');
  });
  
  it('renders streaming content when isStreaming is true', () => {
    const content: StructuredContent = [{ type: 'text', text: 'This content should not be visible' }];
    render(
      <Message 
        content={content} 
        type="assistant" 
        isStreaming={true}
        streamingContent="Streaming content..."
      />
    );
    
    const message = screen.getByTestId('message');
    expect(message).toHaveAttribute('data-streaming', 'true');
    expect(message).toHaveClass('message-streaming');
    expect(message).toHaveTextContent('Streaming content...');
    expect(message).not.toHaveTextContent('This content should not be visible');
  });
  
  it('does not show timestamp when streaming', () => {
    const testDate = new Date('2023-01-01T12:00:00Z');
    const content: StructuredContent = [{ type: 'text', text: 'Original content' }];
    render(
      <Message 
        content={content} 
        type="assistant" 
        timestamp={testDate}
        isStreaming={true}
        streamingContent="Streaming content..." 
      />
    );
    
    const message = screen.getByTestId('message');
    expect(message.textContent).not.toContain(testDate.toLocaleTimeString());
  });
});