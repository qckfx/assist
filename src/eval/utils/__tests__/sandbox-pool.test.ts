/**
 * Tests for the SandboxPool utility
 */

import { Sandbox } from 'e2b';
import { SandboxPool, createSandbox } from '../sandbox-pool';
import { E2BExecutionAdapter } from '../../../utils/E2BExecutionAdapter';

// Mock the e2b Sandbox
jest.mock('e2b', () => {
  return {
    Sandbox: {
      create: jest.fn().mockImplementation(async () => {
        return {
          sandboxId: `sandbox-${Math.random().toString(36).substring(2, 9)}`,
          commands: {
            run: jest.fn().mockResolvedValue({
              stdout: 'Sandbox ready',
              stderr: '',
              exitCode: 0
            })
          }
        };
      }),
      connect: jest.fn().mockImplementation(async (sandboxId) => {
        return {
          sandboxId,
          commands: {
            run: jest.fn().mockResolvedValue({
              stdout: 'Sandbox connected',
              stderr: '',
              exitCode: 0
            })
          }
        };
      }),
      kill: jest.fn().mockResolvedValue(undefined)
    }
  };
});

// Mock the E2BExecutionAdapter
jest.mock('../../../utils/E2BExecutionAdapter', () => {
  return {
    E2BExecutionAdapter: {
      create: jest.fn().mockImplementation(async (sandboxId) => {
        return {
          sandboxId,
          execute: jest.fn()
        };
      })
    }
  };
});

// Mock the sandbox.ts module
jest.mock('../sandbox', () => {
  return {
    initializeSandbox: jest.fn().mockImplementation(async () => {
      const sandboxId = `sandbox-${Math.random().toString(36).substring(2, 9)}`;
      return {
        sandboxId,
        executionAdapter: {
          sandboxId,
          execute: jest.fn()
        }
      };
    }),
    resetSandbox: jest.fn().mockImplementation(async (sandboxId) => {
      return {
        sandboxId,
        execute: jest.fn()
      };
    }),
    cleanupSandbox: jest.fn().mockResolvedValue(undefined)
  };
});

