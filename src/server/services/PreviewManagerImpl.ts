import { v4 as uuidv4 } from 'uuid';
import { 
  PreviewContentType, 
  ToolPreviewState,
  PreviewManager 
} from '../../types/preview';
import { SessionStatePersistence } from './SessionStatePersistence';
import { getSessionStatePersistence } from './sessionPersistenceProvider';
import { serverLogger } from '../logger';

/**
 * Implementation of PreviewManager that stores previews in memory
 * with persistence support
 */
export class PreviewManagerImpl implements PreviewManager {
  private previews: Map<string, ToolPreviewState> = new Map();
  private sessionPreviews: Map<string, Set<string>> = new Map();
  private executionPreviews: Map<string, string> = new Map();
  
  // Add persistence support
  private persistence: SessionStatePersistence;
  
  /**
   * Create a new PreviewManagerImpl
   * @param persistenceService Optional persistence service to use
   */
  constructor(persistenceService?: SessionStatePersistence) {
    // Use provided persistence service or get singleton instance
    this.persistence = persistenceService || getSessionStatePersistence();
  }

  /**
   * Create a preview for a tool execution
   */
  createPreview(
    sessionId: string,
    executionId: string,
    contentType: PreviewContentType,
    briefContent: string,
    fullContent?: string,
    metadata?: Record<string, unknown>
  ): ToolPreviewState {
    const id = uuidv4();
    
    const preview: ToolPreviewState = {
      id,
      sessionId,
      executionId,
      contentType,
      briefContent,
      fullContent,
      metadata
    };

    // Store the preview
    this.previews.set(id, preview);

    // Add to session previews
    if (!this.sessionPreviews.has(sessionId)) {
      this.sessionPreviews.set(sessionId, new Set());
    }
    this.sessionPreviews.get(sessionId)!.add(id);

    // Link execution to preview
    this.executionPreviews.set(executionId, id);
    
    serverLogger.debug(`Created preview ${id} for execution ${executionId}`, {
      previewId: id,
      executionId,
      contentType,
      sessionId
    });

    return preview;
  }

  /**
   * Create a preview for a permission request
   */
  createPermissionPreview(
    sessionId: string,
    executionId: string,
    permissionId: string,
    contentType: PreviewContentType,
    briefContent: string,
    fullContent?: string,
    metadata?: Record<string, unknown>
  ): ToolPreviewState {
    const preview = this.createPreview(
      sessionId,
      executionId,
      contentType,
      briefContent,
      fullContent,
      metadata
    );

    // Update with permission ID
    return this.updatePreview(preview.id, { permissionId });
  }

  /**
   * Get a preview by ID
   */
  getPreview(previewId: string): ToolPreviewState | undefined {
    return this.previews.get(previewId);
  }

  /**
   * Get a preview by execution ID
   */
  getPreviewForExecution(executionId: string): ToolPreviewState | undefined {
    const previewId = this.executionPreviews.get(executionId);
    return previewId ? this.previews.get(previewId) : undefined;
  }

  /**
   * Get all previews for a session
   */
  getPreviewsForSession(sessionId: string): ToolPreviewState[] {
    const previewIds = this.sessionPreviews.get(sessionId) || new Set();
    return Array.from(previewIds)
      .map(id => this.previews.get(id)!)
      .filter(Boolean);
  }

  /**
   * Update an existing preview
   */
  updatePreview(previewId: string, updates: Partial<ToolPreviewState>): ToolPreviewState {
    const preview = this.previews.get(previewId);
    if (!preview) {
      throw new Error(`Preview not found: ${previewId}`);
    }

    // Create updated preview with immutable pattern
    const updatedPreview: ToolPreviewState = {
      ...preview,
      ...updates
    };

    // Store the updated preview
    this.previews.set(previewId, updatedPreview);
    
    serverLogger.debug(`Updated preview: ${previewId}`, {
      previewId,
      updates: Object.keys(updates)
    });

    return updatedPreview;
  }
  
