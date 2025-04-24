/**
 * Timeline Service for unified chronological feeds of messages and tool executions
 */
import { EventEmitter } from 'events';
import {
  MESSAGE_UPDATED,
} from '../../types/message';
import {
  ToolExecutionState,
  PermissionRequestState,
  ToolExecutionStatus,
  PermissionRequestedEventData,
  PermissionResolvedEventData,
} from '../../types/platform-types';
import { StoredMessage } from '../../types/session';

// Import event data types from the implementation
import {
  ExecutionCompletedWithPreviewEventData
} from '../../types/tool-execution';
import { ToolPreviewState } from '../../types/preview';
import { 
  TimelineItemType,
  TimelineResponse,
  TimelineParams,
  MessageTimelineItem,
  ToolExecutionTimelineItem,
  PermissionRequestTimelineItem,
} from '../../types/timeline';
import { WebSocketEvent } from '../../types/websocket';
import { WebSocketService } from './WebSocketService';
import { serverLogger } from '../logger';
import { AgentServiceEvent } from './AgentService';
import { AgentServiceRegistry } from './AgentServiceRegistry';
import { TimelineStatePersistence } from './TimelineStatePersistence';

export enum TimelineServiceEvent {
  ITEM_ADDED = 'item_added',
  ITEMS_UPDATED = 'items_updated',
  ITEM_UPDATED = 'item_updated'
}

export class TimelineService extends EventEmitter {
  // No cache needed, using timeline persistence directly
  private lastToolUpdates: Map<string, number> = new Map<string, number>();

  constructor(
    private webSocketService: WebSocketService,
    private timelinePersistence: TimelineStatePersistence,
    private agentServiceRegistry: AgentServiceRegistry
  ) {
    super();
    
    // Set up event handlers
    this.setupEventListeners();
  }
  
  /**
   * Truncate timeline at a specific tool execution ID for rollback
   * @param sessionId The session ID
   * @param toolExecutionId The tool execution ID to truncate at
   * @returns Promise resolving to boolean indicating success
   */
  public async truncateTimelineAtToolExecution(
    sessionId: string,
    toolExecutionId: string
  ): Promise<boolean> {
    try {
      serverLogger.info(`Truncating timeline at tool execution ${toolExecutionId} for session ${sessionId}`);
      
      // Get the current timeline items
      const allItems = await this.timelinePersistence.loadTimelineItems(sessionId);
      
      // Find the index of the tool execution in the timeline
      const toolIndex = allItems.findIndex(
        item => item.type === TimelineItemType.TOOL_EXECUTION && item.id === toolExecutionId
      );
      
      if (toolIndex === -1) {
        serverLogger.warn(`Tool execution ${toolExecutionId} not found in timeline for session ${sessionId}`);
        return false;
      }
      
      // Get the truncated timeline (items before the tool execution)
      // We exclude the tool execution itself from the timeline
      const truncatedTimeline = allItems.slice(0, toolIndex);
      
      // Save the truncated timeline
      await this.timelinePersistence.replaceTimeline(sessionId, truncatedTimeline);
      
      serverLogger.info(
        `Timeline truncated successfully at tool execution ${toolExecutionId} for session ${sessionId}. ` +
        `${allItems.length - truncatedTimeline.length} items removed.`
      );
      
      return true;
    } catch (error) {
      serverLogger.error(`Error truncating timeline at tool execution ${toolExecutionId}:`, error);
      return false;
    }
  }

