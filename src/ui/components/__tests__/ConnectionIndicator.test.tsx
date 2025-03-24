import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectionIndicator } from '../ConnectionIndicator';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';
import { vi } from 'vitest';

// Mock the useConnectionStatus hook
vi.mock('../../hooks/useConnectionStatus', () => ({
  useConnectionStatus: vi.fn(() => ({
    status: 'connected',
    error: null,
    connect: vi.fn(),
    isConnected: true
  })),
}));

describe('ConnectionIndicator Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('renders the connection indicator with connected status', () => {
    const mockConnect = vi.fn();
    (useConnectionStatus as jest.Mock).mockReturnValue({
      status: 'connected',
      error: null,
      connect: mockConnect,
      isConnected: true
    });
    
    render(<ConnectionIndicator />);
    
    expect(screen.getByText('Connected')).toBeInTheDocument();
    const indicator = screen.getByRole('button');
    expect(indicator).toHaveAttribute('aria-label', 'Connection status: Connected. Click to reconnect.');
  });
  
  it('renders with disconnected status', () => {
    const mockConnect = vi.fn();
    (useConnectionStatus as jest.Mock).mockReturnValue({
      status: 'disconnected',
      error: null,
      connect: mockConnect,
      isConnected: false
    });
    
    render(<ConnectionIndicator />);
    
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });
  
  it('renders with connecting status', () => {
    const mockConnect = vi.fn();
    (useConnectionStatus as jest.Mock).mockReturnValue({
      status: 'connecting',
      reconnectAttempts: 1,
      error: null,
      connect: mockConnect,
      isConnected: false,
      isConnecting: true
    });
    
    render(<ConnectionIndicator />);
    
    expect(screen.getByText('Connecting...')).toBeInTheDocument();
  });
  
  it('calls connect when clicked', () => {
    const mockConnect = vi.fn();
    (useConnectionStatus as jest.Mock).mockReturnValue({
      status: 'disconnected',
      error: null,
      connect: mockConnect,
      isConnected: false
    });
    
    render(<ConnectionIndicator />);
    
    fireEvent.click(screen.getByRole('button'));
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });
  
  it('hides text when showText is false', () => {
    const mockConnect = vi.fn();
    (useConnectionStatus as jest.Mock).mockReturnValue({
      status: 'connected',
      error: null,
      connect: mockConnect,
      isConnected: true
    });
    
    render(<ConnectionIndicator showText={false} />);
    
    expect(screen.queryByText('Connected')).not.toBeInTheDocument();
  });
});