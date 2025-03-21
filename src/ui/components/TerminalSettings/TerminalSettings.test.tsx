import { render, screen, fireEvent } from '@testing-library/react';
import { TerminalProvider } from '@/context/TerminalContext';
import { TerminalSettings } from './TerminalSettings';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('TerminalSettings Component', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  it('renders nothing when closed', () => {
    render(
      <TerminalProvider>
        <TerminalSettings isOpen={false} onClose={mockOnClose} />
      </TerminalProvider>
    );

    expect(screen.queryByTestId('terminal-settings')).not.toBeInTheDocument();
  });

  it('renders settings panel when open', () => {
    render(
      <TerminalProvider>
        <TerminalSettings isOpen={true} onClose={mockOnClose} />
      </TerminalProvider>
    );

    expect(screen.getByTestId('terminal-settings')).toBeInTheDocument();
    expect(screen.getByText('Font Family')).toBeInTheDocument();
    expect(screen.getByText('Font Size')).toBeInTheDocument();
    expect(screen.getByText(/Terminal Theme/)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(
      <TerminalProvider>
        <TerminalSettings isOpen={true} onClose={mockOnClose} />
      </TerminalProvider>
    );

    fireEvent.click(screen.getByTestId('close-settings'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Apply Settings button is clicked', () => {
    render(
      <TerminalProvider>
        <TerminalSettings isOpen={true} onClose={mockOnClose} />
      </TerminalProvider>
    );

    fireEvent.click(screen.getByText('Apply Settings'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('changes font family when selected', () => {
    render(
      <TerminalProvider>
        <TerminalSettings isOpen={true} onClose={mockOnClose} />
      </TerminalProvider>
    );

    const fontFamilySelect = screen.getByTestId('font-family-select');
    fireEvent.change(fontFamilySelect, { target: { value: '"Courier New", monospace' } });
    
    expect(fontFamilySelect).toHaveValue('"Courier New", monospace');
  });

  it('changes font size when selected', () => {
    render(
      <TerminalProvider>
        <TerminalSettings isOpen={true} onClose={mockOnClose} />
      </TerminalProvider>
    );

    const fontSizeSelect = screen.getByTestId('font-size-select');
    fireEvent.change(fontSizeSelect, { target: { value: 'lg' } });
    
    expect(fontSizeSelect).toHaveValue('lg');
  });

  it('changes color scheme when selected', () => {
    render(
      <TerminalProvider>
        <TerminalSettings isOpen={true} onClose={mockOnClose} />
      </TerminalProvider>
    );

    const colorSchemeSelect = screen.getByTestId('color-scheme-select');
    fireEvent.change(colorSchemeSelect, { target: { value: 'light' } });
    
    expect(colorSchemeSelect).toHaveValue('light');
  });
});