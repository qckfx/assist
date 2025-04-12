/**
 * Timeline Service for unified chronological feeds of messages and tool executions
 */
import { EventEmitter } from 'events';
import crypto from 'crypto';
import fs from 'fs';
import { StoredMessage } from '../../types/session';
import { 
  ToolExecutionState, 
  PermissionRequestState, 
  ToolExecutionStatus,
  ToolExecutionManager
} from '../../types/tool-execution';

// Define local version of ToolState enum to match UI's definition
enum ToolState {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  ERROR = 'error',
  ABORTED = 'aborted'
}

/**
 * Helper function to truncate message content for logging
 */
function truncateContent(content: any): string {
  if (!content) return 'empty';
  if (typeof content === 'string') {
    return content.length > 30 ? content.substring(0, 30) + '...' : content;
  }
  if (Array.isArray(content)) {
    return `array with ${content.length} items`;
  }
  return JSON.stringify(content).substring(0, 30) + '...';
}

// Import the enum with a different name to avoid conflicts
import { ToolExecutionEvent as ToolExecEvent } from '../../types/tool-execution';

// Import event data types from the implementation
import { 
  PreviewGeneratedEventData,
  ExecutionCompletedWithPreviewEventData
} from './tool-execution/ToolExecutionManagerImpl';
import { ToolPreviewState, PreviewContentType } from '../../types/preview';
import { 
  TimelineItem, 
  TimelineItemType,
  TimelineResponse,
  TimelineParams,
  MessageTimelineItem,
  ToolExecutionTimelineItem,
  PermissionRequestTimelineItem 
} from '../../types/timeline';
import { TextContentPart } from '../../types/message';
import { WebSocketEvent } from '../../types/websocket';
import { WebSocketService } from './WebSocketService';
import { SessionManager } from './SessionManager';
import { serverLogger } from '../logger';
import { AgentService, AgentServiceEvent } from './AgentService';
import { AgentServiceRegistry } from './AgentServiceRegistry';
import { previewService } from './preview';
import { getSessionStatePersistence } from './sessionPersistenceProvider';
import { TimelineStatePersistence } from './TimelineStatePersistence';
import { AgentEvents } from '../../utils/sessionUtils';

import { Server as SocketIOServer } from 'socket.io';

// Define interface for legacy tool execution event data
interface LegacyToolExecutionEventData {
  sessionId: string;
  tool: {
    id: string;
    name: string;
    executionId?: string;
  };
  args?: Record<string, unknown>;
  result?: unknown;
  paramSummary?: string;
  executionTime?: number;
  timestamp?: string;
  startTime?: string;
  abortTimestamp?: string;
  preview?: {
    contentType: string;
    briefContent: string;
    fullContent?: string;
    metadata?: Record<string, unknown>;
  };
  error?: {
    message: string;
    stack?: string;
  };
}

// Custom events for message handling that are not part of AgentServiceEvent enum
export const MESSAGE_ADDED = 'message:added';
export const MESSAGE_UPDATED = 'message:updated';

// Define interfaces for the SessionData model
interface SessionData {
  messages: StoredMessage[];
  toolExecutions: ToolExecutionState[];
  permissionRequests: PermissionRequestState[];
  previews: ToolPreviewState[];
}

// Define event interfaces based on AgentService events
interface MessageAddedEvent {
  sessionId: string;
  message: StoredMessage;
}

// renamed to avoid conflicts with exported types
interface InternalToolExecutionEventData {
  sessionId: string;
  execution: ToolExecutionState;
  preview?: ToolPreviewState;
}

interface PermissionRequestEvent {
  sessionId: string;
  permissionRequest: PermissionRequestState;
  preview?: ToolPreviewState;
}

interface SessionEvent {
  sessionId: string;
}

export enum TimelineServiceEvent {
  ITEM_ADDED = 'item_added',
  ITEMS_UPDATED = 'items_updated',
  ITEM_UPDATED = 'item_updated'
}

export class TimelineService extends EventEmitter {
  // No cache needed, using timeline persistence directly
  private cleanup: () => void = () => {};
  private processingSessionIds: Map<string, number> = new Map();
  private sessionProcessingThresholdMs = 2000; // 2 seconds
  private lastToolUpdates: Map<string, number> = new Map<string, number>();

  constructor(
    private sessionManager: SessionManager,
    private webSocketService: WebSocketService,
    private timelinePersistence: TimelineStatePersistence,
    private agentServiceRegistry: AgentServiceRegistry
  ) {
    super();
    
    // Set up event handlers
    this.setupEventListeners();
  }

