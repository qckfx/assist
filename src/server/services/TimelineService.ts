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
    private timelinePersistence: TimelineStatePersistence
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
    
    // Sort the timeline items
    const sortedItems = this.sortTimelineItems(timelineItems);
    
    // Debug log to check if we have user messages
    const userMessages = sortedItems.filter(item => 
      item.type === TimelineItemType.MESSAGE && item.message.role === 'user'
    );
    const assistantMessages = sortedItems.filter(item => 
      item.type === TimelineItemType.MESSAGE && item.message.role === 'assistant'
    );
    
    // Warn if we're missing user messages but have assistant messages (suspicious)
    if (userMessages.length === 0 && assistantMessages.length > 0) {
      serverLogger.warn(`[TIMELINE WARNING] Found ${assistantMessages.length} assistant messages but NO user messages. This might indicate a timeline sorting issue.`);
    }
    
    // Log how many items we found
    serverLogger.debug(`Loaded ${sortedItems.length} timeline items for session ${sessionId} (${userMessages.length} user, ${assistantMessages.length} assistant)`);
    
    // Apply filtering by types if specified
    let filteredItems = sortedItems;
    if (types && types.length > 0) {
      filteredItems = sortedItems.filter(item => types.includes(item.type));
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
   * Sort timeline items - maintains proper ordering of messages and tool executions
   */
  private sortTimelineItems(items: TimelineItem[]): TimelineItem[] {
    // Map tool executions to their parent messages for faster lookup
    const toolToParentMap = new Map<string, string>();
    
    // First pass to establish parent-child relationships
    items.forEach(item => {
      // If it's a message with tool calls, establish parent relationship
      if (item.type === TimelineItemType.MESSAGE && item.message.toolCalls?.length) {
        item.message.toolCalls.forEach(call => {
          if (call.executionId) {
            toolToParentMap.set(call.executionId, item.id);
          }
        });
      }
      
      // If it's a tool execution with parentMessageId, record that too
      if (item.type === TimelineItemType.TOOL_EXECUTION && 
          (item as ToolExecutionTimelineItem).parentMessageId) {
        const parentId = (item as ToolExecutionTimelineItem).parentMessageId;
        if (parentId) {
          toolToParentMap.set(item.id, parentId);
        }
      }
    });
    
    // Group messages and their related tools to ensure proper order
    const userMessages = items.filter(item => 
      item.type === TimelineItemType.MESSAGE && item.message.role === 'user'
    );
    const assistantMessages = items.filter(item => 
      item.type === TimelineItemType.MESSAGE && item.message.role === 'assistant'
    );
    
    // Log what we found for diagnostic purposes
    serverLogger.debug(`Timeline sorting: found ${userMessages.length} user messages, ${assistantMessages.length} assistant messages`);
    
    // Now sort with improved logic that enforces user -> tools -> assistant order
    return items.sort((a, b) => {
      // CASE 1: Always prioritize user messages over assistant messages
      if (a.type === TimelineItemType.MESSAGE && b.type === TimelineItemType.MESSAGE) {
        if (a.message.role === 'user' && b.message.role === 'assistant') {
          return -1; // User messages always come before assistant messages
        }
        if (a.message.role === 'assistant' && b.message.role === 'user') {
          return 1; // User messages always come before assistant messages
        }
      }
      
      // CASE 2: Use sequence numbers for messages when available
      if (a.type === TimelineItemType.MESSAGE && 
          b.type === TimelineItemType.MESSAGE && 
          a.message.sequence !== undefined && 
          b.message.sequence !== undefined) {
        return a.message.sequence - b.message.sequence;
      }
      
      // CASE 3: Enforce tool execution placement between their parent message and the next message
      if (a.type === TimelineItemType.TOOL_EXECUTION && b.type === TimelineItemType.MESSAGE) {
        const parentId = toolToParentMap.get(a.id);
        
        // If b is the parent of tool a, then tool a comes after parent message b
        if (parentId === b.id) {
          return 1;
        }
        
        // If b is an assistant message and a's parent is a user message, 
        // tool a should appear before assistant message b
        if (b.message.role === 'assistant' && 
            parentId && 
            userMessages.some(msg => msg.id === parentId)) {
          return -1; // Tool comes before assistant message
        }
      }
      
      if (a.type === TimelineItemType.MESSAGE && b.type === TimelineItemType.TOOL_EXECUTION) {
        const parentId = toolToParentMap.get(b.id);
        
        // If a is the parent of tool b, then tool b comes after parent message a
        if (parentId === a.id) {
          return -1;
        }
        
        // If a is an assistant message and b's parent is a user message, 
        // tool b should appear before assistant message a
        if (a.message.role === 'assistant' && 
            parentId && 
            userMessages.some(msg => msg.id === parentId)) {
          return 1; // Tool comes before assistant message
        }
      }
      
      // CASE 4: Both are tools - order by parent message sequence, then by timestamp
      if (a.type === TimelineItemType.TOOL_EXECUTION && b.type === TimelineItemType.TOOL_EXECUTION) {
        const aParentId = toolToParentMap.get(a.id);
        const bParentId = toolToParentMap.get(b.id);
        
        // If both tools have the same parent, use timestamp
        if (aParentId && bParentId && aParentId === bParentId) {
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        }
        
        // If only a has a parent that's a user message, a comes first
        if (aParentId && userMessages.some(msg => msg.id === aParentId) && 
            (!bParentId || !userMessages.some(msg => msg.id === bParentId))) {
          return -1;
        }
        
        // If only b has a parent that's a user message, b comes first
        if (bParentId && userMessages.some(msg => msg.id === bParentId) && 
            (!aParentId || !userMessages.some(msg => msg.id === aParentId))) {
          return 1;
        }
      }
      
      // CASE 5: Use timestamp as fallback
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return aTime - bTime;
    });
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
    
    // Emit events
    this.emit(TimelineServiceEvent.ITEM_ADDED, timelineItem);
    
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
      
      // Now get and update the tool execution
      const toolExecution = this.getAgentService()?.getToolExecution(executionId);
      
      if (toolExecution) {
        // Update the tool execution with the permission state and preview
        serverLogger.debug(`[Permission] Updating tool execution ${executionId} with permission state`);
        this.addToolExecutionToTimeline(sessionId, toolExecution, preview);
      }
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
      
      // Type-safe access to WebSocketService properties
      // Access the socket.io instance directly
      const socketIoServer = this.getSocketIOServer();
      
      if (socketIoServer) {
        socketIoServer.to(sessionId).emit(event, data);
      } else {
        // Fallback method if direct io access is not available
        const agentService = this.getAgentService();
        if (agentService) {
          // If AgentService is accessible, emit the event through it
          agentService.emit(`timeline:${event}`, { sessionId, ...data });
        } else {
          serverLogger.warn(`[emitToSession] Could not emit ${event} to session ${sessionId}: No socket.io or AgentService instance found`);
        }
      }
    } catch (error) {
      serverLogger.error(`[emitToSession] Error emitting to session ${sessionId}:`, error instanceof Error ? error.message : String(error));
    }
  }
  
  /**
   * Get Socket.IO server from WebSocketService
   */
  private getSocketIOServer(): SocketIOServer | null {
    try {
      // WebSocketService should have a public 'io' property
      const ioServer = (this.webSocketService as unknown as { io: SocketIOServer }).io;
      return ioServer || null;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Get AgentService from WebSocketService
   */
  private getAgentService(): AgentService | null {
    try {
      // WebSocketService should have a public 'agentService' property
      const agentService = (this.webSocketService as unknown as { agentService: AgentService }).agentService;
      return agentService || null;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Get ToolExecutionManager from AgentService
   */
  private getToolExecutionManager(): ToolExecutionManager | null {
    try {
      const agentService = this.getAgentService();
      if (!agentService) return null;
      
      // AgentService should have a 'toolExecutionManager' property
      const toolExecutionManager = (agentService as unknown as { toolExecutionManager: ToolExecutionManager }).toolExecutionManager;
      return toolExecutionManager || null;
    } catch (error) {
      serverLogger.debug('Could not access ToolExecutionManager:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /**
   * Set up event listeners for session events
   */
  private setupEventListeners(): void {
    // Get access to the AgentService which extends EventEmitter
    const agentService = this.getAgentService();
    
    if (!agentService) {
      serverLogger.error('TimelineService: Could not access AgentService for event subscriptions');
      return;
    }
    
    // Get access to the ToolExecutionManager for preview events
    const toolExecutionManager = this.getToolExecutionManager();
    
    // Listen for message events - custom events not in AgentServiceEvent enum
    agentService.on(MESSAGE_ADDED, (data: MessageAddedEvent) => {
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
    
    agentService.on(MESSAGE_UPDATED, (data: MessageAddedEvent) => {
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
    
    agentService.on(AgentServiceEvent.PERMISSION_REQUESTED, (data: PermissionRequestEvent) => {
      if (!data || !data.sessionId || !data.permissionRequest || !data.permissionRequest.id) {
        serverLogger.error('[PERMISSION] Missing required data in PERMISSION_REQUESTED event', data);
        return;
      }
      
      const permissionId = data.permissionRequest.id;
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
      this.addPermissionRequestToTimeline(data.sessionId, data.permissionRequest, data.preview);
      
      // Clean up after a delay
      setTimeout(() => permissionDebounce.delete(permissionId), 2000);
    });
    
    agentService.on(AgentServiceEvent.PERMISSION_RESOLVED, (data: PermissionRequestEvent) => {
      if (!data || !data.sessionId || !data.permissionRequest || !data.permissionRequest.id) {
        serverLogger.error('[PERMISSION] Missing required data in PERMISSION_RESOLVED event', data);
        return;
      }
      
      const permissionId = data.permissionRequest.id;
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
      this.addPermissionRequestToTimeline(data.sessionId, data.permissionRequest, data.preview);
      
      // Clean up after a delay
      setTimeout(() => permissionDebounce.delete(permissionId), 2000);
    });
    
    // Completely disable SESSION_LOADED event handling as a more drastic fix
    // This breaks the event chain that's likely causing infinite loops
    agentService.on(AgentServiceEvent.SESSION_LOADED, (data: SessionEvent) => {
      // Implementation removed to break the event chain
      serverLogger.warn(`[SESSION_LOADED] SESSION_LOADED event received for ${data.sessionId} but intentionally not processed to prevent infinite loops`);
    });
    
    // Listen for Tool Execution Manager events (if available)
    if (toolExecutionManager) {
      // Listen for preview generation events
      toolExecutionManager.on(ToolExecEvent.PREVIEW_GENERATED, (data: unknown) => {
        // Need to type-cast the data to the expected format
        const typedData = data as PreviewGeneratedEventData;
        const { execution, preview } = typedData;
        
        // Update timeline item with the newly generated preview
        this.updateTimelineItemPreview(execution.sessionId, execution.id, preview);
        
        serverLogger.debug(`TimelineService received PREVIEW_GENERATED event for execution ${execution.id}`);
      });
      
      // Listen for tool execution completed events that include a preview
      toolExecutionManager.on(ToolExecEvent.COMPLETED, (data: unknown) => {
        // Need to type-cast the data to the expected format
        const typedData = data as ExecutionCompletedWithPreviewEventData;
        const { execution, preview } = typedData;
        
        // Find the parent message ID for this execution
        this.findParentMessageId(execution.sessionId, execution.id)
          .then(parentMessageId => {
            // Add the tool execution with its preview to the timeline
            this.addToolExecutionToTimeline(execution.sessionId, execution, preview, parentMessageId);
            
            serverLogger.debug(`TimelineService processed COMPLETED event for execution ${execution.id} with preview: ${!!preview}`);
          });
      });
    } else {
      serverLogger.warn('TimelineService: Could not access ToolExecutionManager for event subscriptions');
    }
    
    serverLogger.info('TimelineService: Event listeners setup complete');
  }

  /**
   * Find the parent message ID for a tool execution
   */
  private async findParentMessageId(sessionId: string, executionId: string): Promise<string | undefined> {
    const sessionData = await this.getSessionData(sessionId);
    if (!sessionData) return undefined;
    
    // Look through messages to find one that references this execution
    for (const message of sessionData.messages) {
      if (message.toolCalls?.some(call => call.executionId === executionId)) {
        return message.id;
      }
    }
    
    return undefined;
  }

  /**
   * Get session data from SessionManager and associated services
   */
  private async getSessionData(sessionId: string): Promise<SessionData | null> {
    try {
      // First, try to load the session from persistence
      const sessionStatePersistence = getSessionStatePersistence();
      let persistedSessionData = null;
      
      if (sessionStatePersistence) {
        try {
          // Use the non-event-emitting method to avoid recursive event emission
          persistedSessionData = await sessionStatePersistence.getSessionDataWithoutEvents(sessionId);
          
          // Even if we have persisted data, we should separately load the messages
          // from subdirectory to handle case where main session file has empty messages array
          try {
            // Check if we have a messages file in the session directory
            const messagesPath = sessionStatePersistence.getSessionDir(sessionId) + '/messages.json';
            const messagesExists = await fs.promises.access(messagesPath)
              .then(() => true)
              .catch(() => false);
              
            if (messagesExists) {
              const messagesData = await fs.promises.readFile(messagesPath, 'utf-8');
              const messages = JSON.parse(messagesData);
              
              serverLogger.debug(`Directly loaded ${messages.length} messages from file for session ${sessionId}`);
              
              // If we have persisted data but no messages, add these messages
              if (persistedSessionData && 
                  (!persistedSessionData.messages || persistedSessionData.messages.length === 0)) {
                persistedSessionData.messages = messages;
                serverLogger.debug(`Updated persisted session data with ${messages.length} messages from separate file`);
              }
            }
          } catch (err) {
            serverLogger.debug(`Error loading messages file for session ${sessionId}: ${err instanceof Error ? err.message : String(err)}`);
          }
          
          // If we have persisted data, use it instead of in-memory session
          if (persistedSessionData) {
            serverLogger.debug(`Loaded persisted session data for ${sessionId} with ${persistedSessionData.messages?.length || 0} messages`);
            
            // Return the persisted session data directly
            return {
              messages: persistedSessionData.messages || [],
              toolExecutions: persistedSessionData.toolExecutions || [],
              permissionRequests: persistedSessionData.permissionRequests || [],
              previews: persistedSessionData.previews || [],
            };
          }
        } catch (err) {
          serverLogger.debug(`Error loading persisted session: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      
      // Get the session from SessionManager if we couldn't load from persistence
      if (!this.sessionManager.getSession) {
        serverLogger.error('SessionManager does not have a getSession method');
        return null;
      }
      
      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        serverLogger.debug(`Session ${sessionId} not found`);
        return null;
      }
      
      // Get the AgentService to access associated data
      const agentService = this.getAgentService();
      if (!agentService) {
        serverLogger.error('Could not access AgentService to get session data');
        return null;
      }
      
      // Get all the data from the correct services
      
      // 1. Get messages from the session's conversation history
      let messages: StoredMessage[] = [];
      if (session.state?.conversationHistory) {
        // Safe conversion with proper type handling
        messages = session.state.conversationHistory.map((msg: any) => ({
          id: msg.id || crypto.randomUUID(),
          role: (msg.role || 'user') as ('user' | 'assistant'),
          timestamp: msg.timestamp || new Date().toISOString(),
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || ''),
          sequence: msg.sequence || 0,
          toolCalls: Array.isArray(msg.toolCalls) ? msg.toolCalls : []
        }));
      }
      
      // 2. Get tool executions directly from the AgentService
      const toolExecutions: ToolExecutionState[] = [];
      // AgentService has getToolExecution (singular) but not getToolExecutions (plural)
      // So we'll adapt to work with what's available
      if (typeof agentService.getToolExecution === 'function') {
        // We'll need to get a list of execution IDs from somewhere
        // For now, we can check if there are any tools in toolCalls from messages
        const executionIds = new Set<string>();
        
        // Extract execution IDs from message toolCalls
        messages.forEach(msg => {
          if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
            msg.toolCalls.forEach(toolCall => {
              if (toolCall.executionId) {
                executionIds.add(toolCall.executionId);
              }
            });
          }
        });
        
        // Fetch each tool execution individually
        Array.from(executionIds).forEach(executionId => {
          try {
            const execution = agentService.getToolExecution(executionId);
            if (execution) {
              toolExecutions.push(execution);
            }
          } catch (err) {
            // Continue even if one execution fetch fails
            serverLogger.debug(`Failed to get tool execution ${executionId}:`, err);
          }
        });
      }
      
      // 3. Get permission requests from AgentService
      let permissionRequests: PermissionRequestState[] = [];
      if (typeof agentService.getPermissionRequests === 'function') {
        try {
          const requests = agentService.getPermissionRequests(sessionId);
          if (Array.isArray(requests)) {
            // Transform to match PermissionRequestState if needed
            permissionRequests = requests.map((req: any) => {
              // Create a properly structured PermissionRequestState
              const permState: PermissionRequestState = {
                id: (req.permissionId || req.id || crypto.randomUUID()),
                sessionId: sessionId,
                toolId: req.toolId || '',
                toolName: req.toolName || req.toolId || 'unknown',
                args: req.args || {},
                requestTime: req.timestamp || new Date().toISOString(),
                executionId: req.executionId || req.toolExecutionId || '',
                resolvedTime: req.resolvedTime,
                granted: req.granted,
                previewId: req.previewId
              };
              return permState;
            });
          }
        } catch (err) {
          serverLogger.error('Error getting permission requests:', err);
        }
      }
      
      // 4. Get previews from the available services
      let previews: ToolPreviewState[] = [];
      
      // Get previews associated with tool executions and permission requests
      try {
        // First, check if there's a session persistence provider we can access
        // to get the complete session data
        const sessionStatePersistence = getSessionStatePersistence();
        if (sessionStatePersistence) {
          try {
            // Try to get the session data with previews included
            const sessionData = await sessionStatePersistence.loadSession(sessionId);
            if (sessionData?.previews && Array.isArray(sessionData.previews)) {
              previews = sessionData.previews;
              serverLogger.debug(`Retrieved ${previews.length} previews from session state`);
            }
          } catch (err) {
            serverLogger.debug(`Error accessing session state persistence: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        
        // If we couldn't get previews from session state, try to reconstruct
        // them from tool executions and permission requests
        if (previews.length === 0) {
          const previewMap = new Map<string, ToolPreviewState>();
          
          // Collect preview IDs from tool executions
          toolExecutions.forEach(execution => {
            if (execution.previewId) {
              // Try to create a basic preview state
              previewMap.set(execution.previewId, {
                id: execution.previewId,
                sessionId: sessionId,
                executionId: execution.id,
                contentType: PreviewContentType.TEXT, // Using the enum value
                briefContent: `${execution.toolName || execution.toolId || 'Tool'} execution result`,
                fullContent: execution.result ? 
                  (typeof execution.result === 'string' ? 
                    execution.result : 
                    JSON.stringify(execution.result, null, 2)
                  ) : undefined
              });
            }
          });
          
          // Add any previews from permission requests
          permissionRequests.forEach(request => {
            if (request.previewId && !previewMap.has(request.previewId)) {
              previewMap.set(request.previewId, {
                id: request.previewId,
                sessionId: sessionId,
                executionId: request.executionId,
                permissionId: request.id,
                contentType: PreviewContentType.TEXT,
                briefContent: `Permission request for ${request.toolName || request.toolId || 'tool'}`
              });
            }
          });
          
          // Convert the map to an array
          previews = Array.from(previewMap.values());
          serverLogger.debug(`Created ${previews.length} preview objects from references`);
        }
      } catch (err) {
        serverLogger.error('Error building preview list:', err);
      }
      
      // Combine all data into SessionData
      return {
        messages,
        toolExecutions,
        permissionRequests,
        previews
      };
    } catch (error) {
      serverLogger.error(`Error getting session data for ${sessionId}:`, 
        error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /**
   * Build or retrieve a full session timeline
   */
  private async buildSessionTimeline(
    sessionId: string,
    includeRelated = true
  ): Promise<TimelineResponse> {
    // Get session data directly (no cache)
    const sessionData = await this.getSessionData(sessionId);
    if (!sessionData) {
      return { items: [], totalCount: 0 };
    }
    
    // We no longer generate previews in the timeline service
    // All preview generation is now handled by ToolExecutionManager
    
    const timeline: TimelineItem[] = [];
    
    // Add existing messages to timeline, with special debugging for user messages
    for (const message of sessionData.messages) {
      const item: MessageTimelineItem = {
        id: message.id,
        type: TimelineItemType.MESSAGE,
        timestamp: message.timestamp,
        sessionId,
        message,
        toolExecutions: message.toolCalls?.map(call => call.executionId)
      };
      
      // Log user messages specifically for debugging
      if (message.role === 'user') {
        serverLogger.debug(`Including USER message ${message.id} in timeline (content: "${truncateContent(message.content)}")`);
      }
      
      timeline.push(item);
    }
    
    // Add tool executions to timeline
    for (const execution of sessionData.toolExecutions) {
      // Find parent message ID
      let parentMessageId: string | undefined;
      
      for (const message of sessionData.messages) {
        if (message.toolCalls?.some(call => call.executionId === execution.id)) {
          parentMessageId = message.id;
          break;
        }
      }
      
      // Find associated preview
      let preview: ToolPreviewState | undefined;
      
      if (includeRelated && execution.previewId) {
        preview = sessionData.previews.find(p => p.id === execution.previewId);
      }
      
      const item: ToolExecutionTimelineItem = {
        id: execution.id,
        type: TimelineItemType.TOOL_EXECUTION,
        timestamp: execution.startTime,
        sessionId,
        toolExecution: execution,
        permissionRequest: execution.permissionId,
        preview,
        parentMessageId
      };
      
      timeline.push(item);
    }
    
    // Add permission requests to timeline
    for (const permissionRequest of sessionData.permissionRequests) {
      // Find associated preview
      let preview: ToolPreviewState | undefined;
      
      if (includeRelated && permissionRequest.previewId) {
        preview = sessionData.previews.find(p => p.id === permissionRequest.previewId);
      }
      
      const item: PermissionRequestTimelineItem = {
        id: permissionRequest.id,
        type: TimelineItemType.PERMISSION_REQUEST,
        timestamp: permissionRequest.requestTime,
        sessionId,
        permissionRequest,
        toolExecutionId: permissionRequest.executionId,
        preview
      };
      
      timeline.push(item);
    }
    
    // IMPORTANT: Sort timeline primarily by sequence number - this is the most accurate way to ensure
    // messages are displayed in the correct order, regardless of timestamps
    timeline.sort((a, b) => {
      // First, check if both are messages with sequence numbers
      const aIsMessageWithSequence = a.type === TimelineItemType.MESSAGE && a.message.sequence !== undefined;
      const bIsMessageWithSequence = b.type === TimelineItemType.MESSAGE && b.message.sequence !== undefined;
      
      // Case 1: If both have sequence numbers, use those (most reliable ordering)
      if (aIsMessageWithSequence && bIsMessageWithSequence) {
        return a.message.sequence - b.message.sequence;
      }
      
      // Case 2: If only one has a sequence number, prioritize it based on sequence ranges
      // User message sequences start at 0, 2, 4... and AI responses are 1, 3, 5...
      if (aIsMessageWithSequence && !bIsMessageWithSequence) {
        return -1; // Items with sequence come first
      }
      if (!aIsMessageWithSequence && bIsMessageWithSequence) {
        return 1; // Items with sequence come first
      }
      
      // Case 3: Check for parent/child relationship between tool execution and message
      // This ensures tool executions appear after their parent message
      if (a.type === TimelineItemType.TOOL_EXECUTION && b.type === TimelineItemType.MESSAGE) {
        // Check for direct parent/child relationship using parentMessageId
        if ((a as ToolExecutionTimelineItem).parentMessageId === b.id) {
          return 1; // Tool execution should come after its parent message
        }
        
        // Check for relationship through message's toolCalls array
        if (b.message.toolCalls?.some(call => call.executionId === a.id)) {
          return 1; // Tool execution should come after message that references it
        }
      }
      
      if (a.type === TimelineItemType.MESSAGE && b.type === TimelineItemType.TOOL_EXECUTION) {
        // Check for direct parent/child relationship using parentMessageId
        if (a.id === (b as ToolExecutionTimelineItem).parentMessageId) {
          return -1; // Parent message should come before its tool execution
        }
        
        // Check for relationship through message's toolCalls array
        if (a.message.toolCalls?.some(call => call.executionId === b.id)) {
          return -1; // Message that references tool should come before the tool execution
        }
      }
      
      // Case 4: Neither has a sequence number, use timestamp ordering
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      
      // Case 5: Same timestamp, prioritize by type
      if (a.type !== b.type) {
        // Messages come before other types
        if (a.type === TimelineItemType.MESSAGE) return -1;
        if (b.type === TimelineItemType.MESSAGE) return 1;
        
        // Then tool executions
        if (a.type === TimelineItemType.TOOL_EXECUTION) return -1;
        if (b.type === TimelineItemType.TOOL_EXECUTION) return 1;
      }
      
      // Case 6: Same timestamp and type, use conversation flow logic for messages
      if (a.type === TimelineItemType.MESSAGE && b.type === TimelineItemType.MESSAGE) {
        // User messages should come before assistant responses when timestamps match
        if (a.message.role === 'user' && b.message.role === 'assistant') {
          return -1;
        }
        if (a.message.role === 'assistant' && b.message.role === 'user') {
          return 1;
        }
      }
      
      // Same timestamp, type, and priority; preserve original order
      return 0;
    });
    
    // Return the timeline directly without caching
    return { items: timeline, totalCount: timeline.length };
  }

  /**
   * The TimelineService no longer generates previews directly.
   * All preview generation is now handled by ToolExecutionManager.
   */
   
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

  // No cache methods needed - all operations go directly to persistence layer
}