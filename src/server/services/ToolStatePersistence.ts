import fs from 'fs/promises';
import path from 'path';
import { 
  ToolExecutionState, 
  PermissionRequestState 
} from '../../types/platform-types';
import { ToolPreviewState } from '../../types/preview';
import { serverLogger } from '../logger';

/**
 * Service for persisting tool state to disk
 */
export class ToolStatePersistence {
  private dataDir: string;
  private isInitialized = false;
  
  constructor(dataDir: string = path.join(process.cwd(), 'data', 'tool-state')) {
    this.dataDir = dataDir;
  }
  
  /**
   * Initialize the persistence service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    
    // Create the data directory if it doesn't exist
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      this.isInitialized = true;
      serverLogger.info(`Tool state persistence initialized at ${this.dataDir}`);
    } catch (error) {
      serverLogger.error('Failed to create tool state data directory:', error);
      throw error;
    }
  }
  
  /**
   * Persist tool executions for a session
   */
  async persistToolExecutions(
    sessionId: string, 
    executions: ToolExecutionState[]
  ): Promise<void> {
    await this.initialize();
    
    try {
      const sessionDir = this.getSessionDir(sessionId);
      await fs.mkdir(sessionDir, { recursive: true });
      
      const filePath = path.join(sessionDir, 'executions.json');
      await fs.writeFile(filePath, JSON.stringify(executions, null, 2));
      
      serverLogger.debug(`Persisted ${executions.length} tool executions for session ${sessionId}`);
    } catch (error) {
      serverLogger.error(`Failed to persist tool executions for session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * Persist permission requests for a session
   */
  async persistPermissionRequests(
    sessionId: string, 
    permissions: PermissionRequestState[]
  ): Promise<void> {
    await this.initialize();
    
    try {
      const sessionDir = this.getSessionDir(sessionId);
      await fs.mkdir(sessionDir, { recursive: true });
      
      const filePath = path.join(sessionDir, 'permissions.json');
      await fs.writeFile(filePath, JSON.stringify(permissions, null, 2));
      
      serverLogger.debug(`Persisted ${permissions.length} permission requests for session ${sessionId}`);
    } catch (error) {
      serverLogger.error(`Failed to persist permission requests for session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * Persist previews for a session
   */
  async persistPreviews(
    sessionId: string, 
    previews: ToolPreviewState[]
  ): Promise<void> {
    await this.initialize();
    
    try {
      const sessionDir = this.getSessionDir(sessionId);
      await fs.mkdir(sessionDir, { recursive: true });
      
      const filePath = path.join(sessionDir, 'previews.json');
      await fs.writeFile(filePath, JSON.stringify(previews, null, 2));
      
      serverLogger.debug(`Persisted ${previews.length} previews for session ${sessionId}`);
    } catch (error) {
      serverLogger.error(`Failed to persist previews for session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * Load tool executions for a session
   */
  async loadToolExecutions(sessionId: string): Promise<ToolExecutionState[]> {
    await this.initialize();
    
    try {
      const filePath = path.join(this.getSessionDir(sessionId), 'executions.json');
      
      // Check if the file exists
      try {
        await fs.access(filePath);
      } catch {
        return []; // Return empty array if file doesn't exist
      }
      
      const data = await fs.readFile(filePath, 'utf-8');
      const executions = JSON.parse(data) as ToolExecutionState[];
      
      serverLogger.debug(`Loaded ${executions.length} tool executions for session ${sessionId}`);
      return executions;
    } catch (error) {
      serverLogger.error(`Failed to load tool executions for session ${sessionId}:`, error);
      return [];
    }
  }
  
  /**
   * Load permission requests for a session
   */
  async loadPermissionRequests(sessionId: string): Promise<PermissionRequestState[]> {
    await this.initialize();
    
    try {
      const filePath = path.join(this.getSessionDir(sessionId), 'permissions.json');
      
      // Check if the file exists
      try {
        await fs.access(filePath);
      } catch {
        return []; // Return empty array if file doesn't exist
      }
      
      const data = await fs.readFile(filePath, 'utf-8');
      const permissions = JSON.parse(data) as PermissionRequestState[];
      
      serverLogger.debug(`Loaded ${permissions.length} permission requests for session ${sessionId}`);
      return permissions;
    } catch (error) {
      serverLogger.error(`Failed to load permission requests for session ${sessionId}:`, error);
      return [];
    }
  }
  
  /**
   * Load previews for a session
   */
  async loadPreviews(sessionId: string): Promise<ToolPreviewState[]> {
    await this.initialize();
    
    try {
      const filePath = path.join(this.getSessionDir(sessionId), 'previews.json');
      
      // Check if the file exists
      try {
        await fs.access(filePath);
      } catch {
        return []; // Return empty array if file doesn't exist
      }
      
      const data = await fs.readFile(filePath, 'utf-8');
      const previews = JSON.parse(data) as ToolPreviewState[];
      
      serverLogger.debug(`Loaded ${previews.length} previews for session ${sessionId}`);
      return previews;
    } catch (error) {
      serverLogger.error(`Failed to load previews for session ${sessionId}:`, error);
      return [];
    }
  }
  
  /**
   * Delete all data for a session
   */
  async deleteSessionData(sessionId: string): Promise<void> {
    await this.initialize();
    
    try {
      const sessionDir = this.getSessionDir(sessionId);
      
      // Check if the directory exists
      try {
        await fs.access(sessionDir);
      } catch {
        return; // Directory doesn't exist, nothing to delete
      }
      
      await fs.rm(sessionDir, { recursive: true });
      serverLogger.debug(`Deleted tool state data for session ${sessionId}`);
    } catch (error) {
      serverLogger.error(`Failed to delete tool state data for session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get the directory path for a session
   */
  private getSessionDir(sessionId: string): string {
    return path.join(this.dataDir, sessionId);
  }
}

/**
 * Create a new ToolStatePersistence service
 */
export function createToolStatePersistence(
  dataDir?: string
): ToolStatePersistence {
  return new ToolStatePersistence(dataDir);
}

/**
 * Singleton instance of the tool state persistence service
 */
let toolStatePersistenceInstance: ToolStatePersistence | null = null;

/**
 * Get or create the tool state persistence service
 */
export function getToolStatePersistence(): ToolStatePersistence {
  if (!toolStatePersistenceInstance) {
    const dataDir = process.env.QCKFX_DATA_DIR 
      ? path.join(process.env.QCKFX_DATA_DIR, 'tool-state')
      : undefined;
    
    toolStatePersistenceInstance = createToolStatePersistence(dataDir);
  }
  
  return toolStatePersistenceInstance;
}