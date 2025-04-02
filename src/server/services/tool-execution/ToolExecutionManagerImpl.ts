import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  ToolExecutionManager,
  ToolExecutionState,
  ToolExecutionStatus,
  ToolExecutionEvent,
  PermissionRequestState
} from '../../../types/tool-execution';


// Define event data types locally
export interface PreviewGeneratedEventData {
  execution: ToolExecutionState;
  preview: ToolPreviewState;
}

export interface ExecutionCompletedWithPreviewEventData {
  execution: ToolExecutionState;
  preview?: ToolPreviewState;
}
import { PreviewManager, ToolPreviewState, PreviewContentType } from '../../../types/preview';
import { createPreviewManager } from '../PreviewManagerImpl';
import { previewService } from '../preview';
import { serverLogger } from '../../logger';

/**
 * Implementation of ToolExecutionManager that stores state in memory
 */
export class ToolExecutionManagerImpl implements ToolExecutionManager {
  private executions: Map<string, ToolExecutionState> = new Map();
  private sessionExecutions: Map<string, Set<string>> = new Map();
  private permissionRequests: Map<string, PermissionRequestState> = new Map();
  private sessionPermissions: Map<string, Set<string>> = new Map();
  private executionPermissions: Map<string, string> = new Map();
  private eventEmitter = new EventEmitter();

  /**
   * Create a new tool execution
   */
  createExecution(
    sessionId: string, 
    toolId: string, 
    toolName: string, 
    args: Record<string, unknown>
  ): ToolExecutionState {
    const id = uuidv4();
    const execution: ToolExecutionState = {
      id,
      sessionId,
      toolId,
      toolName,
      status: ToolExecutionStatus.PENDING,
      args,
      startTime: new Date().toISOString()
    };

    // Store the execution
    this.executions.set(id, execution);

    // Add to session executions
    if (!this.sessionExecutions.has(sessionId)) {
      this.sessionExecutions.set(sessionId, new Set());
    }
    this.sessionExecutions.get(sessionId)!.add(id);

    // Emit event
    this.emitEvent(ToolExecutionEvent.CREATED, execution);
    
    serverLogger.debug(`Created tool execution: ${id}`, {
      executionId: id,
      toolId,
      toolName,
      sessionId
    });

    return execution;
  }

