import { doesFrontendBuildExist, buildFrontendIfNeeded } from '../build';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('child_process');
jest.mock('../logger', () => ({
  serverLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Build Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default path.resolve mock
    (path.resolve as jest.Mock).mockImplementation((...args) => {
      return args.join('/');
    });
    
    // Default path.join mock
    (path.join as jest.Mock).mockImplementation((...args) => {
      return args.join('/');
    });
  });
  
  describe('doesFrontendBuildExist', () => {
    test('should return true if build directory exists and is not empty', () => {
      // Mock fs.existsSync to return true
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      
      // Mock fs.readdirSync to return an array of files
      (fs.readdirSync as jest.Mock).mockReturnValue(['index.html', 'bundle.js']);
      
      expect(doesFrontendBuildExist()).toBe(true);
      
      // Check that the correct path was checked
      expect(path.resolve).toHaveBeenCalledWith(expect.any(String), '../../dist/ui');
    });
    
    test('should return false if build directory does not exist', () => {
      // Mock fs.existsSync to return false
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      
      expect(doesFrontendBuildExist()).toBe(false);
    });
    
    test('should return false if build directory is empty', () => {
      // Mock fs.existsSync to return true
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      
      // Mock fs.readdirSync to return an empty array
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      
      expect(doesFrontendBuildExist()).toBe(false);
    });
  });
  
  describe('buildFrontendIfNeeded', () => {
    test('should not build if frontend already exists', () => {
      // Mock doesFrontendBuildExist to return true
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['index.html']);
      
      expect(buildFrontendIfNeeded()).toBe(true);
      
      // execSync should not be called
      expect(execSync).not.toHaveBeenCalled();
      // mkdirSync should not be called
      expect(fs.mkdirSync).not.toHaveBeenCalled();
      // writeFileSync should not be called
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
    
    test('should build frontend if it does not exist', () => {
      // Mock doesFrontendBuildExist to return false (directory doesn't exist)
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      
      // Mock mkdirSync and writeFileSync
      (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
      
      expect(buildFrontendIfNeeded()).toBe(true);
      
      // Check that mkdirSync and writeFileSync were called with correct arguments
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('index.html'), 
        expect.stringContaining('<!DOCTYPE html>')
      );
    });
    
    test('should handle errors during build', () => {
      // Mock doesFrontendBuildExist to return false
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      
      // Mock mkdirSync to throw an error
      const mockError = new Error('Permission denied');
      (fs.mkdirSync as jest.Mock).mockImplementation(() => {
        throw mockError;
      });
      
      expect(buildFrontendIfNeeded()).toBe(false);
      
      // Check that the error was logged
      const { serverLogger } = require('../logger');
      expect(serverLogger.error).toHaveBeenCalledWith('Failed to build frontend:', mockError);
    });
  });
});