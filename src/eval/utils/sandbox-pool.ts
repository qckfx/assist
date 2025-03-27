/**
 * Sandbox pool for managing multiple E2B sandboxes
 */

import { Sandbox } from 'e2b';
import { createLogger, LogLevel } from '../../utils/logger';
import { E2BExecutionAdapter } from '../../utils/E2BExecutionAdapter';

// Create a logger for the sandbox pool
const logger = createLogger({
  level: LogLevel.INFO,
  prefix: 'SandboxPool'
});

/**
 * Creates a new E2B sandbox instance
 * 
 * @returns A configured sandbox instance
 */
export async function createSandbox(): Promise<Sandbox> {
  try {
    logger.info('Creating new sandbox instance');
    
    // Validate E2B API key
    if (!process.env.E2B_API_KEY) {
      throw new Error('E2B_API_KEY is required to create sandboxes');
    }
    
    // Create a basic sandbox with 5 minute timeout
    // This is only the sandbox shell without the full app initialization
    const sandbox = await Sandbox.create('base', { timeoutMs: 300000 });
    
    // Verify sandbox is ready with a simple command
    const cmdOpts = { timeoutMs: 30000 };
    const result = await sandbox.commands.run('echo "Sandbox ready"', cmdOpts);
    
    if (!result.stdout.includes('Sandbox ready')) {
      throw new Error('Failed to verify sandbox is ready');
    }
    
    logger.info(`Created sandbox with ID: ${sandbox.sandboxId}`);
    return sandbox;
  } catch (error) {
    logger.error('Failed to create sandbox', error);
    throw error;
  }
}

/**
 * Class for managing a pool of E2B sandboxes for parallel execution
 */
export class SandboxPool {
  private availableSandboxes: Sandbox[] = [];
  private busySandboxes: Map<Sandbox, boolean> = new Map();
  private initializationPromise: Promise<void> | null = null;
  private isShuttingDown = false;

  /**
   * Creates a new SandboxPool with the specified number of sandboxes
   * 
   * @param size Number of sandboxes to create in the pool
   */
  constructor(private size: number) {
    this.initializationPromise = this.initialize();
  }

  /**
   * Initialize the sandbox pool by creating the specified number of sandboxes
   */
  private async initialize(): Promise<void> {
    try {
      logger.info(`Initializing sandbox pool with ${this.size} sandboxes`);
      
      // Create all sandboxes in parallel
      const sandboxPromises = Array(this.size)
        .fill(0)
        .map(() => this.createAndAddSandbox());
      
      await Promise.all(sandboxPromises);
      
      logger.info(`Sandbox pool initialized with ${this.availableSandboxes.length} sandboxes`);
    } catch (error) {
      logger.error('Failed to initialize sandbox pool', error);
      throw error;
    }
  }

  /**
   * Create a single sandbox and add it to the available pool
   */
  private async createAndAddSandbox(): Promise<void> {
    try {
      const sandbox = await createSandbox();
      this.availableSandboxes.push(sandbox);
    } catch (error) {
      logger.error('Failed to create sandbox for pool', error);
      throw error;
    }
  }