  /**
   * Get timeline items for a session
   */
  public async getTimelineItems(
    sessionId: string,
    params: TimelineParams = {}
  ): Promise<TimelineResponse> {
    const { limit = 50, pageToken, types } = params;
    
    // Log that we're retrieving timeline items
    serverLogger.debug(`Retrieving timeline items for session ${sessionId}`);
    
    // Load directly from timeline persistence
    const timelineItems = await this.timelinePersistence.loadTimelineItems(sessionId);
    
    // Debug log to check if we have user messages
    const userMessages = timelineItems.filter(item => 
      item.type === TimelineItemType.MESSAGE && item.message.role === 'user'
    );
    const assistantMessages = timelineItems.filter(item => 
      item.type === TimelineItemType.MESSAGE && item.message.role === 'assistant'
    );
    
    // Warn if we're missing user messages but have assistant messages (suspicious)
    if (userMessages.length === 0 && assistantMessages.length > 0) {
      serverLogger.warn(`[TIMELINE WARNING] Found ${assistantMessages.length} assistant messages but NO user messages. This might indicate a timeline sorting issue.`);
    }
    
    // Log how many items we found
    serverLogger.debug(`Loaded ${timelineItems.length} timeline items for session ${sessionId} (${userMessages.length} user, ${assistantMessages.length} assistant)`);
    
    // Apply filtering by types if specified
    let filteredItems = timelineItems;
    if (types && types.length > 0) {
      filteredItems = timelineItems.filter(item => types.includes(item.type));
    }
    
    // Apply pagination
    const startIndex = pageToken ? parseInt(pageToken, 10) : 0;
    const endIndex = startIndex + limit;
    const paginatedItems = filteredItems.slice(startIndex, endIndex);
    
    // Generate next page token if there are more items
    const nextPageToken = endIndex < filteredItems.length ? endIndex.toString() : undefined;
    
    // Log how many items we're returning
    serverLogger.debug(`Returning ${paginatedItems.length} timeline items for session ${sessionId}`);
    
    return {
      items: paginatedItems,
      nextPageToken,
      totalCount: filteredItems.length
    };
  }
  
  /**
   * Add or update a message in the timeline
   * Public method that can be called directly from controllers
   */
  public async addMessageToTimeline(sessionId: string, message: StoredMessage): Promise<MessageTimelineItem> {
    // Use the internal implementation and also emit events to the agent service
    const timelineItem = await this.addMessageToTimelineInternal(sessionId, message);
    
    // Emit the MESSAGE_RECEIVED event to WebSocket clients
    this.emitToSession(sessionId, WebSocketEvent.MESSAGE_RECEIVED, {
      sessionId,
      message: timelineItem.message
    });
    
    return timelineItem;
  }
  
  /**
   * Internal version of addMessageToTimeline that doesn't emit events back to agent
   * Used to break circular dependencies when handling agent events
   */
  private async addMessageToTimelineInternal(sessionId: string, message: StoredMessage): Promise<MessageTimelineItem> {
    // Create the timeline item with a validated timestamp
    const timestamp = message.timestamp || new Date().toISOString();
    
    // Validate timestamp by trying to parse it
    let validatedTimestamp = timestamp;
    try {
      // Check if it's a valid timestamp
      new Date(timestamp).toISOString();
    } catch {
      // If invalid, use current time
      validatedTimestamp = new Date().toISOString();
      serverLogger.warn(`Invalid timestamp detected for message ${message.id}, using current time instead`);
    }
    
    // Set appropriate sequence number if not already provided
    if (message.sequence === undefined) {
      // Get existing messages to determine next sequence number
      const existingItems = await this.timelinePersistence.loadTimelineItems(sessionId);
      const messageItems = existingItems.filter(item => 
        item.type === TimelineItemType.MESSAGE
      );
      
      // Find the highest sequence number
      let highestSequence = -1;
      messageItems.forEach(item => {
        if (item.message.sequence !== undefined && item.message.sequence > highestSequence) {
          highestSequence = item.message.sequence;
        }
      });
      
      // Use even numbers (0, 2, 4...) for user messages, odd (1, 3, 5...) for assistant
      // This helps maintain proper conversation order
      if (message.role === 'user') {
        message.sequence = highestSequence < 0 ? 0 : highestSequence + (highestSequence % 2 === 0 ? 2 : 1);
      } else {
        message.sequence = highestSequence < 0 ? 1 : highestSequence + (highestSequence % 2 === 0 ? 1 : 2);
      }
    }
    
    // Log the message being added with sequence number
    serverLogger.debug(`Adding message to timeline: role=${message.role}, id=${message.id}, sequence=${message.sequence}`);
    
    const timelineItem: MessageTimelineItem = {
      id: message.id,
      type: TimelineItemType.MESSAGE,
      timestamp: validatedTimestamp,
      sessionId,
      message,
      toolExecutions: message.toolCalls?.map(call => call.executionId)
    };
    
    // Save to timeline persistence
    await this.timelinePersistence.addTimelineItem(sessionId, timelineItem);
    
    // Only emit our internal timeline event, NOT back to agent service
    this.emit(TimelineServiceEvent.ITEM_ADDED, timelineItem);
    
    return timelineItem;
  }

