/**
 * Socket.io client mock for testing
 */
import { vi } from 'vitest';

// Mock Socket.io registry for managing event callbacks
export const mockSocketEvents: Record<string, Function[]> = {};
export const mockSocketIoEvents: Record<string, Function[]> = {};
export const mockEmittedEvents: Array<{ event: string; args: any[] }> = [];

// Create a mock Socket.io implementation
export const mockSocket = {
  on: vi.fn((event, callback) => {
    mockSocketEvents[event] = mockSocketEvents[event] || [];
    mockSocketEvents[event].push(callback);
    return mockSocket;
  }),
  
  off: vi.fn((event, callback) => {
    if (mockSocketEvents[event]) {
      mockSocketEvents[event] = mockSocketEvents[event].filter(cb => cb !== callback);
    }
    return mockSocket;
  }),
  
  emit: vi.fn((event, ...args) => {
    mockEmittedEvents.push({ event, args });
    return mockSocket;
  }),
  
  disconnect: vi.fn(),
  connect: vi.fn(),
  
  io: {
    on: vi.fn((event, callback) => {
      mockSocketIoEvents[event] = mockSocketIoEvents[event] || [];
      mockSocketIoEvents[event].push(callback);
      return mockSocket.io;
    }),
    
    off: vi.fn((event, callback) => {
      if (mockSocketIoEvents[event]) {
        mockSocketIoEvents[event] = mockSocketIoEvents[event].filter(cb => cb !== callback);
      }
      return mockSocket.io;
    }),
  },
  
  // Utility methods for testing
  _triggerEvent: (event, ...args) => {
    if (mockSocketEvents[event]) {
      mockSocketEvents[event].forEach(callback => callback(...args));
    }
  },
  
  _triggerIoEvent: (event, ...args) => {
    if (mockSocketIoEvents[event]) {
      mockSocketIoEvents[event].forEach(callback => callback(...args));
    }
  },
};

// Export the vi.mock setup function for Socket.io-client
export function setupSocketIoMock() {
  const ioMock = vi.fn(() => mockSocket);
  
  vi.mock('socket.io-client', () => ({
    io: ioMock,
    __esModule: true,
    default: { io: ioMock }
  }));
}

export default mockSocket;