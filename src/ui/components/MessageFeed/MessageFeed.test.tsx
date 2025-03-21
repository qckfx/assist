import { render, screen } from '@testing-library/react';
import { MessageFeed, type Message } from './MessageFeed';

describe('MessageFeed Component', () => {
  const mockMessages: Message[] = [
    {
      id: '1',
      content: 'Hello, this is a user message',
      type: 'user',
      timestamp: new Date('2023-01-01T12:00:00Z'),
    },
    {
      id: '2',
      content: 'This is a response from the assistant',
      type: 'assistant',
      timestamp: new Date('2023-01-01T12:01:00Z'),
    },
    {
      id: '3',
      content: 'System notification',
      type: 'system',
      timestamp: new Date('2023-01-01T12:02:00Z'),
    },
    {
      id: '4',
      content: 'Error message',
      type: 'error',
      timestamp: new Date('2023-01-01T12:03:00Z'),
    },
  ];

  it('renders empty state when no messages', () => {
    render(<MessageFeed messages={[]} />);
    
    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });

  it('renders all messages with correct styling', () => {
    render(<MessageFeed messages={mockMessages} />);
    
    mockMessages.forEach((message) => {
      const messageElement = screen.getByTestId(`message-${message.id}`);
      expect(messageElement).toBeInTheDocument();
      expect(messageElement).toHaveTextContent(message.content);
      
      // Check for appropriate styling classes based on message type
      if (message.type === 'user') {
        expect(messageElement).toHaveClass('bg-blue-950');
      } else if (message.type === 'assistant') {
        expect(messageElement).toHaveClass('bg-gray-800');
      } else if (message.type === 'system') {
        expect(messageElement).toHaveClass('bg-gray-700');
      } else if (message.type === 'error') {
        expect(messageElement).toHaveClass('bg-red-900');
      }
    });
  });

  it('applies custom className', () => {
    render(<MessageFeed messages={mockMessages} className="test-class" />);
    
    const messageFeed = screen.getByTestId('message-feed');
    expect(messageFeed).toHaveClass('test-class');
  });

  // Note: Testing auto-scrolling would require more complex tests
  // with Jest DOM interactions or a dedicated E2E test
});