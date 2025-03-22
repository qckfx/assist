import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectionIndicator } from '../ConnectionIndicator';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';
import { ConnectionStatus } from '../../types/api';
import { vi } from 'vitest';

// Mock the useConnectionStatus hook
vi.mock('../../hooks/useConnectionStatus', () => ({
  useConnectionStatus: vi.fn(() => ({
    connectionStatus: ConnectionStatus.CONNECTED,
    statusMessage: 'Connected',
    attemptReconnect: vi.fn(),
  })),
}));

describe('ConnectionIndicator Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('renders the connection indicator with connected status', () => {
    (useConnectionStatus as jest.Mock).mockReturnValue({
      connectionStatus: ConnectionStatus.CONNECTED,
      statusMessage: 'Connected',
      attemptReconnect: vi.fn(),
    });
    
    render(<ConnectionIndicator />);
    
    expect(screen.getByText('Connected')).toBeInTheDocument();
    const indicator = screen.getByRole('button');
    expect(indicator).toHaveAttribute('aria-label', 'Connection status: Connected. Click to reconnect.');
  });
  
  it('renders with disconnected status', () => {
    (useConnectionStatus as jest.Mock).mockReturnValue({
      connectionStatus: ConnectionStatus.DISCONNECTED,
      statusMessage: 'Disconnected',
      attemptReconnect: vi.fn(),
    });
    
    render(<ConnectionIndicator />);
    
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });
  
  it('renders with reconnecting status', () => {
    (useConnectionStatus as jest.Mock).mockReturnValue({
      connectionStatus: ConnectionStatus.RECONNECTING,
      statusMessage: 'Reconnecting (Attempt 1)',
      attemptReconnect: vi.fn(),
    });
    
    render(<ConnectionIndicator />);
    
    expect(screen.getByText('Reconnecting (Attempt 1)')).toBeInTheDocument();
  });
  
  it('calls attemptReconnect when clicked', () => {
    const mockAttemptReconnect = vi.fn();
    (useConnectionStatus as jest.Mock).mockReturnValue({
      connectionStatus: ConnectionStatus.DISCONNECTED,
      statusMessage: 'Disconnected',
      attemptReconnect: mockAttemptReconnect,
    });
    
    render(<ConnectionIndicator />);
    
    fireEvent.click(screen.getByRole('button'));
    expect(mockAttemptReconnect).toHaveBeenCalledTimes(1);
  });
  
  it('hides text when showText is false', () => {
    (useConnectionStatus as jest.Mock).mockReturnValue({
      connectionStatus: ConnectionStatus.CONNECTED,
      statusMessage: 'Connected',
      attemptReconnect: vi.fn(),
    });
    
    render(<ConnectionIndicator showText={false} />);
    
    expect(screen.queryByText('Connected')).not.toBeInTheDocument();
  });
});