  /**
   * Add or update a tool execution in the timeline
   * with built-in circuit breaker to prevent infinite loops
   */
  private async addToolExecutionToTimeline(
    sessionId: string,
    toolExecution: ToolExecutionState,
    preview?: ToolPreviewState,
    parentMessageId?: string
  ): Promise<ToolExecutionTimelineItem> {
    // Implement circuit breaker for tool execution updates
    // This prevents infinite recursion when multiple services update the same tool
    const executionId = toolExecution.id;
    const now = Date.now();
    const recentKey = `tool_${executionId}_${Math.floor(now / 1000)}`;
    
    // Initialize the updates tracking map if needed
    if (!this.lastToolUpdates) {
      this.lastToolUpdates = new Map<string, number>();
    }
    
    const lastUpdate = this.lastToolUpdates.get(recentKey);
    
    // Skip if recently updated (within 1 second)
    if (lastUpdate && (now - lastUpdate < 1000)) {
      serverLogger.warn(`[ToolExecution] Skipping duplicate tool execution update for ${executionId} (${now - lastUpdate}ms since last update)`);
      
      // Return a minimal item with just the necessary information
      return {
        id: executionId,
        type: TimelineItemType.TOOL_EXECUTION,
        timestamp: toolExecution.startTime,
        sessionId,
        toolExecution,
        permissionRequest: toolExecution.permissionId,
        preview,
        parentMessageId
      };
    }
    
    // Record this update
    this.lastToolUpdates.set(recentKey, now);
    
    // Clean up the key after a reasonable time
    setTimeout(() => {
      if (this.lastToolUpdates) {
        this.lastToolUpdates.delete(recentKey);
      }
    }, 5000);
    
    // Validate timestamp for tool execution
    const startTime = toolExecution.startTime || new Date().toISOString();
    let validatedStartTime = startTime;
    try {
      // Check if it's a valid timestamp
      new Date(startTime).toISOString();
    } catch {
      // If invalid, use current time
      validatedStartTime = new Date().toISOString();
      serverLogger.warn(`Invalid timestamp detected for tool execution ${toolExecution.id}, using current time instead`);
    }
    
    // Create the timeline item with the provided preview
    const timelineItem: ToolExecutionTimelineItem = {
      id: toolExecution.id,
      type: TimelineItemType.TOOL_EXECUTION,
      timestamp: validatedStartTime,
      sessionId,
      toolExecution,
      permissionRequest: toolExecution.permissionId,
      preview,
      parentMessageId
    };
    
    // Save to timeline persistence
    await this.timelinePersistence.addTimelineItem(sessionId, timelineItem);
    
    // Emit events
    this.emit(TimelineServiceEvent.ITEM_ADDED, timelineItem);
    
    // Emit the TOOL_EXECUTION_RECEIVED or TOOL_EXECUTION_UPDATED event
    if (toolExecution.status === 'running' || toolExecution.status === 'pending') {
      // For new/running tools
      this.emitToSession(sessionId, WebSocketEvent.TOOL_EXECUTION_RECEIVED, {
        sessionId,
        toolExecution: {
          ...toolExecution,
          preview
        }
      });
    } else {
      // For completed/error/aborted tools
      // Check if we have a valid preview with required content
      const hasValidPreview = !!(preview && preview.briefContent);
      
      // Only log if debug preview is enabled
      if (preview && process.env.DEBUG_PREVIEW) {
        serverLogger.info(`Preview data availability for ${toolExecution.id}:`, {
          hasPreview: !!preview,
          hasValidPreview,
          contentType: preview.contentType,
          briefContentExists: !!preview.briefContent,
          briefContentLength: preview.briefContent?.length || 0
        });
      }
      
      // IMPORTANT: Use a copy of the clientPreview object to avoid reference issues
      // This ensures a complete copy of the preview data is sent
      const previewToSend = hasValidPreview ? {
        contentType: preview.contentType,
        briefContent: preview.briefContent,
        fullContent: preview.fullContent,
        metadata: preview.metadata ? {...preview.metadata} : undefined,
        // Add extra fields to ensure client gets all the data
        hasActualContent: true
      } : undefined;
      
      // Send the execution update with preview if available
      
      // Include the full tool execution result if available
      // Check if status indicates it's in a state where we should include the result
      const shouldIncludeResult = 
        toolExecution.status === ToolExecutionStatus.COMPLETED || 
        toolExecution.status === ToolExecutionStatus.ERROR || 
        toolExecution.status === ToolExecutionStatus.ABORTED || 
        toolExecution.status === ToolExecutionStatus.AWAITING_PERMISSION;
        
      const toolExecutionResult = shouldIncludeResult ? toolExecution.result : undefined;
      
      // Ensure we're sending all necessary data, including the result
      this.emitToSession(sessionId, WebSocketEvent.TOOL_EXECUTION_UPDATED, {
        sessionId,
        toolExecution: {
          id: toolExecution.id,
          toolId: toolExecution.toolId,
          toolName: toolExecution.toolName,
          status: toolExecution.status,
          args: toolExecution.args,
          startTime: toolExecution.startTime,
          endTime: toolExecution.endTime,
          executionTime: toolExecution.executionTime,
          error: toolExecution.error,
          result: toolExecutionResult, // Add the tool execution result
          // Include the preview directly in the toolExecution object
          preview: previewToSend,
          // Add these flags to help client-side detection
          hasPreview: hasValidPreview,
          previewContentType: hasValidPreview ? preview.contentType : undefined
        }
      });
    }
    
    return timelineItem;
  }

