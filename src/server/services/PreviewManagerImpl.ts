import { v4 as uuidv4 } from 'uuid';
import { 
  PreviewContentType, 
  ToolPreviewState,
  PreviewManager 
} from '../../types/preview';
import { serverLogger } from '../logger';

/**
 * Implementation of PreviewManager that stores previews in memory
 */
export class PreviewManagerImpl implements PreviewManager {
  private previews: Map<string, ToolPreviewState> = new Map();
  private sessionPreviews: Map<string, Set<string>> = new Map();
  private executionPreviews: Map<string, string> = new Map();

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
 */
export function createPreviewManager(): PreviewManager {
  return new PreviewManagerImpl();
}