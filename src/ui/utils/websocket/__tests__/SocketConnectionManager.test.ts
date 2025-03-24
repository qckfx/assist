import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SocketConnectionManager, getSocketConnectionManager } from '../SocketConnectionManager';
import { ConnectionStatus, WebSocketEvent } from '../../../types/api';

// Mock Socket.io
vi.mock('socket.io-client', () => {
  const mockSocket = {
    on: vi.fn(),
    off: vi.fn(),
    offAny: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connect: vi.fn(),
    onAny: vi.fn(),
    io: {
      on: vi.fn(),
      off: vi.fn(),
    },
  };
  
  return {
    io: vi.fn(() => mockSocket),
  };
});

describe('SocketConnectionManager', () => {
  let manager: SocketConnectionManager;
  
  beforeEach(() => {
    // Reset any mocks
    vi.clearAllMocks();
    
    // Get a fresh instance
    manager = getSocketConnectionManager();
    manager.reset();
  });
  
  afterEach(() => {
    manager.reset();
  });

  it('should be a singleton', () => {
    const instance1 = SocketConnectionManager.getInstance();
    const instance2 = SocketConnectionManager.getInstance();
    
    expect(instance1).toBe(instance2);
  });
  
  it('should initialize with disconnected status', () => {
    expect(manager.getStatus()).toBe(ConnectionStatus.DISCONNECTED);
    expect(manager.isConnected()).toBe(false);
    expect(manager.getSocket()).toBe(null);
  });
  
  it('should create a socket on connect', () => {
    manager.connect();
    
    expect(manager.getStatus()).toBe(ConnectionStatus.CONNECTING);
    expect(manager.getSocket()).not.toBe(null);
  });
  
  it('should update status on socket events', () => {
    manager.connect();
    const socket = manager.getSocket();
    
    // Get the connect handler and call it
    const connectHandler = socket && vi.mocked(socket.on).mock.calls.find(
      call => call[0] === WebSocketEvent.CONNECT
    )?.[1] as Function;
    
    if (connectHandler) {
      connectHandler();
      expect(manager.getStatus()).toBe(ConnectionStatus.CONNECTED);
      expect(manager.isConnected()).toBe(true);
    } else {
      throw new Error('Connect handler not found');
    }
    
    // Get the disconnect handler and call it
    const disconnectHandler = socket && vi.mocked(socket.on).mock.calls.find(
      call => call[0] === WebSocketEvent.DISCONNECT
    )?.[1] as Function;
    
    if (disconnectHandler) {
      disconnectHandler('test reason');
      expect(manager.getStatus()).toBe(ConnectionStatus.DISCONNECTED);
      expect(manager.isConnected()).toBe(false);
    } else {
      throw new Error('Disconnect handler not found');
    }
  });
  
  it('should emit events on status changes', () => {
    const statusChangeHandler = vi.fn();
    manager.on('status_change', statusChangeHandler);
    
    manager.connect();
    
    // Simulate connect event
    const socket = manager.getSocket();
    
    if (!socket) {
      throw new Error('Socket should be defined at this point');
    }
    
    const connectHandler = vi.mocked(socket.on).mock.calls.find(
      call => call[0] === WebSocketEvent.CONNECT
    )?.[1] as Function;
    
    if (connectHandler) {
      connectHandler();
      expect(statusChangeHandler).toHaveBeenCalledWith(ConnectionStatus.CONNECTED);
    }
  });
  
  it('should join a session when connected', () => {
    manager.connect();
    
    // Simulate connect event
    const socket = manager.getSocket();
    
    if (!socket) {
      throw new Error('Socket should be defined at this point');
    }
    
    const connectHandler = vi.mocked(socket.on).mock.calls.find(
      call => call[0] === WebSocketEvent.CONNECT
    )?.[1] as Function;
    
    if (connectHandler) {
      connectHandler();
    }
    
    manager.joinSession('test-session');
    
    if (socket) {
      expect(socket.emit).toHaveBeenCalledWith(WebSocketEvent.JOIN_SESSION, 'test-session');
    }
    expect(manager.getCurrentSessionId()).toBe('test-session');
  });
  
  it('should store session ID for later when not connected', () => {
    // When not connected, getSocket() returns null, so we can't check emit
    manager.joinSession('test-session');
    
    expect(manager.getCurrentSessionId()).toBe('test-session');
    expect(manager.getSocket()).toBe(null);
  });
  
  it('should properly clean up on disconnect', () => {
    manager.connect();
    const socket = manager.getSocket();
    
    manager.disconnect();
    
    expect(socket?.offAny).toHaveBeenCalled();
    expect(socket?.disconnect).toHaveBeenCalled();
    expect(manager.getStatus()).toBe(ConnectionStatus.DISCONNECTED);
    expect(manager.getSocket()).toBe(null);
  });
});