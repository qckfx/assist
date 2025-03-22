import { vi } from 'vitest';

// Create a registry to store callbacks
export const __mockCallbacks: Record<string, (((...args: any[]) => void)[])> = {};
export const __mockIoCallbacks: Record<string, (((...args: any[]) => void)[])> = {};

// Create a mockSocket object
export const mockSocket = {
  on: vi.fn((event: string, callback: (...args: any[]) => void) => {
    __mockCallbacks[event] = __mockCallbacks[event] || [];
    __mockCallbacks[event].push(callback);
    return mockSocket;
  }),
  
  off: vi.fn((event: string, callback: (...args: any[]) => void) => {
    if (__mockCallbacks[event]) {
      __mockCallbacks[event] = __mockCallbacks[event].filter(cb => cb !== callback);
    }
    return mockSocket;
  }),
  
  emit: vi.fn(),
  disconnect: vi.fn(),
  connect: vi.fn(),
  
  io: {
    on: vi.fn((event: string, callback: (...args: any[]) => void) => {
      __mockIoCallbacks[event] = __mockIoCallbacks[event] || [];
      __mockIoCallbacks[event].push(callback);
      return mockSocket.io;
    }),
    
    off: vi.fn((event: string, callback: (...args: any[]) => void) => {
      if (__mockIoCallbacks[event]) {
        __mockIoCallbacks[event] = __mockIoCallbacks[event].filter(cb => cb !== callback);
      }
      return mockSocket.io;
    }),
  }
};

// Export the io function
export const io = vi.fn(() => mockSocket);

// Helper functions to trigger events
export const __triggerEvent = (event: string, ...args: any[]) => {
  if (__mockCallbacks[event]) {
    __mockCallbacks[event].forEach(callback => callback(...args));
  }
};

export const __triggerIoEvent = (event: string, ...args: any[]) => {
  if (__mockIoCallbacks[event]) {
    __mockIoCallbacks[event].forEach(callback => callback(...args));
  }
};

// Clear all mocked callbacks
export const __clearMockCallbacks = () => {
  Object.keys(__mockCallbacks).forEach(key => {
    delete __mockCallbacks[key];
  });
  Object.keys(__mockIoCallbacks).forEach(key => {
    delete __mockIoCallbacks[key];
  });
};

// Export default for ESM
export default { io };