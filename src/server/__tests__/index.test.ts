import { startServer } from '..';
import { ServerConfig } from '../config';
import express from 'express';
import http from 'http';

// Mock dependencies
jest.mock('express', () => {
  const mockExpress = jest.fn(() => mockApp);
  const mockApp = {
    use: jest.fn().mockReturnThis(),
    get: jest.fn().mockReturnThis(),
    listen: jest.fn(() => mockServer),
  };
  mockExpress.static = jest.fn();
  mockExpress.json = jest.fn(() => 'jsonMiddleware');
  mockExpress.urlencoded = jest.fn(() => 'urlencodedMiddleware');
  return mockExpress;
});

jest.mock('cors', () => jest.fn(() => 'corsMiddleware'));
jest.mock('body-parser', () => ({
  json: jest.fn(() => 'jsonMiddleware'),
  urlencoded: jest.fn(() => 'urlencodedMiddleware'),
}));
jest.mock('connect-history-api-fallback', () => jest.fn(() => 'historyMiddleware'));

jest.mock('../utils', () => ({
  findAvailablePort: jest.fn(async (port) => port),
  isPortAvailable: jest.fn(async () => true),
}));

jest.mock('../logger', () => ({
  serverLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock HTTP server
const mockServer = {
  close: jest.fn((cb) => cb()),
};

describe('Server', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('startServer', () => {
    test('should return early if server is disabled', async () => {
      const config: ServerConfig = {
        enabled: false,
        port: 3000,
        host: 'localhost',
      };
      
      const result = await startServer(config);
      expect(result).toEqual({
        close: expect.any(Function),
        url: '',
      });
      
      // The server should not be started
      expect(express().listen).not.toHaveBeenCalled();
    });
    
    test('should start the server if enabled', async () => {
      const config: ServerConfig = {
        enabled: true,
        port: 3000,
        host: 'localhost',
      };
      
      const result = await startServer(config);
      expect(result).toEqual({
        close: expect.any(Function),
        url: 'http://localhost:3000',
      });
      
      // Check middleware setup
      expect(express().use).toHaveBeenCalledWith('corsMiddleware');
      expect(express().use).toHaveBeenCalledWith('jsonMiddleware');
      expect(express().use).toHaveBeenCalledWith('urlencodedMiddleware');
      expect(express().use).toHaveBeenCalledWith('historyMiddleware');
      expect(express().use).toHaveBeenCalledWith(expect.any(Function)); // Error handler
      
      // Check routes
      expect(express().get).toHaveBeenCalledWith('/health', expect.any(Function));
      expect(express().get).toHaveBeenCalledWith('*', expect.any(Function));
      
      // Check server start
      expect(express().listen).toHaveBeenCalledWith(3000, 'localhost');
    });
    
    test('should close the server', async () => {
      const config: ServerConfig = {
        enabled: true,
        port: 3000,
        host: 'localhost',
      };
      
      const { close } = await startServer(config);
      await close();
      
      expect(mockServer.close).toHaveBeenCalled();
    });
  });
});