describe('SandboxPool', () => {
  // Store the original process.env.E2B_API_KEY
  const originalApiKey = process.env.E2B_API_KEY;
  
  beforeEach(() => {
    // Set a mock API key for tests
    process.env.E2B_API_KEY = 'test-api-key';
    
    // Clear all mock calls
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    // Restore the original API key
    process.env.E2B_API_KEY = originalApiKey;
  });
  
  describe('createSandbox', () => {
    it('should create a sandbox instance with proper initialization', async () => {
      const { initializeSandbox } = require('../sandbox');
      const sandboxInfo = await createSandbox();
      
      // Verify initializeSandbox was called
      expect(initializeSandbox).toHaveBeenCalled();
      
      // Verify we get a complete sandbox info object
      expect(sandboxInfo).toBeDefined();
      expect(sandboxInfo.sandbox).toBeDefined();
      expect(sandboxInfo.sandboxId).toBeDefined();
      expect(sandboxInfo.executionAdapter).toBeDefined();
    });
    
    it('should throw an error if initializeSandbox fails', async () => {
      // Mock initializeSandbox to fail
      const { initializeSandbox } = require('../sandbox');
      initializeSandbox.mockRejectedValueOnce(new Error('Initialization failed'));
      
      // Expect the createSandbox function to throw
      await expect(createSandbox()).rejects.toThrow('Initialization failed');
    });
  });
  
  describe('SandboxPool initialization', () => {
    it('should create the specified number of sandboxes', async () => {
      const pool = new SandboxPool(3);
      
      // Wait for initialization to complete
      await pool.waitForInitialization();
      
      // Verify Sandbox.create was called 3 times
      expect(Sandbox.create).toHaveBeenCalledTimes(3);
      
      // Verify pool counts
      expect(pool.availableCount).toBe(3);
      expect(pool.busyCount).toBe(0);
      expect(pool.totalCount).toBe(3);
    });
  });
  
  describe('acquireSandbox and releaseSandbox', () => {
    it('should acquire and release sandboxes correctly', async () => {
      const pool = new SandboxPool(2);
      await pool.waitForInitialization();
      
      // Acquire a sandbox
      const sandboxInfo1 = await pool.acquireSandbox();
      
      // Verify counts
      expect(pool.availableCount).toBe(1);
      expect(pool.busyCount).toBe(1);
      
      // Acquire another sandbox
      const sandboxInfo2 = await pool.acquireSandbox();
      
      // Verify counts
      expect(pool.availableCount).toBe(0);
      expect(pool.busyCount).toBe(2);
      
      // Release the first sandbox
      await pool.releaseSandbox(sandboxInfo1!.sandboxId, false); // Skip reset for test
      
      // Verify counts
      expect(pool.availableCount).toBe(1);
      expect(pool.busyCount).toBe(1);
      
      // Release the second sandbox
      await pool.releaseSandbox(sandboxInfo2!.sandboxId, false); // Skip reset for test
      
      // Verify counts
      expect(pool.availableCount).toBe(2);
      expect(pool.busyCount).toBe(0);
    });
    
    it('should reset sandbox when releasing with reset flag', async () => {
      const { resetSandbox } = require('../sandbox');
      
      const pool = new SandboxPool(1);
      await pool.waitForInitialization();
      
      // Acquire the sandbox
      const sandboxInfo = await pool.acquireSandbox();
      
      // Release with reset
      await pool.releaseSandbox(sandboxInfo!.sandboxId, true);
      
      // Verify resetSandbox was called
      expect(resetSandbox).toHaveBeenCalledWith(sandboxInfo!.sandboxId, expect.anything());
    });
    
    it('should honor timeouts when acquiring sandboxes', async () => {
      // Create a pool with 1 sandbox
      const pool = new SandboxPool(1);
      await pool.waitForInitialization();
      
      // Acquire the only sandbox
      const sandboxInfo = await pool.acquireSandbox();
      expect(sandboxInfo).toBeDefined();
      
      // Try to acquire another sandbox with a short timeout
      const start = Date.now();
      const anotherSandboxInfo = await pool.acquireSandbox(100);
      const elapsed = Date.now() - start;
      
      // Verify timeout behavior
      expect(anotherSandboxInfo).toBeNull();
      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(elapsed).toBeLessThan(500); // Should not wait too long
    });
  });
  
  describe('withSandbox', () => {
    it('should execute a function with a sandbox and release it', async () => {
      const pool = new SandboxPool(1);
      await pool.waitForInitialization();
      
      // Mock function to execute
      const mockFn = jest.fn().mockResolvedValue('result');
      
      // Execute the function with a sandbox
      const result = await pool.withSandbox(mockFn, false); // Skip reset for test
      
      // Verify function was called with a sandbox info object
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn.mock.calls[0][0]).toBeDefined();
      expect(mockFn.mock.calls[0][0].sandbox).toBeDefined();
      expect(mockFn.mock.calls[0][0].sandboxId).toBeDefined();
      expect(mockFn.mock.calls[0][0].executionAdapter).toBeDefined();
      
      // Verify sandbox was released
      expect(pool.availableCount).toBe(1);
      expect(pool.busyCount).toBe(0);
      
      // Verify function result
      expect(result).toBe('result');
    });
    
    it('should release the sandbox even if the function throws', async () => {
      const pool = new SandboxPool(1);
      await pool.waitForInitialization();
      
      // Mock function that throws
      const mockFn = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      
      // Execute the function with a sandbox, expect it to throw
      await expect(pool.withSandbox(mockFn, false)).rejects.toThrow('Test error');
      
      // Verify function was called
      expect(mockFn).toHaveBeenCalledTimes(1);
      
      // Verify sandbox was released despite the error
      expect(pool.availableCount).toBe(1);
      expect(pool.busyCount).toBe(0);
    });
  });
  
  describe('withConsecutiveOperations', () => {
    it('should run multiple operations on the same sandbox', async () => {
      const pool = new SandboxPool(1);
      await pool.waitForInitialization();
      
      // First operation function
      const firstOperation = jest.fn().mockImplementation(async (sandboxInfo) => {
        // Return a function for the second operation
        return async (sameInfo) => {
          // Verify it's the same sandbox
          expect(sameInfo.sandboxId).toBe(sandboxInfo.sandboxId);
          return 'second result';
        };
      });
      
      // Execute consecutive operations
      const result = await pool.withConsecutiveOperations(firstOperation);
      
      // Verify first operation was called
      expect(firstOperation).toHaveBeenCalledTimes(1);
      
      // Verify result from second operation
      expect(result).toBe('second result');
      
      // Verify sandbox was released
      expect(pool.availableCount).toBe(1);
      expect(pool.busyCount).toBe(0);
    });
  });
  
  describe('shutdown', () => {
    it('should close all sandboxes', async () => {
      const { cleanupSandbox } = require('../sandbox');
      
      const pool = new SandboxPool(3);
      await pool.waitForInitialization();
      
      // Verify we have 3 sandboxes
      expect(pool.totalCount).toBe(3);
      
      // Acquire one sandbox to test closing both available and busy sandboxes
      const sandboxInfo = await pool.acquireSandbox();
      
      // Verify counts
      expect(pool.availableCount).toBe(2);
      expect(pool.busyCount).toBe(1);
      
      // Shutdown the pool
      await pool.shutdown();
      
      // Verify all sandboxes are closed
      expect(pool.availableCount).toBe(0);
      expect(pool.busyCount).toBe(0);
      expect(pool.totalCount).toBe(0);
      
      // Should have called cleanupSandbox 3 times (once for each sandbox)
      expect(cleanupSandbox).toHaveBeenCalledTimes(3);
    });
    
    it('should reject new sandbox requests after shutdown', async () => {
      const pool = new SandboxPool(1);
      await pool.waitForInitialization();
      
      // Shutdown the pool
      await pool.shutdown();
      
      // Try to acquire a sandbox after shutdown
      await expect(pool.acquireSandbox()).rejects.toThrow('pool is shutting down');
    });
  });
  
  describe('withExecutionAdapter', () => {
    it('should execute a function with an execution adapter', async () => {
      const pool = new SandboxPool(1);
      await pool.waitForInitialization();
      
      // Mock function to execute
      const mockFn = jest.fn().mockResolvedValue('result');
      
      // Execute the function with an execution adapter
      const result = await pool.withExecutionAdapter(mockFn, false); // Skip reset for test
      
      // Verify function was called with an adapter
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn.mock.calls[0][0]).toBeDefined();
      
      // Verify sandbox was released
      expect(pool.availableCount).toBe(1);
      expect(pool.busyCount).toBe(0);
      
      // Verify function result
      expect(result).toBe('result');
    });
    
    it('should reset sandbox after use when flag is set', async () => {
      const { resetSandbox } = require('../sandbox');
      
      const pool = new SandboxPool(1);
      await pool.waitForInitialization();
      
      // Mock function to execute
      const mockFn = jest.fn().mockResolvedValue('result');
      
      // Execute the function with an execution adapter and reset
      await pool.withExecutionAdapter(mockFn, true);
      
      // Verify resetSandbox was called
      expect(resetSandbox).toHaveBeenCalled();
    });
  });
});