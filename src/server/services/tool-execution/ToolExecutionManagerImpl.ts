import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  ToolExecutionManager,
  ToolExecutionStatus,
  PermissionResolvedEventData,
  ToolExecutionEvent,
  ToolExecutionState,
  PermissionRequestedEventData,
  PermissionRequestState
} from '../../../types/platform-types';
import { SessionStatePersistence } from '../SessionStatePersistence';
import { getSessionStatePersistence } from '../sessionPersistenceProvider';

// Import event data types from local module
import { 
  PreviewGeneratedEventData,
  ExecutionCompletedWithPreviewEventData 
} from '../../../types/tool-execution';

import { PreviewManager, ToolPreviewData, ToolPreviewState } from '../../../types/preview';
import { previewService } from '../preview';
import { serverLogger } from '../../logger';

/**
 * Implementation of ToolExecutionManager that stores state in memory
 * with persistence support
 */
export class ToolExecutionManagerImpl implements ToolExecutionManager {
  private executions: Map<string, ToolExecutionState> = new Map();
  private sessionExecutions: Map<string, Set<string>> = new Map();
  private permissionRequests: Map<string, PermissionRequestState> = new Map();
  private sessionPermissions: Map<string, Set<string>> = new Map();
  private executionPermissions: Map<string, string> = new Map();
  private eventEmitter = new EventEmitter();
  private previewManager: PreviewManager;
  private persistence: SessionStatePersistence;

  
  /**
   * Create a new ToolExecutionManagerImpl
   * @param persistenceService Optional persistence service to use
   */
  constructor(previewManager: PreviewManager, persistenceService?: SessionStatePersistence) {
    // Use provided persistence service or get singleton instance
    this.persistence = persistenceService || getSessionStatePersistence();
    this.previewManager = previewManager;
    
  }