  /**
   * Save all previews for a session
   * @param sessionId Session identifier
   */
  async saveSessionData(sessionId: string): Promise<void> {
    try {
      // Load existing session data or create a new one
      let sessionData = await this.persistence.loadSession(sessionId);
      const now = new Date().toISOString();
      
      if (!sessionData) {
        // Create a new session data object
        sessionData = {
          id: sessionId,
          name: `Session ${sessionId}`,
          createdAt: now,
          updatedAt: now,
          messages: [],
          toolExecutions: [],
          permissionRequests: [],
          previews: [],
          sessionState: { conversationHistory: [] }
        };
      }
      
      // Update the previews
      sessionData.previews = this.getPreviewsForSession(sessionId);
      sessionData.updatedAt = now;
      
      // Save the updated session data
      await this.persistence.saveSession(sessionData);
      
      serverLogger.debug(`Saved ${sessionData.previews.length} previews for session ${sessionId}`);
    } catch (error) {
      serverLogger.error(`Failed to save previews for session ${sessionId}:`, error);
    }
  }
  
  /**
   * Load previews for a session
   * @param sessionId Session identifier
   */
  async loadSessionData(sessionId: string): Promise<void> {
    try {
      // Load the session data
      const sessionData = await this.persistence.loadSession(sessionId);
      
      // Restore the data (only if we have a session)
      if (sessionData && sessionData.previews.length > 0) {
        // First, clear any existing previews for this session
        this.clearSessionData(sessionId);
        
        // Add previews to the manager
        for (const preview of sessionData.previews) {
          this.previews.set(preview.id, preview);
          
          // Add to session previews
          if (!this.sessionPreviews.has(sessionId)) {
            this.sessionPreviews.set(sessionId, new Set());
          }
          this.sessionPreviews.get(sessionId)!.add(preview.id);
          
          // Link execution to preview
          this.executionPreviews.set(preview.executionId, preview.id);
        }
        
        serverLogger.info(`Loaded ${sessionData.previews.length} previews for session ${sessionId}`);
      }
    } catch (error) {
      serverLogger.error(`Failed to load previews for session ${sessionId}:`, error);
    }
  }
  
  /**
   * Clear all previews for a session
   * @param sessionId Session identifier
   */
  clearSessionData(sessionId: string): void {
    // Get all preview IDs for the session
    const previewIds = this.sessionPreviews.get(sessionId) || new Set();
    
    // Remove all previews
    for (const id of previewIds) {
      // Get the preview to find the execution ID
      const preview = this.previews.get(id);
      if (preview) {
        // Remove the link from execution to preview
        this.executionPreviews.delete(preview.executionId);
      }
      
      this.previews.delete(id);
    }
    
    // Remove session from previews map
    this.sessionPreviews.delete(sessionId);
  }
  
  /**
   * Delete a session's previews from persistence
   * @param sessionId Session identifier
   */
  async deleteSessionData(sessionId: string): Promise<void> {
    try {
      // Clear in-memory data first
      this.clearSessionData(sessionId);
      
      // We don't need to delete persisted data here as the SessionStatePersistence.deleteSession
      // will handle removing the entire session file
      serverLogger.debug(`Deleted preview data for session ${sessionId}`);
    } catch (error) {
      serverLogger.error(`Failed to delete preview data for session ${sessionId}:`, error);
    }
  }

  /**
   * Clear all data (mainly for testing)
   */
  clear(): void {
    this.previews.clear();
    this.sessionPreviews.clear();
    this.executionPreviews.clear();
  }
}

/**
 * Create a new PreviewManager
 * @param persistenceService Optional persistence service to use
 * @returns New PreviewManager instance
 */
export function createPreviewManager(
  persistenceService?: SessionStatePersistence
): PreviewManager {
  return new PreviewManagerImpl(persistenceService);
}