  /**
   * Update an existing tool execution
   */
  updateExecution(executionId: string, updates: Partial<ToolExecutionState>): ToolExecutionState {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Tool execution not found: ${executionId}`);
    }

    // Create updated execution with immutable pattern
    const updatedExecution: ToolExecutionState = {
      ...execution,
      ...updates
    };

    // Store the updated execution
    this.executions.set(executionId, updatedExecution);

    // Emit event
    this.emitEvent(ToolExecutionEvent.UPDATED, updatedExecution);
    
    serverLogger.debug(`Updated tool execution: ${executionId}`, {
      executionId,
      updates: Object.keys(updates)
    });

    return updatedExecution;
  }

  /**
   * Update the status of a tool execution
   */
  updateStatus(executionId: string, status: ToolExecutionStatus): ToolExecutionState {
    return this.updateExecution(executionId, { status });
  }

  /**
   * Start a tool execution
   */
  startExecution(executionId: string): ToolExecutionState {
    return this.updateStatus(executionId, ToolExecutionStatus.RUNNING);
  }

  /**
   * Generate a preview for a tool execution
   * This will use the appropriate preview generator for the tool type
   * @param executionId ID of the tool execution to generate a preview for
   * @param previewManager Optional preview manager to use (otherwise uses default)
   * @returns Promise resolving to the generated preview state (or null if no preview could be generated)
   */
  async generatePreviewForExecution(
    executionId: string,
    previewManager?: PreviewManager
  ): Promise<ToolPreviewState | null> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Tool execution not found: ${executionId}`);
    }
    
    // Only generate previews for completed executions
    if (execution.status !== ToolExecutionStatus.COMPLETED) {
      serverLogger.debug(`Not generating preview for non-completed execution: ${executionId}`, {
        status: execution.status,
        toolId: execution.toolId
      });
      return null;
    }

    try {
      // Use or create a preview manager
      const previewMgr = previewManager || createPreviewManager();
      
      // Check if we already have a preview
      if (execution.previewId) {
        const existingPreview = previewMgr.getPreview(execution.previewId);
        if (existingPreview) {
          serverLogger.debug(`Preview already exists for execution ${executionId}`, {
            previewId: existingPreview.id,
            contentType: existingPreview.contentType
          });
          return existingPreview;
        }
      }
      
      // Generate preview
      serverLogger.debug(`Generating preview for execution ${executionId}`, {
        toolId: execution.toolId,
        toolName: execution.toolName
      });
      
      const generatedPreview = await previewService.generatePreview(
        { id: execution.toolId, name: execution.toolName },
        execution.args || {},
        execution.result
      );
      
      if (!generatedPreview) {
        serverLogger.debug(`No preview generator available for ${execution.toolId}`);
        return null;
      }
      
      // Create a preview state
      const preview = previewMgr.createPreview(
        execution.sessionId,
        execution.id,
        generatedPreview.contentType,
        generatedPreview.briefContent,
        generatedPreview.hasFullContent ? 
          // If fullContent is available, extract it from the generated preview
          (generatedPreview as any).fullContent : undefined,
        generatedPreview.metadata
      );
      
      // Associate the preview with the execution
      this.associatePreview(execution.id, preview.id);
      
      // Emit an event to notify that a preview was generated
      const eventData: PreviewGeneratedEventData = {
        execution: this.executions.get(executionId)!,
        preview
      };
      this.emitEvent(ToolExecutionEvent.PREVIEW_GENERATED, eventData);
      
      serverLogger.info(`Generated preview for execution ${executionId}`, {
        previewId: preview.id,
        contentType: preview.contentType,
        briefContentLength: preview.briefContent?.length || 0,
        hasFullContent: !!preview.fullContent
      });
      
      return preview;
    } catch (error) {
      serverLogger.error(`Error generating preview for execution ${executionId}:`, error);
      return null;
    }
  }
  
  /**
   * Complete a tool execution with results
   * Also attempts to generate a preview
   */
  completeExecution(executionId: string, result: unknown, executionTime: number): ToolExecutionState {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Tool execution not found: ${executionId}`);
    }

    const endTime = new Date().toISOString();
    
    // First update the execution state to mark it as completed
    const updatedExecution = this.updateExecution(executionId, {
      status: ToolExecutionStatus.COMPLETED,
      result,
      endTime,
      executionTime
    });

    serverLogger.info(`Completed tool execution: ${executionId}`, {
      executionId,
      toolName: updatedExecution.toolName,
      toolId: updatedExecution.toolId,
      sessionId: updatedExecution.sessionId,
      executionTime,
      resultType: typeof result,
      status: updatedExecution.status,
      timestamp: endTime
    });

    // Now generate a preview asynchronously (but don't wait for it)
    // We return immediately with the execution, and the preview will be
    // generated and emitted as a separate event later
    this.generatePreviewForExecution(executionId)
      .then(preview => {
        // Create the event data with the preview
        const eventData: ExecutionCompletedWithPreviewEventData = {
          execution: updatedExecution,
          preview: preview || undefined
        };
        // Emit completion event with the preview data
        this.emitEvent(ToolExecutionEvent.COMPLETED, eventData);
      })
      .catch(error => {
        // If preview generation fails, still emit the completion event with just the execution
        serverLogger.error(`Failed to generate preview for ${executionId}, emitting completion without preview:`, error);
        // Create event data with just the execution
        const eventData: ExecutionCompletedWithPreviewEventData = {
          execution: updatedExecution
        };
        this.emitEvent(ToolExecutionEvent.COMPLETED, eventData);
      });
      
    // Return the updated execution immediately
    return updatedExecution;
  }

  /**
   * Mark a tool execution as failed
   */
  failExecution(executionId: string, error: Error): ToolExecutionState {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Tool execution not found: ${executionId}`);
    }

    const endTime = new Date().toISOString();
    const executionTime = new Date(endTime).getTime() - new Date(execution.startTime).getTime();
    
    const updatedExecution = this.updateExecution(executionId, {
      status: ToolExecutionStatus.ERROR,
      error: {
        message: error.message,
        stack: error.stack
      },
      endTime,
      executionTime
    });

    // Emit error event
    this.emitEvent(ToolExecutionEvent.ERROR, updatedExecution);
    
    serverLogger.debug(`Failed tool execution: ${executionId}`, {
      executionId,
      error: error.message
    });

    return updatedExecution;
  }

  /**
   * Abort a tool execution
   */
  abortExecution(executionId: string): ToolExecutionState {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Tool execution not found: ${executionId}`);
    }

    const endTime = new Date().toISOString();
    const executionTime = new Date(endTime).getTime() - new Date(execution.startTime).getTime();
    
    const updatedExecution = this.updateExecution(executionId, {
      status: ToolExecutionStatus.ABORTED,
      endTime,
      executionTime
    });

    // Emit abort event
    this.emitEvent(ToolExecutionEvent.ABORTED, updatedExecution);
    
    serverLogger.debug(`Aborted tool execution: ${executionId}`, {
      executionId
    });

    return updatedExecution;
  }

  /**
   * Create a permission request for a tool execution
   */
  requestPermission(executionId: string, args: Record<string, unknown>): PermissionRequestState {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Tool execution not found: ${executionId}`);
    }

    const id = uuidv4();
    const permissionRequest: PermissionRequestState = {
      id,
      sessionId: execution.sessionId,
      toolId: execution.toolId,
      toolName: execution.toolName,
      args,
      requestTime: new Date().toISOString(),
      executionId
    };

    // Store the permission request
    this.permissionRequests.set(id, permissionRequest);

    // Add to session permissions
    if (!this.sessionPermissions.has(execution.sessionId)) {
      this.sessionPermissions.set(execution.sessionId, new Set());
    }
    this.sessionPermissions.get(execution.sessionId)!.add(id);

    // Link execution to permission
    this.executionPermissions.set(executionId, id);

    // Update execution status
    this.updateStatus(executionId, ToolExecutionStatus.AWAITING_PERMISSION);

    // Emit event
    this.emitEvent(ToolExecutionEvent.PERMISSION_REQUESTED, {
      execution: this.executions.get(executionId),
      permission: permissionRequest
    });
    
    serverLogger.debug(`Created permission request: ${id} for execution: ${executionId}`, {
      permissionId: id,
      executionId,
      toolId: execution.toolId
    });

    return permissionRequest;
  }

  /**
   * Resolve a permission request
   */
  resolvePermission(permissionId: string, granted: boolean): PermissionRequestState {
    const permissionRequest = this.permissionRequests.get(permissionId);
    if (!permissionRequest) {
      throw new Error(`Permission request not found: ${permissionId}`);
    }

    // Update the permission request
    const updatedPermission: PermissionRequestState = {
      ...permissionRequest,
      resolvedTime: new Date().toISOString(),
      granted
    };

    // Store the updated permission
    this.permissionRequests.set(permissionId, updatedPermission);

    const { executionId } = permissionRequest;

    // Update the execution status based on permission
    if (granted) {
      this.updateStatus(executionId, ToolExecutionStatus.RUNNING);
    } else {
      this.failExecution(executionId, new Error('Permission denied'));
    }

    // Emit event
    this.emitEvent(ToolExecutionEvent.PERMISSION_RESOLVED, {
      execution: this.executions.get(executionId),
      permission: updatedPermission
    });
    
    serverLogger.debug(`Resolved permission request: ${permissionId}`, {
      permissionId,
      executionId,
      granted
    });

    return updatedPermission;
  }

  /**
   * Associate a preview with a tool execution
   */
  associatePreview(executionId: string, previewId: string): ToolExecutionState {
    return this.updateExecution(executionId, { previewId });
  }

  /**
   * Get a tool execution by ID
   */
  getExecution(executionId: string): ToolExecutionState | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Get all tool executions for a session
   */
  getExecutionsForSession(sessionId: string): ToolExecutionState[] {
    const executionIds = this.sessionExecutions.get(sessionId) || new Set();
    return Array.from(executionIds)
      .map(id => this.executions.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get a permission request by ID
   */
  getPermissionRequest(permissionId: string): PermissionRequestState | undefined {
    return this.permissionRequests.get(permissionId);
  }

  /**
   * Get all permission requests for a session
   */
  getPermissionRequestsForSession(sessionId: string): PermissionRequestState[] {
    const permissionIds = this.sessionPermissions.get(sessionId) || new Set();
    return Array.from(permissionIds)
      .map(id => this.permissionRequests.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get the permission request for a tool execution
   */
  getPermissionRequestForExecution(executionId: string): PermissionRequestState | undefined {
    const permissionId = this.executionPermissions.get(executionId);
    return permissionId ? this.permissionRequests.get(permissionId) : undefined;
  }

  /**
   * Register a listener for tool execution events
   */
  on(event: ToolExecutionEvent | string, listener: (data: unknown) => void): () => void {
    this.eventEmitter.on(event, listener);
    return () => this.eventEmitter.off(event, listener);
  }

  /**
   * Helper method to emit events
   */
  private emitEvent(event: ToolExecutionEvent | string, data: unknown): void {
    this.eventEmitter.emit(event, data);
  }

  /**
   * Clear all data (mainly for testing)
   */
  clear(): void {
    this.executions.clear();
    this.sessionExecutions.clear();
    this.permissionRequests.clear();
    this.sessionPermissions.clear();
    this.executionPermissions.clear();
  }

  /**
   * Load session data from persistence layer
   * @param sessionId The session ID to load data for
   */
  async loadSessionData(sessionId: string): Promise<void> {
    // Placeholder - we'll implement proper persistence in the future
    serverLogger.debug(`Loading session data for ${sessionId}`);
    // Just a stubbed implementation for now to make TypeScript happy
    return Promise.resolve();
  }

  /**
   * Save session data to persistence layer
   * @param sessionId The session ID to save data for
   */
  async saveSessionData(sessionId: string): Promise<void> {
    // Placeholder - we'll implement proper persistence in the future
    serverLogger.debug(`Saving session data for ${sessionId}`);
    // Just a stubbed implementation for now to make TypeScript happy
    return Promise.resolve();
  }

  /**
   * Resolve a permission request by execution ID
   * @param executionId The execution ID to resolve the permission for
   * @param granted Whether permission is granted
   */
  resolvePermissionByExecutionId(executionId: string, granted: boolean): PermissionRequestState | null {
    // Find the permission request for this execution
    const permissionId = this.executionPermissions.get(executionId);
    if (!permissionId) {
      return null;
    }
    
    // Resolve the permission request
    return this.resolvePermission(permissionId, granted);
  }
}

/**
 * Create a new ToolExecutionManager
 */
export function createToolExecutionManager(): ToolExecutionManager {
  return new ToolExecutionManagerImpl();
}