  /**
   * Add or update a permission request in the timeline
   */
  private async addPermissionRequestToTimeline(
    sessionId: string,
    permissionRequest: PermissionRequestState,
    preview?: ToolPreviewState
  ): Promise<PermissionRequestTimelineItem> {
    // If we have a preview but permissionRequest doesn't have previewId, add it
    if (preview && !permissionRequest.previewId) {
      permissionRequest.previewId = preview.id;
      
      serverLogger.debug(`[TIMELINE] Updated permission request ${permissionRequest.id} with previewId ${preview.id}`);
    }
    
    // Create the timeline item
    const timelineItem: PermissionRequestTimelineItem = {
      id: permissionRequest.id,
      type: TimelineItemType.PERMISSION_REQUEST,
      timestamp: permissionRequest.requestTime,
      sessionId,
      permissionRequest,
      toolExecutionId: permissionRequest.executionId,
      preview
    };
    
    // Save to timeline persistence
    await this.timelinePersistence.addTimelineItem(sessionId, timelineItem);
    
    // Emit events to internal timeline listeners
    this.emit(TimelineServiceEvent.ITEM_ADDED, timelineItem);
    
    // Check if this is a new permission request or a resolved one
    const isResolved = !!permissionRequest.resolvedTime;
    
    // Only emit PERMISSION_REQUESTED for new requests, not for resolved ones
    if (!isResolved) {
      // Log additional debug info
      serverLogger.info(`Emitting permission request with executionId: ${permissionRequest.executionId}`, {
        permissionId: permissionRequest.id,
        toolId: permissionRequest.toolId,
        executionId: permissionRequest.executionId
      });
      
      // Format the preview for client consumption if we have one
      let formattedPreview = undefined;
      if (preview) {
        formattedPreview = {
          contentType: preview.contentType,
          briefContent: preview.briefContent,
          fullContent: preview.fullContent,
          metadata: preview.metadata
        };
        
        serverLogger.debug(`[PERMISSION] Including preview data in PERMISSION_REQUESTED event`, {
          previewId: preview.id,
          contentType: preview.contentType,
          hasMetadata: !!preview.metadata,
          metadataKeys: preview.metadata ? Object.keys(preview.metadata) : []
        });
      }
      
      // Directly emit to WebSocket so the client gets the permission request immediately
      this.emitToSession(sessionId, WebSocketEvent.PERMISSION_REQUESTED, {
        sessionId,
        // This structure is what the client expects in usePermissionKeyboardHandler
        // It has executionId at both places to ensure compatibility
        permission: {
          id: permissionRequest.id,
          toolId: permissionRequest.toolId,
          toolName: permissionRequest.toolName || "Unknown Tool",
          executionId: permissionRequest.executionId,
          args: permissionRequest.args,
          timestamp: permissionRequest.requestTime,
          preview: formattedPreview,
          // Add these flags to help client-side detection
          hasPreview: !!formattedPreview,
          previewContentType: preview?.contentType
        },
        // Also include these top-level fields for UI components
        executionId: permissionRequest.executionId,
        toolId: permissionRequest.toolId,
        toolName: permissionRequest.toolName || "Unknown Tool",
        // Also include preview as a top-level field for components that might expect it there
        preview: formattedPreview,
        hasPreview: !!formattedPreview
      });
      
      // Additionally emit a tool execution update to ensure the status change is visible to clients
      // But ONLY for new permission requests, not resolved ones
      if (permissionRequest.executionId) {
        // Get the execution from cache if available
        const toolExecution: Record<string, unknown> = {
          id: permissionRequest.executionId,
          toolId: permissionRequest.toolId,
          toolName: permissionRequest.toolName || "Unknown Tool",
          status: "awaiting-permission",
          args: permissionRequest.args,
          startTime: permissionRequest.requestTime
        };
        
        // Include preview if available
        if (formattedPreview) {
          toolExecution.preview = formattedPreview;
          toolExecution.hasPreview = true;
          toolExecution.previewContentType = preview?.contentType;
          
          serverLogger.debug(`[PERMISSION] Including preview in TOOL_EXECUTION_UPDATED for ${permissionRequest.executionId}`, {
            previewId: preview?.id,
            contentType: preview?.contentType
          });
        }
        
        this.emitToSession(sessionId, WebSocketEvent.TOOL_EXECUTION_UPDATED, {
          sessionId,
          toolExecution
        });
      }
    }
    
    // In our new model, permissions updates should come through as tool updates
    // Update the associated tool execution if it exists, but with circuit breaker
    if (permissionRequest.executionId) {
      // Use a unique key combining the execution ID and a timestamp rounded to seconds
      // to prevent multiple updates for the same permission within close time proximity
      const executionId = permissionRequest.executionId;
      const now = Date.now();
      const key = `${executionId}_${Math.floor(now / 1000)}`;
      
      // Use a weak map to store last update times (we don't want to grow memory indefinitely)
      if (!this.lastToolUpdates) {
        this.lastToolUpdates = new Map<string, number>();
      }
      
      const lastUpdate = this.lastToolUpdates.get(key);
      
      // If we've already processed this combination recently, skip it
      if (lastUpdate && (now - lastUpdate < 1000)) {
        serverLogger.warn(`[Permission] Skipping duplicate tool update for ${executionId} (${now - lastUpdate}ms since last update)`);
        return timelineItem;
      }
      
      // Record this update
      this.lastToolUpdates.set(key, now);
      
      // Set cleanup for this key
      setTimeout(() => {
        if (this.lastToolUpdates) {
          this.lastToolUpdates.delete(key);
        }
      }, 5000);
      
      // In our new event-based approach, we'll receive a separate TOOL_EXECUTION_UPDATED event
      // when the tool execution is updated with permission state, so we don't need to
      // fetch the tool execution and update it here.
      serverLogger.debug(`[Permission] Permission update will trigger separate tool update for execution ${executionId}`);
    }
    
    return timelineItem;
  }