  /**
   * Wait for the pool to finish initializing
   */
  async waitForInitialization(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  /**
   * Acquire a sandbox from the pool.
   * If no sandboxes are available, this will wait until one becomes available.
   * 
   * @param timeoutMs Optional timeout in milliseconds
   * @returns A sandbox instance or null if timeout is reached
   */
  async acquireSandbox(timeoutMs?: number): Promise<Sandbox | null> {
    // Wait for initialization to complete first
    await this.waitForInitialization();
    
    if (this.isShuttingDown) {
      throw new Error('Cannot acquire sandbox: pool is shutting down');
    }

    // If we have an available sandbox, return it immediately
    if (this.availableSandboxes.length > 0) {
      const sandbox = this.availableSandboxes.shift()!;
      this.busySandboxes.set(sandbox, true);
      return sandbox;
    }

    // If we don't have an available sandbox, we need to wait
    return new Promise((resolve, reject) => {
      // Set up timeout if specified
      const timeoutId = timeoutMs 
        ? setTimeout(() => {
            resolve(null);
          }, timeoutMs)
        : null;
      
      // Check for available sandbox every 100ms
      const interval = setInterval(() => {
        if (this.isShuttingDown) {
          clearInterval(interval);
          if (timeoutId) clearTimeout(timeoutId);
          reject(new Error('Cannot acquire sandbox: pool is shutting down'));
          return;
        }

        if (this.availableSandboxes.length > 0) {
          clearInterval(interval);
          if (timeoutId) clearTimeout(timeoutId);
          
          const sandbox = this.availableSandboxes.shift()!;
          this.busySandboxes.set(sandbox, true);
          resolve(sandbox);
        }
      }, 100);
    });
  }

  /**
   * Release a sandbox back to the pool
   * 
   * @param sandbox The sandbox to release
   */
  releaseSandbox(sandbox: Sandbox): void {
    if (this.busySandboxes.has(sandbox)) {
      this.busySandboxes.delete(sandbox);
      this.availableSandboxes.push(sandbox);
    }
  }

  /**
   * Get the number of available sandboxes
   */
  get availableCount(): number {
    return this.availableSandboxes.length;
  }

  /**
   * Get the number of busy sandboxes
   */
  get busyCount(): number {
    return this.busySandboxes.size;
  }

  /**
   * Get the total number of sandboxes in the pool
   */
  get totalCount(): number {
    return this.availableSandboxes.length + this.busySandboxes.size;
  }

  /**
   * Shutdown the sandbox pool, closing all sandboxes
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    // First wait for initialization to complete if it's still in progress
    await this.waitForInitialization();
    
    logger.info('Shutting down sandbox pool');
    
    // Close all available sandboxes
    const availableClosingPromises = this.availableSandboxes.map(async sandbox => {
      try {
        // Use the static kill method with the sandbox ID
        await Sandbox.kill(sandbox.sandboxId);
      } catch (error) {
        logger.error('Error closing available sandbox', error);
      }
    });
    
    // Close all busy sandboxes
    const busyClosingPromises = Array.from(this.busySandboxes.keys()).map(async sandbox => {
      try {
        // Use the static kill method with the sandbox ID
        await Sandbox.kill(sandbox.sandboxId);
      } catch (error) {
        logger.error('Error closing busy sandbox', error);
      }
    });
    
    // Wait for all sandboxes to close
    await Promise.all([...availableClosingPromises, ...busyClosingPromises]);
    
    // Clear the pool
    this.availableSandboxes = [];
    this.busySandboxes.clear();
    
    logger.info('Sandbox pool shutdown complete');
  }

  /**
   * Execute a function with a sandbox, then release the sandbox back to the pool
   * 
   * @param fn Function to execute with the sandbox
   * @param timeoutMs Optional timeout for acquiring a sandbox
   * @returns The result of the function execution
   */
  async withSandbox<T>(
    fn: (sandbox: Sandbox) => Promise<T>,
    timeoutMs?: number
  ): Promise<T> {
    const sandbox = await this.acquireSandbox(timeoutMs);
    
    if (!sandbox) {
      throw new Error('Failed to acquire sandbox: timeout reached');
    }
    
    try {
      return await fn(sandbox);
    } finally {
      this.releaseSandbox(sandbox);
    }
  }

  /**
   * Convert a Sandbox to an E2BExecutionAdapter
   * Useful for running agents in sandboxes from the pool
   * 
   * @param sandbox The sandbox to create an adapter for
   * @returns An E2BExecutionAdapter for the sandbox
   */
  async createExecutionAdapter(sandbox: Sandbox): Promise<E2BExecutionAdapter> {
    return await E2BExecutionAdapter.create(sandbox.sandboxId);
  }

  /**
   * Helper method to run a function with an execution adapter
   * 
   * @param fn Function to execute with the execution adapter
   * @param timeoutMs Optional timeout for acquiring a sandbox
   * @returns The result of the function execution
   */
  async withExecutionAdapter<T>(
    fn: (adapter: E2BExecutionAdapter) => Promise<T>,
    timeoutMs?: number
  ): Promise<T> {
    return this.withSandbox(async (sandbox) => {
      const adapter = await this.createExecutionAdapter(sandbox);
      return await fn(adapter);
    }, timeoutMs);
  }
}