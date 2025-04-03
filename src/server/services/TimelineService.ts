/**
 * Timeline Service for unified chronological feeds of messages and tool executions
 */
import { EventEmitter } from 'events';
import crypto from 'crypto';
import { StoredMessage } from '../../types/session';
import { 
  ToolExecutionState, 
  PermissionRequestState, 
  ToolExecutionStatus,
  ToolExecutionManager
} from '../../types/tool-execution';

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

interface TimelineItemsCache {
  [sessionId: string]: {
    items: TimelineItem[];
    lastUpdated: number;
  };
}

export enum TimelineServiceEvent {
  ITEM_ADDED = 'item_added',
  ITEMS_UPDATED = 'items_updated',
  ITEM_UPDATED = 'item_updated'
}

export class TimelineService extends EventEmitter {
  private itemsCache: TimelineItemsCache = {};
  private cacheExpiryMs = 30 * 1000; // 30 seconds
  private cleanup: () => void = () => {};

  constructor(
    private sessionManager: SessionManager,
    private webSocketService: WebSocketService
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
    
    // Always clear the cache for API requests to ensure we get the latest data
    delete this.itemsCache[sessionId];
    
    // Log that we're retrieving timeline items
    serverLogger.debug(`Retrieving timeline items for session ${sessionId}`);
    
    // Try to load the session from persistence first
    const sessionStatePersistence = getSessionStatePersistence();
    if (sessionStatePersistence) {
      try {
        const persistedData = await sessionStatePersistence.loadSession(sessionId);
        if (persistedData) {
          serverLogger.debug(`API request: Loaded persisted session ${sessionId} with ${persistedData.messages?.length || 0} messages`);
        }
      } catch (err) {
        // Just log but continue - we'll fall back to in-memory session
        serverLogger.debug(`API request: No persisted data for session ${sessionId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    
    // Get or build the timeline
    const timeline = await this.buildSessionTimeline(sessionId, includeRelated);
    
    // Log how many items we found
    serverLogger.debug(`Built timeline for session ${sessionId} with ${timeline.items.length} total items`);
    
    // Apply filtering by types if specified
    let filteredItems = timeline.items;
    if (types && types.length > 0) {
      filteredItems = timeline.items.filter(item => types.includes(item.type));
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
   */
  private async addMessageToTimeline(sessionId: string, message: StoredMessage): Promise<MessageTimelineItem> {
    // Create the timeline item
    const timelineItem: MessageTimelineItem = {
      id: message.id,
      type: TimelineItemType.MESSAGE,
      timestamp: message.timestamp,
      sessionId,
      message,
      toolExecutions: message.toolCalls?.map(call => call.executionId)
    };
    
    // Update cache
    await this.updateTimelineCache(sessionId, timelineItem);
    
    // Emit events
    this.emit(TimelineServiceEvent.ITEM_ADDED, timelineItem);
    
    // Emit the MESSAGE_RECEIVED event instead of TIMELINE_UPDATE
    this.emitToSession(sessionId, WebSocketEvent.MESSAGE_RECEIVED, {
      sessionId,
      message: timelineItem.message
    });
    
    return timelineItem;
  }

  /**
   * Add or update a tool execution in the timeline
   */
  private async addToolExecutionToTimeline(
    sessionId: string,
    toolExecution: ToolExecutionState,
    preview?: ToolPreviewState,
    parentMessageId?: string
  ): Promise<ToolExecutionTimelineItem> {
    // Create the timeline item with the provided preview
    const timelineItem: ToolExecutionTimelineItem = {
      id: toolExecution.id,
      type: TimelineItemType.TOOL_EXECUTION,
      timestamp: toolExecution.startTime,
      sessionId,
      toolExecution,
      permissionRequest: toolExecution.permissionId,
      preview,
      parentMessageId
    };
    
    // Update cache
    await this.updateTimelineCache(sessionId, timelineItem);
    
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
      
      // Enhanced validation and debug logging
      if (preview) {
        serverLogger.info(`Preview data availability for ${toolExecution.id}:`, {
          hasPreview: !!preview,
          hasValidPreview,
          contentType: preview.contentType,
          briefContentExists: !!preview.briefContent,
          briefContentLength: preview.briefContent?.length || 0,
          fullContentExists: !!preview.fullContent,
          fullContentLength: preview.fullContent?.length || 0,
          briefContentSample: preview.briefContent ? 
            preview.briefContent.substring(0, 100) + (preview.briefContent.length > 100 ? '...' : '') : 'MISSING',
          metadataKeys: preview.metadata ? Object.keys(preview.metadata) : []
        });
      }
      
      if (hasValidPreview) {
        serverLogger.info(`Emitting TOOL_EXECUTION_UPDATED with preview for ${toolExecution.id}:`, {
          toolId: toolExecution.id,
          toolName: toolExecution.toolName,
          status: toolExecution.status,
          hasPreview: true,
          previewContentType: preview?.contentType,
          previewBriefContentLength: preview?.briefContent?.length,
          previewFullContentLength: preview?.fullContent?.length,
          previewMetadataKeys: preview?.metadata ? Object.keys(preview.metadata) : []
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
    
    // Update cache
    await this.updateTimelineCache(sessionId, timelineItem);
    
    // Emit events
    this.emit(TimelineServiceEvent.ITEM_ADDED, timelineItem);
    
    // In our new model, permissions updates should come through as tool updates
    // Update the associated tool execution if it exists
    if (permissionRequest.executionId) {
      const toolExecution = this.getAgentService()?.getToolExecution(permissionRequest.executionId);
      
      if (toolExecution) {
        // Update the tool execution with the permission state and preview
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
      // Type-safe access to WebSocketService properties
      // Access the socket.io instance directly
      const socketIoServer = this.getSocketIOServer();
      
      if (socketIoServer) {
        socketIoServer.to(sessionId).emit(event, data);
        serverLogger.debug(`Emitted ${event} to session ${sessionId}`);
      } else {
        // Fallback method if direct io access is not available
        const agentService = this.getAgentService();
        if (agentService) {
          // If AgentService is accessible, emit the event through it
          agentService.emit(`timeline:${event}`, { sessionId, ...data });
          serverLogger.debug(`Emitted timeline:${event} through AgentService for session ${sessionId}`);
        } else {
          serverLogger.warn(`Could not emit ${event} to session ${sessionId}: No socket.io or AgentService instance found`);
        }
      }
    } catch (error) {
      serverLogger.error(`Error emitting to session ${sessionId}:`, error instanceof Error ? error.message : String(error));
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
      this.addMessageToTimeline(data.sessionId, data.message);
      
      // Also emit our new message received event
      agentService.emit(AgentServiceEvent.MESSAGE_RECEIVED, {
        sessionId: data.sessionId,
        message: data.message
      });
    });
    
    agentService.on(MESSAGE_UPDATED, (data: MessageAddedEvent) => {
      this.addMessageToTimeline(data.sessionId, data.message);
      
      // Also emit our new message updated event
      agentService.emit(AgentServiceEvent.MESSAGE_UPDATED, {
        sessionId: data.sessionId,
        messageId: data.message.id,
        content: data.message.content,
        isComplete: true
      });
    });
    
    // Also listen for message events from AgentEvents (from AgentRunner)
    const handleAgentEventsMessage = (data: MessageAddedEvent) => {
      this.addMessageToTimeline(data.sessionId, data.message);
      
      // Also emit our new message received event
      agentService.emit(AgentServiceEvent.MESSAGE_RECEIVED, {
        sessionId: data.sessionId,
        message: data.message
      });
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
    
    // Listen for tool execution events
    agentService.on(AgentServiceEvent.TOOL_EXECUTION_STARTED, (data: LegacyToolExecutionEventData) => {
      if (!data || !data.sessionId || !data.tool || !data.tool.executionId) {
        serverLogger.error('TimelineService: Missing required data in TOOL_EXECUTION_STARTED event');
        return;
      }
      
      const executionId = data.tool.executionId;
      
      this.findParentMessageId(data.sessionId, executionId)
        .then(parentMessageId => {
          // Create an execution object from the tool data that matches ToolExecutionState
          const execution: ToolExecutionState = {
            id: executionId,
            sessionId: data.sessionId,
            toolId: data.tool.id,
            toolName: data.tool.name,
            args: data.args || {},
            status: ToolExecutionStatus.RUNNING,
            startTime: data.timestamp || new Date().toISOString()
          };
          
          this.addToolExecutionToTimeline(data.sessionId, execution, undefined, parentMessageId);
        });
    });
    
    agentService.on(AgentServiceEvent.TOOL_EXECUTION_COMPLETED, (data: LegacyToolExecutionEventData) => {
      if (!data || !data.sessionId || !data.tool || !data.tool.executionId) {
        serverLogger.error('TimelineService: Missing required data in TOOL_EXECUTION_COMPLETED event');
        return;
      }
      
      const executionId = data.tool.executionId;
      
      this.findParentMessageId(data.sessionId, executionId)
        .then(parentMessageId => {
          // Create an execution object from the tool data
          const execution: ToolExecutionState = {
            id: executionId,
            sessionId: data.sessionId,
            toolId: data.tool.id,
            toolName: data.tool.name,
            args: data.args || {},
            result: data.result,
            status: ToolExecutionStatus.COMPLETED,
            startTime: data.startTime || data.timestamp || new Date().toISOString(),
            endTime: data.timestamp || new Date().toISOString(),
            executionTime: data.executionTime || 0
          };
          
          // Create proper preview object if it exists
          let toolPreview: ToolPreviewState | undefined = undefined;
          if (data.preview) {
            toolPreview = {
              id: crypto.randomUUID(),
              sessionId: data.sessionId,
              executionId: executionId,
              contentType: data.preview.contentType as PreviewContentType,
              briefContent: data.preview.briefContent,
              fullContent: data.preview.fullContent,
              metadata: data.preview.metadata
            };
          }
          
          this.addToolExecutionToTimeline(data.sessionId, execution, toolPreview, parentMessageId);
        });
    });
    
    // Listen for permission request events
    agentService.on(AgentServiceEvent.PERMISSION_REQUESTED, (data: PermissionRequestEvent) => {
      this.addPermissionRequestToTimeline(data.sessionId, data.permissionRequest, data.preview);
    });
    
    agentService.on(AgentServiceEvent.PERMISSION_RESOLVED, (data: PermissionRequestEvent) => {
      this.addPermissionRequestToTimeline(data.sessionId, data.permissionRequest, data.preview);
    });
    
    // Handle session loading
    agentService.on(AgentServiceEvent.SESSION_LOADED, (data: SessionEvent) => {
      // Clear the cache for this session to force a rebuild
      delete this.itemsCache[data.sessionId];
      
      // Force load the session from persistence before building the timeline
      const sessionStatePersistence = getSessionStatePersistence();
      
      // Wrap in an async function so we can use await
      (async () => {
        try {
          // Try to load from persistence first
          if (sessionStatePersistence) {
            try {
              const persistedData = await sessionStatePersistence.loadSession(data.sessionId);
              if (persistedData) {
                serverLogger.debug(`Loaded persisted session ${data.sessionId} with ${persistedData.messages?.length || 0} messages`);
              }
            } catch (err) {
              serverLogger.debug(`No persisted data for session ${data.sessionId}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
          
          // Build the timeline with either persisted or in-memory data
          const timeline = await this.buildSessionTimeline(data.sessionId, true);
          
          // Log for debugging
          serverLogger.debug(`Sending TIMELINE_HISTORY for session ${data.sessionId} with ${timeline.items.length} items`);
          
          // Send timeline history to clients
          this.emitToSession(data.sessionId, WebSocketEvent.TIMELINE_HISTORY, {
            sessionId: data.sessionId,
            items: timeline.items,
            totalCount: timeline.items.length
          });
        } catch (err) {
          serverLogger.error(`Error building timeline for session ${data.sessionId}:`, err);
        }
      })();
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
          persistedSessionData = await sessionStatePersistence.loadSession(sessionId);
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
      let toolExecutions: ToolExecutionState[] = [];
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
    // Check cache first
    const now = Date.now();
    const cached = this.itemsCache[sessionId];
    
    if (cached && now - cached.lastUpdated < this.cacheExpiryMs) {
      return { items: cached.items, totalCount: cached.items.length };
    }
    
    // Get session data
    const sessionData = await this.getSessionData(sessionId);
    if (!sessionData) {
      return { items: [], totalCount: 0 };
    }
    
    // We no longer generate previews in the timeline service
    // All preview generation is now handled by ToolExecutionManager
    
    const timeline: TimelineItem[] = [];
    
    // Add existing messages to timeline
    for (const message of sessionData.messages) {
      const item: MessageTimelineItem = {
        id: message.id,
        type: TimelineItemType.MESSAGE,
        timestamp: message.timestamp,
        sessionId,
        message,
        toolExecutions: message.toolCalls?.map(call => call.executionId)
      };
      
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
    
    // Sort timeline by timestamp
    timeline.sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      
      if (dateA === dateB) {
        // If timestamps are the same, prioritize messages over tool executions
        if (a.type === TimelineItemType.MESSAGE && b.type !== TimelineItemType.MESSAGE) {
          return -1;
        }
        if (a.type !== TimelineItemType.MESSAGE && b.type === TimelineItemType.MESSAGE) {
          return 1;
        }
      }
      
      return dateA - dateB;
    });
    
