/**
 * Socket.io client mock for testing
 */
import { vi } from 'vitest';

// Import Socket type for proper typing
import type { Socket } from 'socket.io-client';

// Mock Socket.io registry for managing event callbacks
export const mockSocketEvents: Record<string, ((...args: unknown[]) => void)[]> = {};
export const mockSocketIoEvents: Record<string, ((...args: unknown[]) => void)[]> = {};
export const mockEmittedEvents: Array<{ event: string; args: unknown[] }> = [];

// Define the type for our extended socket with trigger methods
type MockSocketWithTriggers = Partial<Socket> & {
  _triggerEvent: (event: string, ...args: unknown[]) => void;
  _triggerIoEvent: (event: string, ...args: unknown[]) => void;
};

// Create the base mock Socket
const baseMockSocket: Partial<Socket> = {
  on: vi.fn().mockImplementation((event: string | symbol, callback: (...args: unknown[]) => void) => {
    const eventKey = String(event);
    mockSocketEvents[eventKey] = mockSocketEvents[eventKey] || [];
    mockSocketEvents[eventKey].push(callback);
    return mockSocket as unknown as Socket;
  }),
  
  off: vi.fn().mockImplementation((event?: string | symbol, callback?: (...args: unknown[]) => void) => {
    if (event) {
      const eventKey = String(event);
      if (mockSocketEvents[eventKey] && callback) {
        mockSocketEvents[eventKey] = mockSocketEvents[eventKey].filter(cb => cb !== callback);
      } else if (mockSocketEvents[eventKey]) {
        delete mockSocketEvents[eventKey];
      }
    }
    return mockSocket as unknown as Socket;
  }),
  
  emit: vi.fn().mockImplementation((event: string, ...args: unknown[]) => {
    mockEmittedEvents.push({ event, args });
    return mockSocket as unknown as Socket;
  }),
  
  disconnect: vi.fn(),
  connect: vi.fn(),
  
  io: {
    on: vi.fn().mockImplementation((event: string, callback: (...args: unknown[]) => void) => {
      mockSocketIoEvents[event] = mockSocketIoEvents[event] || [];
      mockSocketIoEvents[event].push(callback);
      return mockSocket.io;
    }),
    
    off: vi.fn().mockImplementation((event?: string, callback?: (...args: unknown[]) => void) => {
      if (event) {
        if (mockSocketIoEvents[event] && callback) {
          mockSocketIoEvents[event] = mockSocketIoEvents[event].filter(cb => cb !== callback);
        } else if (mockSocketIoEvents[event]) {
          delete mockSocketIoEvents[event];
        }
      }
      return mockSocket.io;
    }),
    
    // Minimal Manager implementation to satisfy TypeScript
    engine: {},
    _autoConnect: true,
    _readyState: 'open',
    _reconnecting: false,
    uri: '',
    opts: {},
    nsps: {},
    subs: [],
    backoff: {
      ms: 1000,
      max: 5000
    },
    _reconnection: true,
    _reconnectionAttempts: Infinity,
    _reconnectionDelay: 1000,
    _reconnectionDelayMax: 5000,
    _randomizationFactor: 0.5,
    _timeout: 20000,
    // Additional required Manager properties
    encode: vi.fn(),
    decode: vi.fn(),
    autoConnect: true,
    path: '/socket.io',
    hostname: 'localhost',
    secure: false,
    port: '3000',
    query: {},
    timestampRequests: false,
    timestampParam: 't',
    supportsBinary: true,
    upgrade: true,
    forceJSONP: false,
    forceBase64: false,
    enablesXDR: false,
    withCredentials: false,
    randomizationFactor: 0.5,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    transports: ['polling', 'websocket'],
    transportOptions: {},
    readyState: 'open',
    connecting: [],
    connected: false,
    disconnected: true,
    emitAll: vi.fn(),
    updateSocketIds: vi.fn(),
    reconnect: vi.fn(),
    destroy: vi.fn(),
    packet: vi.fn(),
    processPacketQueue: vi.fn(),
    cleanup: vi.fn(),
    disconnect: vi.fn(),
    connect: vi.fn(),
    onclose: vi.fn(),
    onping: vi.fn(),
    ondata: vi.fn(),
    onerror: vi.fn(),
    ondecoded: vi.fn(),
    open: vi.fn(),
    onopen: vi.fn(),
    onreconnect: vi.fn()
  } as unknown as Socket['io']
};

// Create the mock socket with trigger methods
export const mockSocket = baseMockSocket as MockSocketWithTriggers;

// Add trigger methods
mockSocket._triggerEvent = (event: string, ...args: unknown[]): void => {
  if (mockSocketEvents[event]) {
    mockSocketEvents[event].forEach(callback => callback(...args));
  }
};

mockSocket._triggerIoEvent = (event: string, ...args: unknown[]): void => {
  if (mockSocketIoEvents[event]) {
    mockSocketIoEvents[event].forEach(callback => callback(...args));
  }
};

// Export the vi.mock setup function for Socket.io-client
export function setupSocketIoMock(): void {
  const ioMock = vi.fn((): Socket => mockSocket as unknown as Socket);
  
  vi.mock('socket.io-client', () => ({
    io: ioMock,
    __esModule: true,
    default: { io: ioMock }
  }));
}

export default mockSocket;