  /**
   * Emit an event to all clients in a session
   */
  private emitToSession(sessionId: string, event: string, data: Record<string, unknown>): void {
    try {
      // Log important timeline objects
      if (event === WebSocketEvent.TOOL_EXECUTION_UPDATED || 
          event === WebSocketEvent.TOOL_EXECUTION_RECEIVED) {
        serverLogger.debug(`[TIMELINE] Timeline object for ${event}:`, JSON.stringify(data, null, 2));
      }
      
      
      // Use the WebSocketService's public method to emit the event
      this.webSocketService.emitToSession(sessionId, event, data);
    } catch (error) {
      serverLogger.error(`[emitToSession] Error emitting to session ${sessionId}:`, error instanceof Error ? error.message : String(error));
    }
  }
  
 /**
   * Set up event listeners for session events
   */
  private setupEventListeners(): void {
    
    // Listen for permission request events - use a debounce mechanism to prevent cascading permission events
    const permissionDebounce = new Map<string, number>();
    const permissionThresholdMs = 1000; // 1 second
    
    // Subscribe to registry events for tool execution completed
    this.agentServiceRegistry.on(AgentServiceEvent.TOOL_EXECUTION_COMPLETED, (data: ExecutionCompletedWithPreviewEventData) => {
     
      if (!data || !data.execution) {
        serverLogger.warn('Received TOOL_EXECUTION_COMPLETED event with missing data', data);
        return;
      }
      
      // All the data we need is in the event - no need to query other services
      const { execution, preview } = data;
      
      // First, directly emit to WebSocket to ensure the client gets the update
      // This is a critical path to ensure tool visualization works
      try {
        // Check if we have a valid preview
        const hasValidPreview = !!(preview && preview.briefContent);
        
        // Convert preview to client format if available
        const previewToSend = hasValidPreview ? {
          contentType: preview.contentType,
          briefContent: preview.briefContent,
          fullContent: preview.fullContent,
          metadata: preview.metadata ? {...preview.metadata} : undefined,
          hasActualContent: true
        } : undefined;
        
        // Check if we should include the result based on status
        const shouldIncludeResult = 
          execution.status === ToolExecutionStatus.COMPLETED || 
          execution.status === ToolExecutionStatus.ERROR || 
          execution.status === ToolExecutionStatus.ABORTED || 
          execution.status === ToolExecutionStatus.AWAITING_PERMISSION;
        
        // Get the result only if in the right state
        const executionResult = shouldIncludeResult ? execution.result : undefined;
        
        // Log for debugging
        serverLogger.info(`DIRECT WebSocket emission for execution ${execution.id} with preview: ${hasValidPreview}`);
        
        // Directly use the WebSocketService to emit the event
        const payload = {
          sessionId: execution.sessionId,
          toolExecution: {
            id: execution.id,
            toolId: execution.toolId,
            toolName: execution.toolName,
            status: execution.status,
            args: execution.args,
            startTime: execution.startTime,
            endTime: execution.endTime,
            executionTime: execution.executionTime,
            error: execution.error,
            result: executionResult, // Use the conditionally set result
            // Explicitly include the preview
            preview: previewToSend,
            // Add these flags to help client-side detection
            hasPreview: hasValidPreview,
            previewContentType: hasValidPreview ? preview.contentType : undefined
          }
        };
        
        try {
          this.webSocketService.emitToSession(execution.sessionId, WebSocketEvent.TOOL_EXECUTION_UPDATED, payload);
        } catch (emitError) {
          serverLogger.error(`Error emitting TOOL_EXECUTION_UPDATED:`, emitError);
        }
      } catch (error) {
        serverLogger.error(`Error in direct WebSocket emission for tool execution ${execution.id}:`, error);
      }
      
      // Now continue with the usual flow of adding to timeline
      this.findParentMessageId(execution.sessionId, execution.id)
        .then(parentMessageId => {
          // Add the tool execution with its preview to the timeline
          this.addToolExecutionToTimeline(execution.sessionId, execution, preview, parentMessageId)
            .then(() => {
              serverLogger.debug(`TimelineService processed COMPLETED event for execution ${execution.id} with preview: ${!!preview}`);
            })
            .catch(error => {
              serverLogger.error(`Error adding tool execution to timeline for ${execution.id}:`, error);
            });
        })
        .catch(error => {
          serverLogger.error(`Error finding parent message for tool execution ${execution.id}:`, error);
        });
    });
    
    // Subscribe to permission events from registry
    
    this.agentServiceRegistry.on(AgentServiceEvent.PERMISSION_REQUESTED, (data: PermissionRequestedEventData & { sessionId: string }) => {
      
      if (!data || !data.sessionId || !data.permissionRequest || !data.permissionRequest.id) {
        serverLogger.error('[PERMISSION] Missing required data in PERMISSION_REQUESTED event', data);
        return;
      }
      
      // All the data we need is in the event - no need to query other services
      const { sessionId, permissionRequest, preview } = data;
      const permissionId = permissionRequest.id;
      const now = Date.now();
      const lastProcessed = permissionDebounce.get(permissionId);
      
      // Skip if we've already processed this permission recently
      if (lastProcessed && (now - lastProcessed < permissionThresholdMs)) {
        serverLogger.warn(`[PERMISSION] Skipping duplicate PERMISSION_REQUESTED for ${permissionId}, last processed ${now - lastProcessed}ms ago`);
        return;
      }
      
      // Mark as processing
      permissionDebounce.set(permissionId, now);
      
      // Process the permission request
      serverLogger.debug(`[PERMISSION] Processing permission request ${permissionId}`);
      this.addPermissionRequestToTimeline(sessionId, permissionRequest, preview);
      
      // Clean up after a delay
      setTimeout(() => permissionDebounce.delete(permissionId), 2000);
    });
    
    
    this.agentServiceRegistry.on(AgentServiceEvent.PERMISSION_RESOLVED, (data: PermissionResolvedEventData & { sessionId: string }) => {
      
      if (!data || !data.sessionId || !data.permissionRequest || !data.permissionRequest.id) {
        serverLogger.error('[PERMISSION] Missing required data in PERMISSION_RESOLVED event', data);
        return;
      }
      
      // All the data we need is in the event - no need to query other services
      const { sessionId, permissionRequest } = data;
      // PermissionResolved events don't have preview, so default to undefined
      const preview = undefined;
      const permissionId = permissionRequest.id;
      const now = Date.now();
      const lastProcessed = permissionDebounce.get(permissionId);
      
      // Skip if we've already processed this permission recently
      if (lastProcessed && (now - lastProcessed < permissionThresholdMs)) {
        serverLogger.warn(`[PERMISSION] Skipping duplicate PERMISSION_RESOLVED for ${permissionId}, last processed ${now - lastProcessed}ms ago`);
        return;
      }
      
      // Mark as processing
      permissionDebounce.set(permissionId, now);
      
      // Process the permission resolution
      serverLogger.debug(`[PERMISSION] Processing permission resolution ${permissionId}`);
      
      // Add to timeline
      this.addPermissionRequestToTimeline(sessionId, permissionRequest, preview);
      
      // Also directly emit to WebSocket so the client gets the resolution immediately
        
      // This is the expected structure for the client's usePermissionKeyboardHandler
      // Include additional fields to ensure UI components can handle this properly
      this.emitToSession(sessionId, WebSocketEvent.PERMISSION_RESOLVED, {
        sessionId,
        executionId: permissionRequest.executionId,
        resolution: permissionRequest.granted
      });
      
      // Clean up after a delay
      setTimeout(() => permissionDebounce.delete(permissionId), 2000);
    });
    
    this.agentServiceRegistry.on(MESSAGE_UPDATED, (data: any) => {
      
      if (!data || !data.sessionId || !data.message) {
        serverLogger.warn('Received MESSAGE_UPDATED event with missing data', data);
        return;
      }
      
      // Use the internal method to add to timeline without emitting events back to agent
      this.addMessageToTimelineInternal(data.sessionId, data.message)
        .then(() => {
          // Emit to WebSocket clients only
          this.emitToSession(data.sessionId, WebSocketEvent.MESSAGE_UPDATED, {
            sessionId: data.sessionId,
            messageId: data.message.id,
            content: data.message.content,
            isComplete: true
          });
        })
        .catch(err => {
          serverLogger.error(`Error adding updated message to timeline: ${err.message}`);
        });
    });
    
    // Completely disable SESSION_LOADED event handling as a more drastic fix
    // This breaks the event chain that's likely causing infinite loops
    this.agentServiceRegistry.on(AgentServiceEvent.SESSION_LOADED, (data: any) => {
      // Implementation removed to break the event chain
      serverLogger.warn(`[SESSION_LOADED] SESSION_LOADED event received for ${data.sessionId} but intentionally not processed to prevent infinite loops`);
    });
  }
  
    /**
   * Find the parent message ID for a tool execution
   */
  private async findParentMessageId(sessionId: string, executionId: string): Promise<string | undefined> {
    // Get timeline items for the session
    const timelineItems = await this.timelinePersistence.loadTimelineItems(sessionId);
    if (!timelineItems || timelineItems.length === 0) return undefined;
    
    // Look through message timeline items to find one that references this execution
    for (const item of timelineItems) {
      if (item.type === TimelineItemType.MESSAGE) {
        const messageItem = item as MessageTimelineItem;
        if (messageItem.message.toolCalls?.some(call => call.executionId === executionId)) {
          return messageItem.id;
        }
      }
    }
    
    return undefined;
  }
}