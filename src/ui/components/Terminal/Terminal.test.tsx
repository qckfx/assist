import { render, screen } from '@testing-library/react';
import { Terminal } from './Terminal';

describe('Terminal Component', () => {
  it('renders correctly', () => {
    render(<Terminal />);
    
    const terminal = screen.getByTestId('terminal-container');
    expect(terminal).toBeInTheDocument();
  });

  it('renders with children', () => {
    render(
      <Terminal>
        <div data-testid="test-child">Test content</div>
      </Terminal>
    );
    
    const child = screen.getByTestId('test-child');
    expect(child).toBeInTheDocument();
    expect(child).toHaveTextContent('Test content');
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