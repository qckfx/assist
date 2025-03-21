import { render, screen } from '@testing-library/react';
import { Terminal } from './Terminal';
import { Message } from '@/components/MessageFeed';

const mockMessages: Message[] = [
  {
    id: '1',
    content: 'Test message',
    type: 'system',
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