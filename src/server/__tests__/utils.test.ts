import { isPortAvailable, findAvailablePort } from '../utils';
import * as net from 'net';

// Mock net module
jest.mock('net', () => {
  const mockedNet = {
    createServer: jest.fn().mockReturnValue({
      once: jest.fn(),
      listen: jest.fn(),
      close: jest.fn(),
    }),
  };
  return mockedNet;
});

describe('Server Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('isPortAvailable', () => {
    test('should return true if port is available', async () => {
      const mockServer = net.createServer();
      mockServer.once.mockImplementation((event, cb) => {
        if (event === 'listening') {
          setTimeout(cb, 0);
        }
        return mockServer;
      });
      
      const result = await isPortAvailable(3000);
      expect(result).toBe(true);
      expect(mockServer.once).toHaveBeenCalledWith('listening', expect.any(Function));
      expect(mockServer.listen).toHaveBeenCalledWith(3000);
    });
    
    test('should return false if port is not available', async () => {
      const mockServer = net.createServer();
      mockServer.once.mockImplementation((event, cb) => {
        if (event === 'error') {
          setTimeout(cb, 0);
        }
        return mockServer;
      });
      
      const result = await isPortAvailable(3000);
      expect(result).toBe(false);
      expect(mockServer.once).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });
  
  describe('findAvailablePort', () => {
    test('should return the start port if it is available', async () => {
      const mockServer = net.createServer();
      mockServer.once.mockImplementation((event, cb) => {
        if (event === 'listening') {
          setTimeout(cb, 0);
        }
        return mockServer;
      });
      
      const result = await findAvailablePort(3000);
      expect(result).toBe(3000);
    });
    
    test('should find the next available port', async () => {
      let callCount = 0;
      const mockServer = net.createServer();
      mockServer.once.mockImplementation((event, cb) => {
        callCount++;
        if (event === 'listening' && callCount > 2) {
          setTimeout(cb, 0);
          return mockServer;
        } else if (event === 'error' && callCount <= 2) {
          setTimeout(cb, 0);
          return mockServer;
        }
        return mockServer;
      });
      
      const result = await findAvailablePort(3000);
      expect(result).toBe(3002);
    });
    
    test('should throw an error if no port is available after 10 attempts', async () => {
      const mockServer = net.createServer();
      mockServer.once.mockImplementation((event, cb) => {
        if (event === 'error') {
          setTimeout(cb, 0);
        }
        return mockServer;
      });
      
      await expect(findAvailablePort(3000)).rejects.toThrow('Could not find an available port');
    });
  });
});