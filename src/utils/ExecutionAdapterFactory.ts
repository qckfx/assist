import { ExecutionAdapter } from '../types/tool';
import { LocalExecutionAdapter } from './LocalExecutionAdapter';
import { DockerExecutionAdapter } from './DockerExecutionAdapter';
import { DockerContainerManager } from './DockerContainerManager';
import { E2BExecutionAdapter } from './E2BExecutionAdapter';

export type ExecutionAdapterType = 'local' | 'docker' | 'e2b';

export interface ExecutionAdapterFactoryOptions {
  /**
   * Preferred execution adapter type
   */
  type?: ExecutionAdapterType;
  
  /**
   * Whether to auto-fallback to local execution if preferred type fails
   */
  autoFallback?: boolean;
  
  /**
   * Docker-specific options
   */
  docker?: {
    composeFilePath?: string;
    serviceName?: string;
    projectName?: string;
  };
  
  /**
   * E2B-specific options
   */
  e2b?: {
    sandboxId?: string;
  };
  
  /**
   * Logger for execution adapter
   */
  logger?: {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };
}

/**
 * Factory function to create the appropriate execution adapter
 */
export async function createExecutionAdapter(
  options: ExecutionAdapterFactoryOptions = {}
): Promise<{
  adapter: ExecutionAdapter;
  type: ExecutionAdapterType;
}> {
  const { 
    type = 'local',
    autoFallback = true,
    logger
  } = options;
  
  // Track reasons for fallback for logging
  let fallbackReason = '';
  
  // Try to create the requested adapter type
  try {
    if (type === 'docker') {
      logger?.info('Attempting to create Docker execution adapter', 'system');
      
      // Create the container manager
      const containerManager = new DockerContainerManager({
        composeFilePath: options.docker?.composeFilePath,
        serviceName: options.docker?.serviceName,
        projectName: options.docker?.projectName,
        logger
      });
      
      // Check if Docker is available
      const dockerAvailable = await containerManager.isDockerAvailable();
      if (!dockerAvailable) {
        fallbackReason = 'Docker is not available on this system';
        throw new Error(fallbackReason);
      }
      
      // Ensure container is running
      const containerInfo = await containerManager.ensureContainer();
      if (!containerInfo) {
        fallbackReason = 'Failed to start Docker container';
        throw new Error(fallbackReason);
      }
      
      // Create the Docker execution adapter
      const dockerAdapter = new DockerExecutionAdapter(containerManager, { logger });
      
      logger?.info('Successfully created Docker execution adapter', 'system');
      return {
        adapter: dockerAdapter,
        type: 'docker'
      };
    }
    
    if (type === 'e2b') {
      logger?.info('Creating E2B execution adapter', 'system');
      
      if (!options.e2b?.sandboxId) {
        fallbackReason = 'E2B sandbox ID is required';
        throw new Error(fallbackReason);
      }
      
      const e2bAdapter = await E2BExecutionAdapter.create(options.e2b.sandboxId, { logger });
      
      return {
        adapter: e2bAdapter,
        type: 'e2b'
      };
    }
  } catch (error) {
    if (!autoFallback) {
      throw error;
    }
    
    logger?.warn(`Failed to create ${type} execution adapter: ${(error as Error).message}, falling back to local execution`, 'system');
  }
  
  // Fall back to local execution
  logger?.info('Creating local execution adapter', 'system');
  return {
    adapter: new LocalExecutionAdapter({ logger }),
    type: 'local'
  };
}