  /**
   * Create a new tool execution
   * @param sessionId The session ID
   * @param toolId The tool ID
   * @param toolName The tool name
   * @param executionId The execution ID (from message.toolCalls[].executionId)
   * @param args The tool arguments
   */
  createExecution(
    sessionId: string, 
    toolId: string, 
    toolName: string,
    executionId: string,
    toolUseId: string,
    args: Record<string, unknown>
  ): ToolExecutionState {
    // Use the provided executionId directly
    const execution: ToolExecutionState = {
      id: executionId,
      toolUseId: toolUseId,
      sessionId,
      toolId,
      toolName,
      status: ToolExecutionStatus.PENDING,
      args,
      startTime: new Date().toISOString()
    };

    // Store the execution
    this.executions.set(executionId, execution);

    // Add to session executions
    if (!this.sessionExecutions.has(sessionId)) {
      this.sessionExecutions.set(sessionId, new Set());
    }
    this.sessionExecutions.get(sessionId)!.add(executionId);

    // Emit event
    this.emitEvent(ToolExecutionEvent.CREATED, execution);
    
    serverLogger.debug(`Created tool execution: ${executionId}`, {
      executionId,
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
      // Check if we already have a preview
      // If the execution status is COMPLETED, always generate a fresh completion preview
      // This ensures we replace any permission preview with an actual result preview
      if (execution.previewId) {
        const existingPreview = this.previewManager.getPreview(execution.previewId);
        
        // Log information about existing preview for debugging
        if (existingPreview) {
          serverLogger.debug(`Found existing preview for execution ${executionId}`, {
            previewId: existingPreview.id,
            contentType: existingPreview.contentType,
            isPermissionPreview: existingPreview.metadata?.isPermissionPreview || false
          });
          
          // If this is a completed execution, we always want to generate a new preview
          // to replace any permission preview with the actual result preview
          serverLogger.debug(`For completed execution ${executionId}, generating fresh result preview`);
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
      
      // Enhance metadata to mark as completion preview
      const enhancedMetadata = {
        ...generatedPreview.metadata,
        isCompletionPreview: true,
        completionTime: new Date().toISOString()
      };
      
      // Extract fullContent if available
      let fullContent = undefined;
      if (generatedPreview.hasFullContent && 'fullContent' in generatedPreview) {
        fullContent = (generatedPreview as any).fullContent;
      } else if (generatedPreview.briefContent) {
        // Use briefContent as fallback
        fullContent = generatedPreview.briefContent;
      }
      
      // Create a preview state
      const preview = this.previewManager.createPreview(
        execution.sessionId,
        execution.id,
        generatedPreview.contentType,
        generatedPreview.briefContent,
        fullContent,
        enhancedMetadata
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

    // Check if there's already a permission request for this execution
    const existingPermissionId = this.executionPermissions.get(executionId);
    if (existingPermissionId) {
      const existingPermission = this.permissionRequests.get(existingPermissionId);
      if (existingPermission && !existingPermission.resolvedTime) {
        serverLogger.warn(`Permission request already exists for execution ${executionId}, returning existing request`);
        return existingPermission;
      }
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

    // Check if we already have a preview for this execution
    let previewId = execution.previewId;
    let previewState;

    // If no existing preview, generate one for the permission
    if (!previewId) {
      try {
        const toolInfo = {
          id: execution.toolId,
          name: execution.toolName
        };
        
        console.log(`Generating permission preview for ${executionId} (${toolInfo.name})`, {
          toolId: toolInfo.id,
          toolName: toolInfo.name,
          executionId,
          argsKeys: Object.keys(args)
        });
        
        // Generate a permission preview using the preview service
        const preview: ToolPreviewData  = previewService.generatePermissionPreview(toolInfo, args);
        
        // If we have a preview, associate it with the execution
        if (preview) {
          // Make sure metadata includes isPermissionPreview flag
          const enhancedMetadata = {
            ...preview.metadata,
            isPermissionPreview: true,
            permissionRequestTime: new Date().toISOString()
          };
          
          // Create a preview state
          // For permission previews, check if we need to extract any fullContent
          let fullContent: string | undefined = undefined;
          if (preview.hasFullContent && 'fullContent' in preview) {
            fullContent = preview.fullContent as string;
          } else {
            // Use briefContent as fallback
            fullContent = preview.briefContent;
          }
          
          previewState = this.previewManager.createPreview(
            execution.sessionId,
            execution.id,
            preview.contentType,
            preview.briefContent,
            fullContent,
            enhancedMetadata
          );
          
          // Get the preview ID
          previewId = previewState.id;
          
          // Associate the preview with the execution
          this.associatePreview(execution.id, previewId);
          
          console.log(`Generated permission preview for execution ${executionId}`, {
            previewId: previewId,
            contentType: preview.contentType,
            briefContentLength: preview.briefContent?.length || 0,
            hasFullContent: preview.hasFullContent || false
          });
        }
      } catch (error) {
        console.error(`Error generating permission preview for ${executionId}:`, error);
      }
    } else {
      // Use existing preview
      console.log(`Using existing preview ${previewId} for permission request ${id}`);
      
      // Get the existing preview
      previewState = this.previewManager.getPreview(previewId);
    }

    // Update permission request with preview ID for consistent handling
    if (previewId) {
      permissionRequest.previewId = previewId;
      // Update the stored permission request with the preview ID
      this.permissionRequests.set(id, permissionRequest);
    }
    
    // Emit the event with the execution and permission request
    // Include preview if available
    const eventData: PermissionRequestedEventData = {
      execution: this.executions.get(executionId)!,
      permissionRequest,
      preview: previewState
    };
   
    this.emitEvent(ToolExecutionEvent.PERMISSION_REQUESTED, eventData);
    
    serverLogger.debug(`Created permission request: ${id} for execution: ${executionId}${previewId ? ' with preview' : ''}`, {
      permissionId: id,
      executionId,
      toolId: execution.toolId,
      previewId
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

    // Get execution for event
    const execution = this.executions.get(executionId);
    
    // Get the preview associated with this permission request if it exists
    let preview = undefined;
    // Add detailed logging to track the preview ID and resolution process
    console.log(`🔎 [ToolExecutionManager] Resolving permission with previewId: ${updatedPermission.previewId || 'none'}`);
    
    if (updatedPermission.previewId) {
      try {
        // Try to get the preview that was created during permission request
        preview = this.previewManager.getPreview(updatedPermission.previewId);
      } catch (error) {
        console.error(`[ToolExecutionManager] Error retrieving preview:`, error);
      }
    } else {
      console.log(`[ToolExecutionManager] No previewId in permission request ${permissionId} for execution ${executionId}`);
    }

    // Emit event with the preview included
    this.emitEvent(ToolExecutionEvent.PERMISSION_RESOLVED, {
      execution,
      permissionRequest: updatedPermission,
      preview
    } as PermissionResolvedEventData);
    
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
    // Validate data before emitting events to prevent null/undefined from causing issues
    if (!data) {
      serverLogger.error(`Cannot emit ${event} event with invalid data: ${data}`);
      return;
    }
    
    // For permission events, ensure permissionRequest is defined and has an id
    if (event === ToolExecutionEvent.PERMISSION_REQUESTED || event === ToolExecutionEvent.PERMISSION_RESOLVED) {
      const typedData = data as { permissionRequest?: PermissionRequestState; execution?: ToolExecutionState };
      if (!typedData.permissionRequest || !typedData.permissionRequest.id || !typedData.execution) {
        serverLogger.error(`Cannot emit ${event} with invalid permission data:`, typedData);
        return;
      }
    }
    
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
    try {
      // Load the session data
      const sessionData = await this.persistence.loadSession(sessionId);
      
      // Restore the data (only if we have a session)
      if (sessionData) {
        // First, clear any existing data for this session
        this.clearSessionData(sessionId);
        
        // Add executions to the manager
        for (const execution of sessionData.toolExecutions) {
          this.executions.set(execution.id, execution);
          
          // Add to session executions
          if (!this.sessionExecutions.has(sessionId)) {
            this.sessionExecutions.set(sessionId, new Set());
          }
          this.sessionExecutions.get(sessionId)!.add(execution.id);
        }
        
        // Add permissions to the manager
        for (const permission of sessionData.permissionRequests) {
          this.permissionRequests.set(permission.id, permission);
          
          // Add to session permissions
          if (!this.sessionPermissions.has(sessionId)) {
            this.sessionPermissions.set(sessionId, new Set());
          }
          this.sessionPermissions.get(sessionId)!.add(permission.id);
          
          // Link execution to permission if not resolved
          if (!permission.resolvedTime) {
            this.executionPermissions.set(permission.executionId, permission.id);
          }
        }
        
        serverLogger.info(`Loaded tool execution data for session ${sessionId}: ${sessionData.toolExecutions.length} executions, ${sessionData.permissionRequests.length} permissions`);
      }
    } catch (error) {
      serverLogger.error(`Failed to load tool execution data for session ${sessionId}:`, error);
    }
  }

  /**
   * Helper method to clear session data
   * @private
   */
  private clearSessionData(sessionId: string): void {
    // Get all execution IDs for the session
    const executionIds = this.sessionExecutions.get(sessionId) || new Set();
    
    // Remove all executions
    for (const id of executionIds) {
      this.executions.delete(id);
      
      // Also remove any permission links
      const permissionId = this.executionPermissions.get(id);
      if (permissionId) {
        this.executionPermissions.delete(id);
      }
    }
    
    // Clear the session executions
    this.sessionExecutions.delete(sessionId);
    
    // Get all permission IDs for the session
    const permissionIds = this.sessionPermissions.get(sessionId) || new Set();
    
    // Remove all permissions
    for (const id of permissionIds) {
      this.permissionRequests.delete(id);
    }
    
    // Clear the session permissions
    this.sessionPermissions.delete(sessionId);
  }
  
  /**
   * Delete session data from persistence
   * @param sessionId Session identifier
   */
  async deleteSessionData(sessionId: string): Promise<void> {
    try {
      // Clear in-memory data first
      this.clearSessionData(sessionId);
      
      // Then delete persisted data
      await this.persistence.deleteSession(sessionId);
      serverLogger.debug(`Deleted persisted tool execution data for session ${sessionId}`);
    } catch (error) {
      serverLogger.error(`Failed to delete persisted tool execution data for session ${sessionId}:`, error);
    }
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
      serverLogger.warn(`No permission request found for execution ID: ${executionId}`);
      return null;
    }
    
    // Check if permission has already been resolved
    const existingPermission = this.permissionRequests.get(permissionId);
    if (!existingPermission) {
      serverLogger.warn(`Permission request ${permissionId} not found for execution ${executionId}`);
      return null;
    }
    
    // If already resolved, don't process it again
    if (existingPermission.resolvedTime) {
      serverLogger.warn(`Permission request ${permissionId} for execution ${executionId} already resolved at ${existingPermission.resolvedTime}, ignoring duplicate resolution request`);
      return existingPermission;
    }
    
    // Resolve the permission request
    serverLogger.debug(`Resolving permission request ${permissionId} for execution ${executionId} with granted=${granted}`);
    return this.resolvePermission(permissionId, granted);
  }
}

/**
 * Create a new ToolExecutionManager
 * @param persistenceService Optional persistence service to use
 * @returns New ToolExecutionManager instance
 */
export function createToolExecutionManager(
  previewManager: PreviewManager,
  persistenceService?: SessionStatePersistence
): ToolExecutionManager {
  return new ToolExecutionManagerImpl(previewManager, persistenceService);
}