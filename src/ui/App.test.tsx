import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils';
import App from './App';

describe('App', () => {
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
});