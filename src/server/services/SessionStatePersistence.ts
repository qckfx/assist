import fs from 'fs/promises';
import path from 'path';
import { 
  ToolExecutionState,
  PermissionRequestState,
  RepositoryInfo,
  TextContentPart,
} from '../../types/platform-types';
import { LogCategory } from '../../utils/logger';
import { ToolPreviewState } from '../../types/preview';
import { SessionPersistenceEvent, StoredMessage, SessionListEntry, SavedSessionData } from '../../types/session';
import { serverLogger } from '../logger';
import { EventEmitter } from 'events';
import { SessionState } from '../../types/session';

/**
 * Service for persisting complete session state to disk
 */
export class SessionStatePersistence extends EventEmitter {
  private dataDir: string;
  private isInitialized = false;
  
  constructor(dataDir: string = path.join(process.cwd(), 'data', 'sessions')) {
    super();
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
      serverLogger.info(`Session state persistence initialized at ${this.dataDir}`);
    } catch (error) {
      serverLogger.error('Failed to create session data directory:', error);
      throw error;
    }
  }
  
  /**
   * Save complete session data
   */
  async saveSession(sessionData: SavedSessionData): Promise<SavedSessionData> {
    await this.initialize();
    
    try {
      // Update the last updated timestamp
      sessionData.updatedAt = new Date().toISOString();
      
      const filePath = this.getSessionFilePath(sessionData.id);
      await fs.writeFile(filePath, JSON.stringify(sessionData, null, 2));
      
      // Create or update the session metadata file
      await this.updateSessionMetadata(sessionData);
      
      serverLogger.debug(`Saved session data for session ${sessionData.id}`);
      
      // Emit the saved event
      this.emit(SessionPersistenceEvent.SESSION_SAVED, {
        sessionId: sessionData.id,
        metadata: this.createSessionListEntry(sessionData)
      });
      
      return sessionData;
    } catch (error) {
      serverLogger.error(`Failed to save session data for session ${sessionData.id}:`, error);
      throw error;
    }
  }
  
  /**
   * Load complete session data without emitting events
   * @internal This method is used internally by loadSession and should not be called directly
   */
  private async loadSessionInternal(sessionId: string): Promise<SavedSessionData | undefined> {
    await this.initialize();
    
    try {
      const filePath = this.getSessionFilePath(sessionId);
      
      // Check if the file exists
      try {
        await fs.access(filePath);
      } catch {
        return undefined; // Session doesn't exist
      }
      
      const data = await fs.readFile(filePath, 'utf-8');
      const sessionData = JSON.parse(data) as SavedSessionData;
      
      // IMPORTANT ADDITION: Try to load messages from subdirectory if they exist
      try {
        // Check if we have a subdirectory with messages
        const messagesFile = path.join(this.getSessionDir(sessionId), 'messages.json');
        await fs.access(messagesFile);
        
        // If we get here, the file exists, so load the messages
        const messagesData = await fs.readFile(messagesFile, 'utf-8');
        const messages = JSON.parse(messagesData) as StoredMessage[];
        
        // Update the session data with these messages
        sessionData.messages = messages;
        serverLogger.debug(`Loaded ${messages.length} messages from separate file for session ${sessionId}`);
      } catch {
        // It's okay if the messages file doesn't exist - the session might be empty
        serverLogger.debug(`No separate messages file found for session ${sessionId}`);
      }
      
      // Also try to load tool executions from subdirectory if they exist
      try {
        const toolExecutionsFile = path.join(this.getSessionDir(sessionId), 'tool-executions.json');
        await fs.access(toolExecutionsFile);
        
        // If we get here, the file exists, so load the tool executions
        const toolExecutionsData = await fs.readFile(toolExecutionsFile, 'utf-8');
        const toolExecutions = JSON.parse(toolExecutionsData) as ToolExecutionState[];
        
        // Update the session data with these tool executions
        sessionData.toolExecutions = toolExecutions;
        serverLogger.debug(`Loaded ${toolExecutions.length} tool executions from separate file for session ${sessionId}`);
      } catch {
        // It's okay if the tool executions file doesn't exist
        serverLogger.debug(`No separate tool executions file found for session ${sessionId}`);
      }
      
      // Also try to load permission requests from subdirectory if they exist
      try {
        const permissionsFile = path.join(this.getSessionDir(sessionId), 'permission-requests.json');
        await fs.access(permissionsFile);
        
        // If we get here, the file exists, so load the permission requests
        const permissionsData = await fs.readFile(permissionsFile, 'utf-8');
        const permissions = JSON.parse(permissionsData) as PermissionRequestState[];
        
        // Update the session data with these permission requests
        sessionData.permissionRequests = permissions;
        serverLogger.debug(`Loaded ${permissions.length} permission requests from separate file for session ${sessionId}`);
      } catch {
        // It's okay if the permissions file doesn't exist
        serverLogger.debug(`No separate permissions file found for session ${sessionId}`);
      }
      
      // Also try to load previews from subdirectory if they exist
      try {
        const previewsFile = path.join(this.getSessionDir(sessionId), 'previews.json');
        await fs.access(previewsFile);
        
        // If we get here, the file exists, so load the previews
        const previewsData = await fs.readFile(previewsFile, 'utf-8');
        const previews = JSON.parse(previewsData) as ToolPreviewState[];
        
        // Update the session data with these previews
        sessionData.previews = previews;
        serverLogger.debug(`Loaded ${previews.length} previews from separate file for session ${sessionId}`);
      } catch {
        // It's okay if the previews file doesn't exist
        serverLogger.debug(`No separate previews file found for session ${sessionId}`);
      }
      
      serverLogger.debug(`Loaded session data for session ${sessionId} with ${sessionData.messages?.length || 0} messages`);
      
      return sessionData;
    } catch (error) {
      serverLogger.error(`Failed to load session data for session ${sessionId}:`, error);
      return undefined;
    }
  }

  /**
   * Load complete session data
   * This method will emit a SESSION_LOADED event, which can trigger listeners
   * PERFORMANCE CRITICAL: Use getSessionDataWithoutEvents to avoid triggering cascades
   */
  async loadSession(sessionId: string): Promise<SavedSessionData | undefined> {
    try {
      const sessionData = await this.loadSessionInternal(sessionId);
      
      if (sessionData) {
        // Only log this at debug level to reduce log noise
        serverLogger.debug(`Loading session data for ${sessionId}`, LogCategory.SESSION);
        
        // Emit the loaded event
        this.emit(SessionPersistenceEvent.SESSION_LOADED, {
          sessionId,
          metadata: this.createSessionListEntry(sessionData)
        });
      }
      
      return sessionData;
    } catch (error) {
      serverLogger.error(`Failed to load session data for session ${sessionId}:`, error);
      return undefined;
    }
  }
  
  /**
   * Load session data without emitting events
   * Use this method when you need the data but don't want to trigger event listeners
   */
  async getSessionDataWithoutEvents(sessionId: string): Promise<SavedSessionData | undefined> {
    return this.loadSessionInternal(sessionId);
  }
  
  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    await this.initialize();
    
    try {
      const filePath = this.getSessionFilePath(sessionId);
      const metadataPath = this.getSessionMetadataPath(sessionId);
      
      // Check if the file exists
      try {
        await fs.access(filePath);
      } catch {
        return false; // Session doesn't exist
      }
      
      // Delete the session data file
      await fs.unlink(filePath);
      
      // Delete the metadata file if it exists
      try {
        await fs.access(metadataPath);
        await fs.unlink(metadataPath);
      } catch {
        // Metadata file doesn't exist, which is okay
      }
      
      serverLogger.debug(`Deleted session data for session ${sessionId}`);
      
      // Emit the deleted event
      this.emit(SessionPersistenceEvent.SESSION_DELETED, { sessionId });
      
      return true;
    } catch (error) {
      serverLogger.error(`Failed to delete session data for session ${sessionId}:`, error);
      return false;
    }
  }
  
  /**
   * List all saved sessions
   * Optimized to use only metadata files and avoid loading full session data
   */
  async listSessions(): Promise<SessionListEntry[]> {
    await this.initialize();
    
    try {
      // Create the sessions metadata directory if it doesn't exist
      const metadataDir = this.getSessionsMetadataDir();
      await fs.mkdir(metadataDir, { recursive: true });
      
      // Read all metadata files
      const files = await fs.readdir(metadataDir);
      const metadataFiles = files.filter(file => file.endsWith('.meta.json'));
      
      // Don't log this on server startup to reduce log clutter
      serverLogger.debug(`Found ${metadataFiles.length} session metadata files`, LogCategory.SESSION);
      
      const sessions: SessionListEntry[] = [];
      
      // Load each metadata file
      for (const file of metadataFiles) {
        try {
          const data = await fs.readFile(path.join(metadataDir, file), 'utf-8');
          const metadata = JSON.parse(data) as SessionListEntry;
          sessions.push(metadata);
        } catch (err) {
          serverLogger.warn(`Failed to read session metadata file ${file}:`, err);
          // Continue with other files
        }
      }
      
      // Sort by updatedAt (most recent first)
      return sessions.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      serverLogger.error('Failed to list sessions:', error);
      return [];
    }
  }
  
  /**
   * Update session metadata
   */
  private async updateSessionMetadata(sessionData: SavedSessionData): Promise<void> {
    const metadata = this.createSessionListEntry(sessionData);
    const metadataPath = this.getSessionMetadataPath(sessionData.id);
    
    // Create the metadata directory if it doesn't exist
    const metadataDir = path.dirname(metadataPath);
    await fs.mkdir(metadataDir, { recursive: true });
    
    // Write the metadata file
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }
  
  /**
   * Create a session list entry from complete session data
   */
  private createSessionListEntry(sessionData: SavedSessionData): SessionListEntry {
    const repositoryInfo = sessionData.repositoryInfo;
    
    return {
      id: sessionData.id,
      name: sessionData.name,
      createdAt: sessionData.createdAt,
      updatedAt: sessionData.updatedAt,
      messageCount: sessionData.messages.length,
      toolExecutionCount: sessionData.toolExecutions.length,
      repositoryInfo: repositoryInfo ? {
        workingDirectory: repositoryInfo.workingDirectory,
        isGitRepository: repositoryInfo.isGitRepository,
        currentBranch: repositoryInfo.currentBranch,
        hasWarnings: !!(
          repositoryInfo.warnings?.uncommittedChanges || 
          repositoryInfo.warnings?.untrackedFiles
        )
      } : undefined
    };
  }
  
  /**
   * Get the file path for a session
   */
  private getSessionFilePath(sessionId: string): string {
    return path.join(this.dataDir, `${sessionId}.json`);
  }
  
  /**
   * Get the metadata file path for a session
   */
  private getSessionMetadataPath(sessionId: string): string {
    return path.join(this.getSessionsMetadataDir(), `${sessionId}.meta.json`);
  }
  
  /**
   * Get the directory for session metadata
   */
  private getSessionsMetadataDir(): string {
    return path.join(this.dataDir, 'metadata');
  }
  
  /**
   * Persist tool executions for a session
   */
  async persistToolExecutions(sessionId: string, executions: ToolExecutionState[]): Promise<void> {
    await this.initialize();
    
    try {
      const sessionDir = this.getSessionDir(sessionId);
      await fs.mkdir(sessionDir, { recursive: true });
      
      const filePath = path.join(sessionDir, 'tool-executions.json');
      await fs.writeFile(filePath, JSON.stringify(executions, null, 2));
      
      serverLogger.debug(`Saved ${executions.length} tool executions for session ${sessionId}`);
    } catch (error) {
      serverLogger.error(`Failed to save tool executions for session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * Load tool executions for a session
   */
  async loadToolExecutions(sessionId: string): Promise<ToolExecutionState[]> {
    await this.initialize();
    
    try {
      const sessionDir = this.getSessionDir(sessionId);
      const filePath = path.join(sessionDir, 'tool-executions.json');
      
      try {
        await fs.access(filePath);
      } catch {
        return []; // File doesn't exist, return empty array
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
   * Persist permission requests for a session
   */
  async persistPermissionRequests(sessionId: string, requests: PermissionRequestState[]): Promise<void> {
    await this.initialize();
    
    try {
      const sessionDir = this.getSessionDir(sessionId);
      await fs.mkdir(sessionDir, { recursive: true });
      
      const filePath = path.join(sessionDir, 'permission-requests.json');
      await fs.writeFile(filePath, JSON.stringify(requests, null, 2));
      
      serverLogger.debug(`Saved ${requests.length} permission requests for session ${sessionId}`);
    } catch (error) {
      serverLogger.error(`Failed to save permission requests for session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * Load permission requests for a session
   */
  async loadPermissionRequests(sessionId: string): Promise<PermissionRequestState[]> {
    await this.initialize();
    
    try {
      const sessionDir = this.getSessionDir(sessionId);
      const filePath = path.join(sessionDir, 'permission-requests.json');
      
      try {
        await fs.access(filePath);
      } catch {
        return []; // File doesn't exist, return empty array
      }
      
      const data = await fs.readFile(filePath, 'utf-8');
      const requests = JSON.parse(data) as PermissionRequestState[];
      
      serverLogger.debug(`Loaded ${requests.length} permission requests for session ${sessionId}`);
      return requests;
    } catch (error) {
      serverLogger.error(`Failed to load permission requests for session ${sessionId}:`, error);
      return [];
    }
  }
  
  /**
   * Persist tool previews for a session
   */
  async persistPreviews(sessionId: string, previews: ToolPreviewState[]): Promise<void> {
    await this.initialize();
    
    try {
      const sessionDir = this.getSessionDir(sessionId);
      await fs.mkdir(sessionDir, { recursive: true });
      
      const filePath = path.join(sessionDir, 'previews.json');
      await fs.writeFile(filePath, JSON.stringify(previews, null, 2));
      
      serverLogger.debug(`Saved ${previews.length} previews for session ${sessionId}`);
    } catch (error) {
      serverLogger.error(`Failed to save previews for session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * Load tool previews for a session
   */
  async loadPreviews(sessionId: string): Promise<ToolPreviewState[]> {
    await this.initialize();
    
    try {
      const sessionDir = this.getSessionDir(sessionId);
      const filePath = path.join(sessionDir, 'previews.json');
      
      try {
        await fs.access(filePath);
      } catch {
        return []; // File doesn't exist, return empty array
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
   * Persist messages for a session
   */
  async persistMessages(sessionId: string, messages: StoredMessage[]): Promise<void> {
    await this.initialize();
    
    try {
      const sessionDir = this.getSessionDir(sessionId);
      await fs.mkdir(sessionDir, { recursive: true });
      
      const filePath = path.join(sessionDir, 'messages.json');
      await fs.writeFile(filePath, JSON.stringify(messages, null, 2));
      
      serverLogger.debug(`Saved ${messages.length} messages for session ${sessionId}`);
    } catch (error) {
      serverLogger.error(`Failed to save messages for session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * Load messages for a session
   */
  async loadMessages(sessionId: string): Promise<StoredMessage[]> {
    await this.initialize();
    
    try {
      const sessionDir = this.getSessionDir(sessionId);
      const filePath = path.join(sessionDir, 'messages.json');
      
      try {
        await fs.access(filePath);
      } catch {
        return []; // File doesn't exist, return empty array
      }
      
      const data = await fs.readFile(filePath, 'utf-8');
      const messages = JSON.parse(data) as StoredMessage[];
      
      serverLogger.debug(`Loaded ${messages.length} messages for session ${sessionId}`);
      return messages;
    } catch (error) {
      serverLogger.error(`Failed to load messages for session ${sessionId}:`, error);
      return [];
    }
  }
  
  /**
   * Persist repository information for a session
   */
  async persistRepositoryInfo(sessionId: string, repoInfo: RepositoryInfo): Promise<void> {
    await this.initialize();
    
    try {
      const sessionDir = this.getSessionDir(sessionId);
      await fs.mkdir(sessionDir, { recursive: true });
      
      const filePath = path.join(sessionDir, 'repository-info.json');
      await fs.writeFile(filePath, JSON.stringify(repoInfo, null, 2));
      
      serverLogger.debug(`Saved repository information for session ${sessionId}`);
    } catch (error) {
      serverLogger.error(`Failed to save repository information for session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * Load repository information for a session
   */
  async loadRepositoryInfo(sessionId: string): Promise<RepositoryInfo | null> {
    await this.initialize();
    
    try {
      const sessionDir = this.getSessionDir(sessionId);
      const filePath = path.join(sessionDir, 'repository-info.json');
      
      try {
        await fs.access(filePath);
      } catch {
        return null; // File doesn't exist
      }
      
      const data = await fs.readFile(filePath, 'utf-8');
      const repoInfo = JSON.parse(data) as RepositoryInfo;
      
      serverLogger.debug(`Loaded repository information for session ${sessionId}`);
      return repoInfo;
    } catch (error) {
      serverLogger.error(`Failed to load repository information for session ${sessionId}:`, error);
      return null;
    }
  }
  
  /**
   * Persist session metadata
   */
  async persistSessionMetadata(sessionId: string, metadata: Record<string, unknown>): Promise<void> {
    await this.initialize();
    
    try {
      // Create metadata directory
      const metadataDir = this.getSessionsMetadataDir();
      await fs.mkdir(metadataDir, { recursive: true });
      
      // Write to metadata file
      const metadataPath = this.getSessionMetadataPath(sessionId);
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
      
      serverLogger.debug(`Saved metadata for session ${sessionId}`);
    } catch (error) {
      serverLogger.error(`Failed to save metadata for session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * Load session metadata
   */
  async loadSessionMetadata(sessionId: string): Promise<Record<string, unknown> | null> {
    await this.initialize();
    
    try {
      const metadataPath = this.getSessionMetadataPath(sessionId);
      
      try {
        await fs.access(metadataPath);
      } catch {
        return null; // File doesn't exist
      }
      
      const data = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(data);
      
      serverLogger.debug(`Loaded metadata for session ${sessionId}`);
      return metadata;
    } catch (error) {
      serverLogger.error(`Failed to load metadata for session ${sessionId}:`, error);
      return null;
    }
  }
  
  /**
   * Delete all data for a session
   */
  async deleteSessionData(sessionId: string): Promise<void> {
    await this.initialize();
    
    try {
      // Delete session directory
      const sessionDir = this.getSessionDir(sessionId);
      try {
        await fs.rm(sessionDir, { recursive: true, force: true });
      } catch {
        // Directory might not exist, which is fine
      }
      
      // Delete metadata file
      const metadataPath = this.getSessionMetadataPath(sessionId);
      try {
        await fs.unlink(metadataPath);
      } catch {
        // File might not exist, which is fine
      }
      
      serverLogger.debug(`Deleted all data for session ${sessionId}`);
      
      // Emit the deleted event
      this.emit(SessionPersistenceEvent.SESSION_DELETED, { sessionId });
    } catch (error) {
      serverLogger.error(`Failed to delete data for session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get the session directory path
   */
  getSessionDir(sessionId: string): string {
    return path.join(this.dataDir, sessionId);
  }
  
  /**
   * Helper method to extract messages from the Anthropic message format
   */
  extractMessages(
    sessionState: SessionState, 
    toolExecutions: ToolExecutionState[]
  ): StoredMessage[] {
    if (!sessionState.coreSessionState.contextWindow) {
      return [];
    }
    
    // Create a map of tool executions by ID for quick lookup
    const executionsMap = new Map<string, ToolExecutionState>();
    for (const execution of toolExecutions) {
      executionsMap.set(execution.id, execution);
    }
    
    // Process messages sequentially
    const messages: StoredMessage[] = [];
    let sequence = 0;
    
    for (const message of sessionState.coreSessionState.contextWindow.getMessages()) {
      if (!message.content || !Array.isArray(message.content)) {
        continue;
      }
      
      const storedMessage: StoredMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        role: message.role as 'user' | 'assistant',
        timestamp: new Date().toISOString(),
        content: [], // Initialize with empty array for structured content
        sequence: sequence++,
        toolCalls: []
      };
      
      // Process content blocks and extract tool calls
      for (const block of message.content) {
        if (block.type === 'text') {
          // Add to structured content
          storedMessage.content.push({
            type: 'text',
            text: block.text || ''
          } as TextContentPart);
        } else if (block.type === 'tool_use') {
          // Try to find the matching tool execution
          const toolId = block.id;
          const matchingExecution = Array.from(executionsMap.values()).find(
            exec => exec.toolUseId === toolId
          );
          
          if (matchingExecution) {
            if (!storedMessage.toolCalls) {
              storedMessage.toolCalls = [];
            }
            
            storedMessage.toolCalls.push({
              executionId: matchingExecution.id,
              toolName: matchingExecution.toolName,
              index: storedMessage.toolCalls.length,
              isBatchedCall: matchingExecution.toolId === 'BatchTool'
            });
          }
        }
      }
      
      messages.push(storedMessage);
    }
    
    return messages;
  }
  
  /**
   * Helper method to capture repository information
   * Modified to return minimal information for performance
   */
  async captureRepositoryInfo(workingDir?: string): Promise<RepositoryInfo | null> {
    try {
      // Use current working directory if none specified
      const dir = workingDir || process.cwd();
      
      // Return minimal repository info to avoid expensive operations
      const repoInfo: RepositoryInfo = {
        workingDirectory: dir,
        isGitRepository: false
      };
      
      return repoInfo;
    } catch (error) {
      serverLogger.warn('Failed to capture repository information:', error);
      return null;
    }
  }
  
  /**
   * Check if session metadata exists without loading the full session
   * This is a lightweight validation method
   */
  async sessionMetadataExists(sessionId: string): Promise<boolean> {
    await this.initialize();
    
    try {
      const metadataPath = this.getSessionMetadataPath(sessionId);
      await fs.access(metadataPath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a new SessionStatePersistence service
 */
export function createSessionStatePersistence(
  dataDir?: string
): SessionStatePersistence {
  return new SessionStatePersistence(dataDir);
}

/**
 * Singleton instance of the session state persistence service
 */
let sessionStatePersistenceInstance: SessionStatePersistence | null = null;

/**
 * Get or create the session state persistence service
 */
export function getSessionStatePersistence(): SessionStatePersistence {
  if (!sessionStatePersistenceInstance) {
    const dataDir = process.env.QCKFX_DATA_DIR 
      ? path.join(process.env.QCKFX_DATA_DIR, 'sessions')
      : undefined;
    
    sessionStatePersistenceInstance = createSessionStatePersistence(dataDir);
  }
  
  return sessionStatePersistenceInstance;
}