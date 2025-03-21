import { render, screen, fireEvent } from '@testing-library/react';
import { ShortcutsPanel } from './ShortcutsPanel';
import { KeyboardShortcut } from '@/hooks/useKeyboardShortcuts';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ShortcutsPanel Component', () => {
  const mockShortcuts: KeyboardShortcut[] = [
    {
      key: 'l',
      ctrlKey: true,
      action: vi.fn(),
      description: 'Clear terminal',
    },
    {
      key: 'k',
      action: vi.fn(),
      description: 'Clear input',
    },
    {
      key: '?',
      action: vi.fn(),
      description: 'Show shortcuts',
    },
  ];

  const mockOnClose = vi.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  it('renders nothing when closed', () => {
    render(
      <ShortcutsPanel
        shortcuts={mockShortcuts}
        isOpen={false}
        onClose={mockOnClose}
      />
    );

    expect(screen.queryByTestId('shortcuts-panel')).not.toBeInTheDocument();
  });

  it('renders shortcuts panel when open', () => {
    render(
      <ShortcutsPanel
        shortcuts={mockShortcuts}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByTestId('shortcuts-panel')).toBeInTheDocument();
    expect(screen.getByText('Clear terminal')).toBeInTheDocument();
    expect(screen.getByText('Ctrl + L')).toBeInTheDocument();
    expect(screen.getByText('Clear input')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(
      <ShortcutsPanel
        shortcuts={mockShortcuts}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    fireEvent.click(screen.getByTestId('close-shortcuts'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('renders empty state when no shortcuts are provided', () => {
    render(
      <ShortcutsPanel
        shortcuts={[]}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText('No shortcuts available')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <ShortcutsPanel
        shortcuts={mockShortcuts}
        isOpen={true}
        onClose={mockOnClose}
        className="test-class"
      />
    );

    expect(screen.getByTestId('shortcuts-panel')).toHaveClass('test-class');
  });
});