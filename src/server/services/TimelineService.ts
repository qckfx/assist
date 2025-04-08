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