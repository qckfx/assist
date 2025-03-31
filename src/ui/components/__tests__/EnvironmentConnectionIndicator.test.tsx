import React from 'react';
import { render, screen } from '@testing-library/react';
import { EnvironmentConnectionIndicator } from '../EnvironmentConnectionIndicator';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';
import { useExecutionEnvironment } from '../../hooks/useExecutionEnvironment';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the hooks
vi.mock('../../hooks/useConnectionStatus');
vi.mock('../../hooks/useExecutionEnvironment');

describe('EnvironmentConnectionIndicator', () => {
  // Setup default mocks
  beforeEach(() => {
    vi.mocked(useConnectionStatus).mockReturnValue({
      status: 'connected',
      reconnectAttempts: 0,
      isConnected: true,
      isConnecting: false,
      isDisconnected: false,
      hasError: false,
      error: null,
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    });
    
    vi.mocked(useExecutionEnvironment).mockReturnValue({
      environment: 'local',
      isDocker: false,
      isLocal: true,
      isE2B: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render with connected status and local environment', () => {
    render(<EnvironmentConnectionIndicator />);
    
    // Check for environment label using more specific selector
    const label = screen.getByText('Local', { selector: '.text-xs.text-gray-500.font-mono' });
    expect(label).toBeInTheDocument();
    
    // Check it has the right accessible label
    const indicator = screen.getByTestId('environment-connection-indicator');
    expect(indicator).toHaveAttribute('aria-label', expect.stringContaining('Local environment: Connected'));
  });

  it('should render with docker environment', () => {
    vi.mocked(useExecutionEnvironment).mockReturnValue({
      environment: 'docker',
      isDocker: true,
      isLocal: false,
      isE2B: false,
    });
    
    render(<EnvironmentConnectionIndicator />);
    
    // Check for environment label with a specific selector
    const label = screen.getByText('Docker', { selector: '.text-xs.text-gray-500.font-mono' });
    expect(label).toBeInTheDocument();
    
    // Check it has the right accessible label
    const indicator = screen.getByTestId('environment-connection-indicator');
    expect(indicator).toHaveAttribute('aria-label', expect.stringContaining('Docker environment:'));
  });

  it('should show disconnected status correctly', () => {
    vi.mocked(useConnectionStatus).mockReturnValue({
      status: 'disconnected',
      reconnectAttempts: 0,
      isConnected: false,
      isConnecting: false,
      isDisconnected: true,
      hasError: false,
      error: null,
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    });
    
    render(<EnvironmentConnectionIndicator />);
    
    // Check it has the right accessible label
    const indicator = screen.getByTestId('environment-connection-indicator');
    expect(indicator).toHaveAttribute('aria-label', expect.stringContaining('Disconnected'));
  });

  it('should show error status correctly', () => {
    vi.mocked(useConnectionStatus).mockReturnValue({
      status: 'error',
      reconnectAttempts: 3,
      isConnected: false,
      isConnecting: false,
      isDisconnected: false,
      hasError: true,
      error: new Error('Connection failed'),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    });
    
    render(<EnvironmentConnectionIndicator />);
    
    // Check it has the right accessible label
    const indicator = screen.getByTestId('environment-connection-indicator');
    expect(indicator).toHaveAttribute('aria-label', expect.stringContaining('Error:'));
  });
});