  /**
   * Get timeline items for a session
   */
  public async getTimelineItems(
    sessionId: string,
    params: TimelineParams = {}
  ): Promise<TimelineResponse> {
    const { limit = 50, pageToken, types, includeRelated = true } = params;
    
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
    } catch (e) {
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
    } catch (e) {
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
      // Convert preview to the correct format for client consumption
      const clientPreview = preview ? {
        contentType: preview.contentType,
        briefContent: preview.briefContent,
        fullContent: preview.fullContent,
        metadata: preview.metadata
      } : undefined;
      
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
      console.log(`🔹 TimelineService emitting ${WebSocketEvent.TOOL_EXECUTION_UPDATED} for tool ${toolExecution.id} with preview: ${hasValidPreview}`);
      
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
    
    // Directly emit to WebSocket so the client gets the permission request immediately
    console.log(`🔹 TimelineService emitting PERMISSION_REQUESTED to WebSocket for permission ${permissionRequest.id} and executionId ${permissionRequest.executionId}`);
    
    // Add extra logging about whether permission request is complete
    console.log(`🔹 Permission request data completeness check: 
      - has id: ${!!permissionRequest.id}
      - has toolId: ${!!permissionRequest.toolId}
      - has toolName: ${!!permissionRequest.toolName}
      - has executionId: ${!!permissionRequest.executionId}
      - has args: ${!!permissionRequest.args}
      - has timestamp: ${!!permissionRequest.requestTime}
    `);
    
    // Log additional debug info
    serverLogger.info(`Emitting permission request with executionId: ${permissionRequest.executionId}`, {
      permissionId: permissionRequest.id,
      toolId: permissionRequest.toolId,
      executionId: permissionRequest.executionId
    });
    
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
        preview: preview ? {
          contentType: preview.contentType,
          briefContent: preview.briefContent,
          fullContent: preview.fullContent,
          metadata: preview.metadata
        } : undefined
      },
      // Also include these top-level fields for UI components
      executionId: permissionRequest.executionId,
      toolId: permissionRequest.toolId,
      toolName: permissionRequest.toolName || "Unknown Tool"
    });
    
    // Additionally emit a tool execution update to ensure the status change is visible to clients
    // This ensures the tool visualization shows "awaiting-permission" status properly
    if (permissionRequest.executionId) {
      // Get the execution from cache if available
      this.emitToSession(sessionId, WebSocketEvent.TOOL_EXECUTION_UPDATED, {
        sessionId,
        toolExecution: {
          id: permissionRequest.executionId,
          toolId: permissionRequest.toolId,
          toolName: permissionRequest.toolName || "Unknown Tool",
          status: "awaiting-permission",
          args: permissionRequest.args,
          startTime: permissionRequest.requestTime
        }
      });
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
      
      console.log(`🔹 TimelineService emitting ${event} to session ${sessionId} using WebSocketService.emitToSession`);
      
      // Use the WebSocketService's public method to emit the event
      this.webSocketService.emitToSession(sessionId, event, data);
    } catch (error) {
      serverLogger.error(`[emitToSession] Error emitting to session ${sessionId}:`, error instanceof Error ? error.message : String(error));
    }
  }
  
  // The getSocketIOServer and getAgentService methods have been removed
  // as they're no longer needed with the new event propagation architecture
  
  // The getToolExecutionManager method has been removed as part of the refactoring
  // to use AgentServiceRegistry for event propagation instead of directly 
  // accessing ToolExecutionManager instances

  /**
   * Set up event listeners for session events
   */
  private setupEventListeners(): void {
    console.log("✅✅✅ Setting up TimelineService event listeners");
    
    // Log event registration for specific events
    const eventsToMonitor = [
      AgentServiceEvent.TOOL_EXECUTION_COMPLETED,
      AgentServiceEvent.PERMISSION_REQUESTED,
      AgentServiceEvent.PERMISSION_RESOLVED
    ];
    
    // Check if the registry has these events registered
    eventsToMonitor.forEach(eventName => {
      try {
        const count = this.agentServiceRegistry.listenerCount(eventName);
        console.log(`✅✅✅ Before TimelineService setup: Registry has ${count} listeners for ${eventName}`);
      } catch (err) {
        console.log(`❌❌❌ Error checking listeners for ${eventName}: ${err}`);
      }
    });
    
    // Listen for message events from AgentEvents (from AgentRunner)
    // This is a one-way flow: Agent -> Timeline -> UI WebSocket
    const handleAgentEventsMessage = (data: MessageAddedEvent) => {
      // Still add the message to timeline for UI to display
      // BUT don't emit back to the agent service to avoid feedback loops
      const storedMessage: StoredMessage = {
        id: data.message.id || crypto.randomUUID(),
        role: data.message.role as 'user' | 'assistant',
        timestamp: new Date().toISOString(),
        content: data.message.content,
        sequence: 0, // Will be set properly by addMessageToTimeline
      };
      
      // Add to timeline without emitting back to the agent
      try {
        // Call a special internal version of addMessageToTimeline that doesn't emit events
        this.addMessageToTimelineInternal(data.sessionId, storedMessage)
          .then(timelineItem => {
            // Explicitly emit the WebSocket event to the frontend
            this.emitToSession(data.sessionId, WebSocketEvent.MESSAGE_RECEIVED, {
              sessionId: data.sessionId,
              message: timelineItem.message
            });
            serverLogger.debug(`Emitted WebSocket message for ${data.message.role} message from AgentEvents`);
          })
          .catch(err => serverLogger.error(`Error adding message to timeline from agent: ${err.message}`));
      } catch (err) {
        serverLogger.error(`Error adding message to timeline from agent: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    AgentEvents.on(MESSAGE_ADDED, handleAgentEventsMessage);
    
    // Add cleanup handler for AgentEvents
    const originalCleanup = this.cleanup;
    this.cleanup = () => {
      // Remove listener from AgentEvents
      AgentEvents.off(MESSAGE_ADDED, handleAgentEventsMessage);
      // Call original cleanup if it exists
      if (typeof originalCleanup === 'function') {
        originalCleanup();
      }
    };
    
    // Listen for permission request events - use a debounce mechanism to prevent cascading permission events
    const permissionDebounce = new Map<string, number>();
    const permissionThresholdMs = 1000; // 1 second
    
    // Subscribe to registry events for tool execution completed
    this.agentServiceRegistry.on(AgentServiceEvent.TOOL_EXECUTION_COMPLETED, (data: any) => {
      console.log(`🔸 TimelineService received TOOL_EXECUTION_COMPLETED from registry for session ${data?.sessionId}`);
      console.log(`🔸 Data inspection: hasData=${!!data}, hasSessionId=${!!data?.sessionId}, hasExecution=${!!data?.execution}`);
      
      if (!data || !data.sessionId || !data.execution) {
        serverLogger.warn('Received TOOL_EXECUTION_COMPLETED event with missing data', data);
        console.log('🔴🔴🔴 Tool completion data is incomplete - missing required fields');
        return;
      }
      
      // All the data we need is in the event - no need to query other services
      const { sessionId, execution, preview } = data;
      console.log(`🔸 Execution data: id=${execution.id}, status=${execution.status}, hasPreview=${!!preview}`);
      
      // First, directly emit to WebSocket to ensure the client gets the update
      // This is a critical path to ensure tool visualization works
      try {
        // Check if we have a valid preview
        console.log(`🔸 Preview check: hasPreview=${!!preview}, hasContentType=${!!preview?.contentType}, hasBriefContent=${!!preview?.briefContent}`);
        const hasValidPreview = !!(preview && preview.briefContent);
        console.log(`🔸 Preview validation result: hasValidPreview=${hasValidPreview}`);
        
        // Convert preview to client format if available
        const previewToSend = hasValidPreview ? {
          contentType: preview.contentType,
          briefContent: preview.briefContent,
          fullContent: preview.fullContent,
          metadata: preview.metadata ? {...preview.metadata} : undefined,
          hasActualContent: true
        } : undefined;
        console.log(`🔸 previewToSend is ${previewToSend ? 'defined' : 'undefined'}`);
        if (previewToSend) {
          console.log(`🔸 previewToSend details: contentType=${previewToSend.contentType}, briefContentLength=${previewToSend.briefContent?.length || 0}`);
        }
        
        // Check if we should include the result based on status
        const shouldIncludeResult = 
          execution.status === ToolExecutionStatus.COMPLETED || 
          execution.status === ToolExecutionStatus.ERROR || 
          execution.status === ToolExecutionStatus.ABORTED || 
          execution.status === ToolExecutionStatus.AWAITING_PERMISSION;
        
        console.log(`🔸 Result check: status=${execution.status}, shouldIncludeResult=${shouldIncludeResult}, hasResult=${execution.result !== undefined}`);
        
        // Get the result only if in the right state
        const executionResult = shouldIncludeResult ? execution.result : undefined;
        console.log(`🔸 executionResult is ${executionResult !== undefined ? 'present' : 'undefined'}`);
        if (executionResult !== undefined) {
          console.log(`🔸 executionResult type: ${typeof executionResult}`);
        }
        
        // Log for debugging
        console.log(`⚡⚡⚡ TimelineService DIRECT WebSocket emission for execution ${execution.id} with preview: ${hasValidPreview}`);
        serverLogger.info(`DIRECT WebSocket emission for execution ${execution.id} with preview: ${hasValidPreview}`);
        
        // Directly use the WebSocketService to emit the event
        console.log(`🔸 About to call webSocketService.emitToSession for session ${sessionId}`);
        const payload = {
          sessionId,
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
        console.log(`🔸 WebSocket payload created with ${Object.keys(payload).length} top-level keys: [${Object.keys(payload).join(', ')}]`);
        console.log(`🔸 WebSocket toolExecution has ${Object.keys(payload.toolExecution).length} keys: [${Object.keys(payload.toolExecution).join(', ')}]`);
        
        try {
          this.webSocketService.emitToSession(sessionId, WebSocketEvent.TOOL_EXECUTION_UPDATED, payload);
          console.log(`✅✅✅ Successfully emitted TOOL_EXECUTION_UPDATED to WebSocketService`);
        } catch (emitError) {
          console.log(`❌❌❌ ERROR in webSocketService.emitToSession: ${emitError}`);
          console.error(emitError);
        }
      } catch (error) {
        console.log(`❌❌❌ ERROR in direct WebSocket emission preparation: ${error}`);
        serverLogger.error(`Error in direct WebSocket emission for tool execution ${execution.id}:`, error);
      }
      
      // Now continue with the usual flow of adding to timeline
      this.findParentMessageId(sessionId, execution.id)
        .then(parentMessageId => {
          // Add the tool execution with its preview to the timeline
          this.addToolExecutionToTimeline(sessionId, execution, preview, parentMessageId)
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
    console.log(`✅✅✅ Setting up listener for ${AgentServiceEvent.PERMISSION_REQUESTED}`);
    
    this.agentServiceRegistry.on(AgentServiceEvent.PERMISSION_REQUESTED, (data: any) => {
      console.log(`✅✅✅ PERMISSION_REQUESTED handler triggered`);
      console.log(`🔸 TimelineService received PERMISSION_REQUESTED from registry for session ${data.sessionId}`);
      console.log(`🔸 Permission data inspection: hasData=${!!data}, hasSessionId=${!!data?.sessionId}, hasPermissionRequest=${!!data?.permissionRequest}, permissionId=${data?.permissionRequest?.id}`);
      
      if (!data || !data.sessionId || !data.permissionRequest || !data.permissionRequest.id) {
        serverLogger.error('[PERMISSION] Missing required data in PERMISSION_REQUESTED event', data);
        console.log(`🔴🔴🔴 Permission request data is incomplete - missing required fields`);
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
    
    console.log(`✅✅✅ Setting up listener for ${AgentServiceEvent.PERMISSION_RESOLVED}`);
    
    this.agentServiceRegistry.on(AgentServiceEvent.PERMISSION_RESOLVED, (data: any) => {
      console.log(`✅✅✅ PERMISSION_RESOLVED handler triggered`);
      console.log(`🔸 TimelineService received PERMISSION_RESOLVED from registry for session ${data.sessionId}`);
      console.log(`🔸 Permission resolved data inspection: hasData=${!!data}, hasSessionId=${!!data?.sessionId}, hasPermissionRequest=${!!data?.permissionRequest}, permissionId=${data?.permissionRequest?.id}`);
      
      if (!data || !data.sessionId || !data.permissionRequest || !data.permissionRequest.id) {
        serverLogger.error('[PERMISSION] Missing required data in PERMISSION_RESOLVED event', data);
        console.log(`🔴🔴🔴 Permission resolved data is incomplete - missing required fields`);
        return;
      }
      
      // All the data we need is in the event - no need to query other services
      const { sessionId, permissionRequest, preview } = data;
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
      console.log(`🔹 TimelineService emitting PERMISSION_RESOLVED to WebSocket for permission ${permissionId} and executionId ${permissionRequest.executionId}`);
      
      // This is the expected structure for the client's usePermissionKeyboardHandler
      // Include additional fields to ensure UI components can handle this properly
      this.emitToSession(sessionId, WebSocketEvent.PERMISSION_RESOLVED, {
        sessionId,
        executionId: permissionRequest.executionId, // This must match what's used in the UI
        resolution: permissionRequest.granted,
        // Add these fields to maintain compatibility with all UI components
        toolId: permissionRequest.toolId,
        toolName: permissionRequest.toolName || "Unknown Tool",
        permissionId: permissionRequest.id
      });
      
      // Clean up after a delay
      setTimeout(() => permissionDebounce.delete(permissionId), 2000);
    });
    
    // Subscribe to message events from registry
    this.agentServiceRegistry.on(MESSAGE_ADDED, (data: any) => {
      console.log(`🔸 TimelineService received MESSAGE_ADDED from registry for session ${data.sessionId}`);
      
      if (!data || !data.sessionId || !data.message) {
        serverLogger.warn('Received MESSAGE_ADDED event with missing data', data);
        return;
      }
      
      // Use the internal method to add to timeline without emitting events back to agent
      this.addMessageToTimelineInternal(data.sessionId, data.message)
        .then(() => {
          // Emit to WebSocket clients only
          this.emitToSession(data.sessionId, WebSocketEvent.MESSAGE_RECEIVED, {
            sessionId: data.sessionId,
            message: data.message
          });
        })
        .catch(err => {
          serverLogger.error(`Error adding message to timeline from MESSAGE_ADDED: ${err.message}`);
        });
    });
    
    this.agentServiceRegistry.on(MESSAGE_UPDATED, (data: any) => {
      console.log(`🔸 TimelineService received MESSAGE_UPDATED from registry for session ${data.sessionId}`);
      
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
    
    // Log counts after setup
    eventsToMonitor.forEach(eventName => {
      try {
        const count = this.agentServiceRegistry.listenerCount(eventName);
        console.log(`✅✅✅ After TimelineService setup: Registry has ${count} listeners for ${eventName}`);
      } catch (err) {
        console.log(`❌❌❌ Error checking listeners for ${eventName}: ${err}`);
      }
    });
    
    serverLogger.info('🟢🟢🟢 TimelineService: Set up to receive events from AgentServiceRegistry');
  }
  
  // The setupToolExecutionListeners and setupToolExecutionManagerListeners methods
  // have been removed as part of the refactoring to use the AgentServiceRegistry
  // for event propagation instead of directly subscribing to tool execution managers.

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

  /**
   * Update the preview for an existing timeline item
   * This is used when a preview is generated asynchronously after the timeline item was created
   */
  private async updateTimelineItemPreview(
    sessionId: string,
    executionId: string,
    preview: ToolPreviewState
  ): Promise<void> {
    // Load timeline items
    const timelineItems = await this.timelinePersistence.loadTimelineItems(sessionId);
    
    // Find the existing timeline item
    const item = timelineItems.find(
      item => item.type === TimelineItemType.TOOL_EXECUTION && item.id === executionId
    ) as ToolExecutionTimelineItem | undefined;
    
    if (item) {
      // Update the preview in the timeline item
      item.preview = preview;
      
      // Save back to persistence
      await this.timelinePersistence.addTimelineItem(sessionId, item);
      
      // Emit events
      this.emit(TimelineServiceEvent.ITEM_UPDATED, item);
      
      // Check if we have a valid preview with required content
      const hasValidPreview = !!(preview && preview.briefContent);
      
      // Only log if debug preview is enabled
      if (preview && process.env.DEBUG_PREVIEW) {
        serverLogger.info(`Preview data for timeline item update ${executionId}:`, {
          hasPreview: !!preview,
          hasValidPreview,
          contentType: preview.contentType,
          briefContentLength: preview.briefContent?.length || 0
        });
      }
      
      // IMPORTANT: Use a copy of the preview object to avoid reference issues
      // This ensures a complete copy of the preview data is sent
      const previewToSend = {
        contentType: preview.contentType,
        briefContent: preview.briefContent,
        fullContent: preview.fullContent,
        metadata: preview.metadata ? {...preview.metadata} : undefined,
        // Add extra fields to ensure client gets all the data
        hasActualContent: true
      };
      
      // Send the execution update with preview directly in the toolExecution object
      this.emitToSession(sessionId, WebSocketEvent.TOOL_EXECUTION_UPDATED, {
        sessionId,
        toolExecution: {
          id: item.toolExecution.id,
          toolId: item.toolExecution.toolId,
          toolName: item.toolExecution.toolName,
          status: item.toolExecution.status,
          preview: previewToSend,
          // Add these flags to help client-side detection
          hasPreview: true,
          previewContentType: preview.contentType
        }
      });
    } else {
      serverLogger.warn(`Cannot update timeline item with invalid preview for ${executionId}`);
    }
  }
}