    // Update cache
    this.itemsCache[sessionId] = {
      items: timeline,
      lastUpdated: now
    };
    
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
    // Find the existing timeline item in the cache
    const cachedItems = this.itemsCache[sessionId]?.items || [];
    const itemIndex = cachedItems.findIndex(
      item => item.type === TimelineItemType.TOOL_EXECUTION && item.id === executionId
    );
    
    if (itemIndex >= 0) {
      // Update the preview in the timeline item
      const item = cachedItems[itemIndex] as ToolExecutionTimelineItem;
      item.preview = preview;
      
      // Update the cache
      await this.updateTimelineCache(sessionId, item);
      
      // Emit events
      this.emit(TimelineServiceEvent.ITEM_UPDATED, item);
      
      // Check if we have a valid preview with required content
      const hasValidPreview = !!(preview && preview.briefContent);
      
      // Enhanced validation and debug logging
      if (preview) {
        serverLogger.info(`Preview data for timeline item update ${executionId}:`, {
          hasPreview: !!preview,
          hasValidPreview,
          contentType: preview.contentType,
          briefContentExists: !!preview.briefContent,
          briefContentLength: preview.briefContent?.length || 0,
          fullContentExists: !!preview.fullContent,
          fullContentLength: preview.fullContent?.length || 0,
          briefContentSample: preview.briefContent ? 
            preview.briefContent.substring(0, 100) + (preview.briefContent.length > 100 ? '...' : '') : 'MISSING',
          metadataKeys: preview.metadata ? Object.keys(preview.metadata) : []
        });
      }
      
      if (hasValidPreview) {
        serverLogger.info(`Updating timeline item with preview for ${executionId}:`, {
          toolId: item.toolExecution.toolId,
          toolName: item.toolExecution.toolName,
          status: item.toolExecution.status,
          hasPreview: true,
          previewContentType: preview.contentType,
          previewBriefContentLength: preview.briefContent?.length,
          previewFullContentLength: preview.fullContent?.length,
          previewMetadataKeys: preview.metadata ? Object.keys(preview.metadata) : []
        });
        
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
    } else {
      serverLogger.warn(`Timeline item not found for execution ${executionId} in session ${sessionId}`);
    }
  }

  /**
   * Update the timeline cache with a new or updated item
   */
  private async updateTimelineCache(sessionId: string, item: TimelineItem): Promise<void> {
    if (!this.itemsCache[sessionId]) {
      // Cache doesn't exist, so create a new timeline
      await this.buildSessionTimeline(sessionId, true);
      return;
    }
    
    const cache = this.itemsCache[sessionId];
    
    // Check if the item already exists in the cache
    const existingIndex = cache.items.findIndex(i => i.id === item.id && i.type === item.type);
    
    if (existingIndex >= 0) {
      // Update existing item
      cache.items[existingIndex] = item;
    } else {
      // Add new item
      cache.items.push(item);
      
      // Re-sort the timeline
      cache.items.sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        
        if (dateA === dateB) {
          // If timestamps are the same, prioritize messages over tool executions
          if (a.type === TimelineItemType.MESSAGE && b.type !== TimelineItemType.MESSAGE) {
            return -1;
          }
          if (a.type !== TimelineItemType.MESSAGE && b.type === TimelineItemType.MESSAGE) {
            return 1;
          }
        }
        
        return dateA - dateB;
      });
    }
    
    // Update the last updated timestamp
    cache.lastUpdated = Date.now();
  }
}