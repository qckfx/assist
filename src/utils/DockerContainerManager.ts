import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Container information type
 */
export interface ContainerInfo {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'not_found';
  projectPath: string;
  workspacePath: string;
}

/**
 * Options for the Docker container manager
 */
export interface DockerManagerOptions {
  composeFilePath?: string;
  serviceName?: string;
  projectName?: string;
  logger?: {
    debug: (message: string, category?: string) => void;
    info: (message: string, category?: string) => void;
    warn: (message: string, category?: string) => void;
    error: (message: string, error?: unknown, category?: string) => void;
  };
}

/**
 * Manages Docker containers using docker-compose
 */
export class DockerContainerManager {
  private composeFilePath: string;
  private serviceName: string;
  private projectName: string;
  private logger?: {
    debug: (message: string, category?: string) => void;
    info: (message: string, category?: string) => void;
    warn: (message: string, category?: string) => void;
    error: (message: string, error?: unknown, category?: string) => void;
  };

  /**
   * Create a Docker container manager using docker-compose
   */
  constructor(options: DockerManagerOptions = {}) {
    // Get the Docker directory which is in the project root
    const projectRoot = path.resolve(__dirname, '..', '..');
    this.composeFilePath = options.composeFilePath || path.join(projectRoot, 'docker', 'docker-compose.yml');
    this.serviceName = options.serviceName || 'agent-sandbox';
    this.projectName = options.projectName || 'qckfx';
    this.logger = options.logger;
  }

  /**
   * Check if Docker is available on this system
   */
  public async isDockerAvailable(): Promise<boolean> {
    try {
      await execAsync('docker --version');
      await execAsync('docker-compose --version');
      return true;
    } catch (error) {
      this.logger?.warn(`Docker not available: ${(error as Error).message}`, 'system');
      return false;
    }
  }

  /**
   * Get information about the container
   */
  public async getContainerInfo(): Promise<ContainerInfo | null> {
    try {
      // Get container ID using docker-compose
      const { stdout: idOutput } = await execAsync(
        `docker-compose -f "${this.composeFilePath}" -p ${this.projectName} ps -q ${this.serviceName}`
      );
      
      const containerId = idOutput.trim();
      if (!containerId) {
        return null;
      }
      
      // Check if container is running
      const { stdout: statusOutput } = await execAsync(`docker inspect -f '{{.State.Running}}' ${containerId}`);
      const isRunning = statusOutput.trim() === 'true';
      
      // Get container name
      const { stdout: nameOutput } = await execAsync(`docker inspect -f '{{.Name}}' ${containerId}`);
      const containerName = nameOutput.trim().replace(/^\//, '');
      
      // Get project path - this is our local directory that's mounted
      const projectPath = path.resolve(__dirname, '..', '..');
      
      return {
        id: containerId,
        name: containerName,
        status: isRunning ? 'running' : 'stopped',
        projectPath,
        workspacePath: '/workspace'
      };
    } catch {
      // If there's an error, the container probably doesn't exist
      return null;
    }
  }

  /**
   * Start the container using docker-compose
   */
  public async startContainer(): Promise<ContainerInfo | null> {
    try {
      // Check if container already exists and is running
      const existingContainer = await this.getContainerInfo();
      if (existingContainer && existingContainer.status === 'running') {
        this.logger?.info(`Container ${existingContainer.name} is already running`, 'system');
        return existingContainer;
      }
      
      // Make sure docker directory exists
      const dockerDir = path.dirname(this.composeFilePath);
      if (!fs.existsSync(dockerDir)) {
        this.logger?.error(`Docker directory not found: ${dockerDir}`, 'system');
        return null;
      }
      
      // Make sure docker-compose file exists
      if (!fs.existsSync(this.composeFilePath)) {
        this.logger?.error(`Docker Compose file not found: ${this.composeFilePath}`, 'system');
        return null;
      }
      
      // Start container using docker-compose
      this.logger?.info(`Starting container using docker-compose: ${this.serviceName}`, 'system');
      await execAsync(`docker-compose -f "${this.composeFilePath}" -p ${this.projectName} up -d ${this.serviceName}`);
      
      // Get container info after starting
      const containerInfo = await this.getContainerInfo();
      if (!containerInfo) {
        this.logger?.error('Failed to get container info after starting', 'system');
        return null;
      }
      
      this.logger?.info(`Container started: ${containerInfo.name}`, 'system');
      return containerInfo;
    } catch (error) {
      this.logger?.error(`Error starting container: ${(error as Error).message}`, error, 'system');
      return null;
    }
  }

  /**
   * Stop the container using docker-compose
   */
  public async stopContainer(): Promise<boolean> {
    try {
      const containerInfo = await this.getContainerInfo();
      if (!containerInfo) {
        return false;
      }
      
      this.logger?.info(`Stopping container: ${containerInfo.name}`, 'system');
      await execAsync(`docker-compose -f "${this.composeFilePath}" -p ${this.projectName} stop ${this.serviceName}`);
      return true;
    } catch (error) {
      this.logger?.error(`Error stopping container: ${(error as Error).message}`, error, 'system');
      return false;
    }
  }

  /**
   * Stop and remove the container using docker-compose
   */
  public async removeContainer(): Promise<boolean> {
    try {
      const containerInfo = await this.getContainerInfo();
      if (!containerInfo) {
        return false;
      }
      
      this.logger?.info(`Removing container: ${containerInfo.name}`, 'system');
      await execAsync(`docker-compose -f "${this.composeFilePath}" -p ${this.projectName} down`);
      return true;
    } catch (error) {
      this.logger?.error(`Error removing container: ${(error as Error).message}`, error, 'system');
      return false;
    }
  }

  /**
   * Execute a command in the container
   */
  public async executeCommand(command: string, workingDir?: string): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    try {
      const containerInfo = await this.getContainerInfo();
      if (!containerInfo || containerInfo.status !== 'running') {
        throw new Error('Container is not running');
      }
      
      // Set working directory option if provided
      const workdirOption = workingDir ? `-w "${workingDir}"` : '';
      
      // Execute command in container
      const { stdout, stderr } = await execAsync(
        `docker exec ${workdirOption} ${containerInfo.id} bash -c "${command.replace(/"/g, '\\"')}"`
      );
      
      return {
        stdout,
        stderr,
        exitCode: 0
      };
    } catch (error) {
      const err = error as Error & { code?: number; stderr?: string; stdout?: string };
      return {
        stdout: err.stdout || '',
        stderr: err.stderr || err.message,
        exitCode: err.code || 1
      };
    }
  }

  /**
   * Check container health and ensure it's properly set up
   */
  public async ensureContainer(): Promise<ContainerInfo | null> {
    try {
      // Check if Docker is available
      const dockerAvailable = await this.isDockerAvailable();
      if (!dockerAvailable) {
        this.logger?.warn('Docker is not available on this system', 'system');
        return null;
      }
      
      // Start container if needed
      const containerInfo = await this.startContainer();
      if (!containerInfo) {
        return null;
      }
      
      // Check if container is healthy
      const { exitCode } = await this.executeCommand('echo "Container health check"');
      if (exitCode !== 0) {
        this.logger?.error('Container health check failed', 'system');
        return null;
      }
      
      return containerInfo;
    } catch (error) {
      this.logger?.error(`Error ensuring container: ${(error as Error).message}`, error, 'system');
      return null;
    }
  }
}