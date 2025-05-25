/**
 * Agent service for API integration
 */
import { getSessionStatePersistence } from './sessionPersistenceProvider';
import { EventEmitter } from 'events';
import { Anthropic } from '@anthropic-ai/sdk';
import {
  Agent,
  ToolExecutionEvents,
  ToolResultEntry,
} from '@qckfx/agent';
import type { CheckpointData, EnvironmentStatusData, ProcessingCompletedData } from '@qckfx/agent';
import {
  ToolExecutionStatus,
  ToolExecutionEvent,
  PermissionRequestState,
  RepositoryInfo, 
  createExecutionAdapter,
  ExecutionAdapter,
  ExecutionAdapterFactoryOptions,
  ToolExecutionState,
  PermissionMode,
} from '../../types/platform-types';
import { SessionState } from '../../types/session';
import { PreviewContentType, ToolPreviewState } from '../../types/preview';
import { StoredMessage, SessionListEntry, CheckpointInfo } from '../../types/session';
import { createToolExecutionManager } from './tool-execution'; 
import { ToolExecutionManagerImpl } from './tool-execution/ToolExecutionManagerImpl';
import { createPreviewManager, PreviewManagerImpl } from './PreviewManagerImpl';
import { SessionManager, sessionManager } from './SessionManager';
import { previewService } from './preview/PreviewService';
import { ServerError, AgentBusyError } from '../utils/errors';
import { serverLogger } from '../logger';
import * as SessionPersistence from './SessionPersistence';
import crypto from 'crypto';
import { container, TimelineService } from '../container';
import { WebSocketService } from './WebSocketService';
import { WebSocketEvent } from '../../types/websocket';

/**
 * Events emitted by the agent service
 */
export enum AgentServiceEvent {
  // Process lifecycle events
  PROCESSING_STARTED = 'processing:started',
  PROCESSING_COMPLETED = 'processing:completed',
  PROCESSING_ERROR = 'processing:error',
  PROCESSING_ABORTED = 'processing:aborted',
  
  // Tool events
  TOOL_EXECUTION = 'tool:execution',
  TOOL_EXECUTION_STARTED = 'tool:execution:started',
  TOOL_EXECUTION_COMPLETED = 'tool:execution:completed',
  TOOL_EXECUTION_ERROR = 'tool:execution:error',
  TOOL_EXECUTION_ABORTED = 'tool:execution:aborted', // New event for aborted tools
  
  // Permission events
  PERMISSION_REQUESTED = 'permission:requested',
  PERMISSION_RESOLVED = 'permission:resolved',
  
  // Fast Edit Mode events
  FAST_EDIT_MODE_ENABLED = 'fast_edit_mode_enabled',
  FAST_EDIT_MODE_DISABLED = 'fast_edit_mode_disabled',
  
  // Session events
  SESSION_SAVED = 'session:saved',
  SESSION_LOADED = 'session:loaded',
  SESSION_DELETED = 'session:deleted',
  
  // Message events (new)
  MESSAGE_RECEIVED = 'message:received',
  MESSAGE_UPDATED = 'message:updated',
  
  // Timeline events (new)
  TIMELINE_ITEM_UPDATED = 'timeline_item:updated'
}

/**
 * Configuration for the agent service
 */
export interface AgentServiceConfig {
  /** Default model to use */
  defaultModel?: string;
  /** Whether to enable prompt caching */
  cachingEnabled?: boolean;
}


/**
 * Agent service for processing queries
 */
// Define interfaces for the tool state and events
interface ActiveTool {
  toolId: string;
  name: string;
  startTime: Date;
  paramSummary: string;
  executionId: string;
}

// Define type interfaces for the event data
interface ToolExecutionEventData {
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

export class AgentService extends EventEmitter {
  private config: AgentServiceConfig;
  private activeProcessingSessionIds: Set<string> = new Set();
  private sessionPermissionModes: Map<string, PermissionMode> = new Map();
  private activeTools: Map<string, ActiveTool[]> = new Map();
  private sessionExecutionAdapterTypes: Map<string, 'local' | 'docker' | 'remote'> = new Map();
  private sessionRemoteIds: Map<string, string> = new Map();
  private activeToolArgs = new Map<string, Record<string, unknown>>();
  
  // Add new properties for the managers
  private toolExecutionManager: ToolExecutionManagerImpl;
  private previewManager: PreviewManagerImpl;
  // Store reference to the current agent
  private agent: Agent | null = null;
  
  // Add new properties to store messages and repository info
  private sessionMessages: Map<string, StoredMessage[]> = new Map();
  private sessionRepositoryInfo: Map<string, RepositoryInfo> = new Map();
  
  // Instance properties to track Docker initialization status
  private dockerInitializing = false;
  private dockerInitializationPromise: Promise<ExecutionAdapter | null> | null = null;
  
  /**
   * Creates a concise summary of tool arguments for display
   * @private
   * @param toolId The ID of the tool being executed
   * @param args The arguments passed to the tool
   * @returns A string summary of the arguments
   */
  private summarizeToolParameters(toolId: string, args: Record<string, unknown>): string {
    // Special handling for file-related tools
    if ('file_path' in args || 'filepath' in args || 'path' in args) {
      const filePath = (args.file_path || args.filepath || args.path) as string;
      return filePath;
    }
    
    // Special handling for pattern-based tools
    if ('pattern' in args) {
      return `pattern: ${args.pattern}${args.include ? `, include: ${args.include}` : ''}`;
    }
    
    // Special handling for command execution
    if ('command' in args) {
      const cmd = args.command as string;
      return cmd.length > 40 ? `${cmd.substring(0, 40)}...` : cmd;
    }
    
    // Default case - basic serialization with length limit
    try {
      const str = JSON.stringify(args).replace(/[{}"]/g, '');
      return str.length > 50 ? `${str.substring(0, 50)}...` : str;
    } catch {
      // Return a fallback string if JSON serialization fails
      return 'Tool parameters';
    }
  }

  constructor(config: AgentServiceConfig) {
    super();
    this.config = {
      ...config,
      defaultModel: config.defaultModel,
      cachingEnabled: config.cachingEnabled !== undefined ? config.cachingEnabled : true,
    };
    
    // Initialize the new managers
    this.previewManager = createPreviewManager() as PreviewManagerImpl;
    this.toolExecutionManager = createToolExecutionManager(this.previewManager) as ToolExecutionManagerImpl;
    
    // Set up event forwarding from the tool execution manager
    this.setupToolExecutionEventForwarding();
  }
  
  /**
   * Set up event forwarding from ToolExecutionManager to AgentService
   */
  private setupToolExecutionEventForwarding(): void {
    // Map ToolExecutionEvent to AgentServiceEvent
    const eventMap = {
      [ToolExecutionEvent.CREATED]: AgentServiceEvent.TOOL_EXECUTION_STARTED,
      [ToolExecutionEvent.UPDATED]: AgentServiceEvent.TOOL_EXECUTION,
      [ToolExecutionEvent.COMPLETED]: AgentServiceEvent.TOOL_EXECUTION_COMPLETED,
      [ToolExecutionEvent.ERROR]: AgentServiceEvent.TOOL_EXECUTION_ERROR,
      [ToolExecutionEvent.ABORTED]: AgentServiceEvent.TOOL_EXECUTION_ABORTED,
      [ToolExecutionEvent.PERMISSION_REQUESTED]: AgentServiceEvent.PERMISSION_REQUESTED,
      [ToolExecutionEvent.PERMISSION_RESOLVED]: AgentServiceEvent.PERMISSION_RESOLVED
      // PREVIEW_GENERATED events are handled separately, not forwarded to AgentService
    };
    
    // Forward each event type
    Object.entries(eventMap).forEach(([toolEvent, agentEvent]) => {
      this.toolExecutionManager.on(toolEvent as ToolExecutionEvent, (data) => {
        
        // For special events that have a specific structure, preserve the original structure
        // and don't transform the data - just forward it as-is
        if (toolEvent === ToolExecutionEvent.COMPLETED ||
            toolEvent === ToolExecutionEvent.PERMISSION_REQUESTED ||
            toolEvent === ToolExecutionEvent.PERMISSION_RESOLVED) {
            
          // Type the data properly based on the event type
          if (toolEvent === ToolExecutionEvent.COMPLETED) {
            this.emit(agentEvent, data);
            
          } else if (toolEvent === ToolExecutionEvent.PERMISSION_REQUESTED || 
                     toolEvent === ToolExecutionEvent.PERMISSION_RESOLVED) {
            this.emit(agentEvent, data);
          }
          return; // Skip the standard emit flow
        }
        
        // For other events, transform the data to the expected format
        const transformedData = this.transformEventData(
          toolEvent as ToolExecutionEvent, 
          data as ToolExecutionState
        );
        
        this.emit(agentEvent, transformedData);
      });
    });
  }
  
  /**
   * Transform event data from ToolExecutionManager format to AgentService format
   */
  private transformEventData(
    toolEvent: ToolExecutionEvent, 
    data: ToolExecutionState
  ): ToolExecutionEventData | void {
    switch (toolEvent) {
      case ToolExecutionEvent.CREATED:
        return this.transformToolCreatedEvent(data);
        
      case ToolExecutionEvent.UPDATED:
        return this.transformToolUpdatedEvent(data);
        
      case ToolExecutionEvent.ERROR:
        return this.transformToolErrorEvent(data);
        
      case ToolExecutionEvent.ABORTED:
        return this.transformToolAbortedEvent(data);
    }
  }
  
  /**
   * Transform tool created event data
   */
  private transformToolCreatedEvent(execution: ToolExecutionState): ToolExecutionEventData {
    // Get preview if available
    const preview = this.previewManager.getPreviewForExecution(execution.id);
    
    // Also emit a timeline item event for this tool execution
    this.emit(AgentServiceEvent.TIMELINE_ITEM_UPDATED, {
      sessionId: execution.sessionId,
      item: {
        id: execution.id,
        type: 'tool_execution',
        sessionId: execution.sessionId,
        timestamp: execution.startTime,
        toolExecution: execution,
        preview: preview || undefined
      },
      isUpdate: false // This is a new item, not an update
    });
    
    return {
      sessionId: execution.sessionId,
      tool: {
        id: execution.toolId,
        name: execution.toolName,
        executionId: execution.id
      },
      args: execution.args,
      paramSummary: execution.summary || this.summarizeToolParameters(execution.toolId, execution.args),
      timestamp: execution.startTime
    };
  }
  
  /**
   * Transform tool updated event data
   */
  private transformToolUpdatedEvent(execution: ToolExecutionState): ToolExecutionEventData {
    // Get preview if available
    const preview = this.previewManager.getPreviewForExecution(execution.id);
    
    // Also emit a timeline item event for this tool execution update
    this.emit(AgentServiceEvent.TIMELINE_ITEM_UPDATED, {
      sessionId: execution.sessionId,
      item: {
        id: execution.id,
        type: 'tool_execution',
        sessionId: execution.sessionId,
        timestamp: execution.startTime,
        toolExecution: execution,
        preview: preview || undefined
      },
      isUpdate: true // This is an update to an existing item
    });
    
    return {
      sessionId: execution.sessionId,
      tool: {
        id: execution.toolId,
        name: execution.toolName,
        executionId: execution.id
      },
      result: execution.result,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Transform tool error event data
   */
  private transformToolErrorEvent(execution: ToolExecutionState): ToolExecutionEventData {
    // Check if a preview exists already
    let preview = this.previewManager.getPreviewForExecution(execution.id);
    
    // If no preview exists and we have an error, generate an error preview
    if (!preview && execution.error) {
      try {
        // Generate an error preview
        const errorPreview = previewService.generateErrorPreview(
          { id: execution.toolId, name: execution.toolName },
          {
            message: execution.error.message,
            name: 'Error',
            stack: execution.error.stack
          },
          { toolId: execution.toolId, args: execution.args }
        );
        
        // Extract fullContent if available for error preview
        let fullContent: string | undefined = undefined;
        
        // Error previews may have a fullContent field with the stack trace
        if (errorPreview.hasFullContent) {
          // Try to safely extract fullContent from any preview with it
          fullContent = (errorPreview as unknown as { fullContent?: string }).fullContent;
        }
        
        // Create and store the preview
        preview = this.previewManager.createPreview(
          execution.sessionId,
          execution.id,
          errorPreview.contentType,
          errorPreview.briefContent,
          fullContent,
          errorPreview.metadata
        );
        
        // Link the preview to the execution
        this.toolExecutionManager.associatePreview(execution.id, preview.id);
      } catch (error) {
        serverLogger.error(`Error generating error preview for ${execution.id}:`, error);
      }
    }
    
    // Also emit a timeline item event for this tool execution error
    this.emit(AgentServiceEvent.TIMELINE_ITEM_UPDATED, {
      sessionId: execution.sessionId,
      item: {
        id: execution.id,
        type: 'tool_execution',
        sessionId: execution.sessionId,
        timestamp: execution.startTime,
        toolExecution: execution,
        preview: preview || undefined
      },
      isUpdate: true // This is an update to an existing item
    });
    
    return {
      sessionId: execution.sessionId,
      tool: {
        id: execution.toolId,
        name: execution.toolName,
        executionId: execution.id
      },
      error: execution.error,
      paramSummary: execution.summary,
      timestamp: execution.endTime,
      startTime: execution.startTime,
      preview: preview ? this.convertPreviewStateToData(preview) : undefined
    };
  }
  
  /**
   * Transform tool aborted event data
   */
  private transformToolAbortedEvent(execution: ToolExecutionState): ToolExecutionEventData {
    // Check if a preview exists already
    let preview = this.previewManager.getPreviewForExecution(execution.id);
    
    // If no preview exists, generate an abort preview
    if (!preview) {
      try {
        // Create a simple text preview for aborted executions
        const abortMessage = `Tool execution was aborted at ${execution.endTime}`;
        
        // Create and store the preview
        preview = this.previewManager.createPreview(
          execution.sessionId,
          execution.id,
          PreviewContentType.TEXT, // Using proper enum value
          abortMessage,
          abortMessage, // same for brief and full
          { 
            toolId: execution.toolId,
            aborted: true,
            abortTime: execution.endTime
          }
        );
        
        // Link the preview to the execution
        this.toolExecutionManager.associatePreview(execution.id, preview.id);
      } catch (error) {
        serverLogger.error(`Error generating abort preview for ${execution.id}:`, error);
      }
    }
    
    // Also emit a timeline item event for this tool execution abort
    this.emit(AgentServiceEvent.TIMELINE_ITEM_UPDATED, {
      sessionId: execution.sessionId,
      item: {
        id: execution.id,
        type: 'tool_execution',
        sessionId: execution.sessionId,
        timestamp: execution.startTime,
        toolExecution: execution,
        preview: preview || undefined
      },
      isUpdate: true // This is an update to an existing item
    });
    
    return {
      sessionId: execution.sessionId,
      tool: {
        id: execution.toolId,
        name: execution.toolName,
        executionId: execution.id
      },
      timestamp: execution.endTime,
      startTime: execution.startTime,
      abortTimestamp: execution.endTime,
      preview: preview ? this.convertPreviewStateToData(preview) : undefined
    };
  }
  
  /**
   * Convert preview state to the format expected by clients
   */
  private convertPreviewStateToData(preview: ToolPreviewState): {
    contentType: string;
    briefContent: string;
    fullContent?: string;
    metadata?: Record<string, unknown>;
  } {
    return {
      contentType: preview.contentType,
      briefContent: preview.briefContent,
      fullContent: preview.fullContent,
      metadata: preview.metadata
    };
  }
  
  // When a tool execution starts (from the onToolExecutionStart callback)
  private handleToolExecutionStart(executionId: string, toolId: string, toolName: string, toolUseId: string, args: Record<string, unknown>, sessionId: string): void {
    
    serverLogger.debug(`Generated executionId for tool execution: ${executionId}`, {
      toolUseId,
      toolId,
      toolName
    });
    
    // Create a new tool execution in the manager with the generated executionId
    const execution = this.toolExecutionManager.createExecution(
      sessionId,
      toolId,
      toolName,
      executionId,
      toolUseId,
      args
    );
    
    // Add a summary for better display
    const paramSummary = this.summarizeToolParameters(toolId, args);
    this.toolExecutionManager.updateExecution(execution.id, { summary: paramSummary });
    
    // Start the execution
    this.toolExecutionManager.startExecution(execution.id);
    
    // For backward compatibility, still track in the activeTools map
    if (!this.activeTools.has(sessionId)) {
      this.activeTools.set(sessionId, []);
    }
    
    this.activeTools.get(sessionId)?.push({
      toolId,
      executionId: execution.id,
      name: toolName,
      startTime: new Date(execution.startTime),
      paramSummary
    });
    
    // Store the arguments for potential preview generation
    this.activeToolArgs.set(`${sessionId}:${toolId}`, args);
    this.activeToolArgs.set(`${sessionId}:${execution.id}`, args);
  }
  
  // When a tool execution completes
  private handleToolExecutionComplete(
    executionId: string,
    toolId: string, 
    args: Record<string, unknown>, 
    result: unknown, 
    executionTime: number, 
    sessionId: string
  ): void {

    // Find the execution ID for this tool
    const activeTools = this.activeTools.get(sessionId) || [];
    // const activeTool = activeTools.find(t => t.toolId === toolId);
    // const executionId = activeTool?.executionId;
    
    if (executionId) {
      // Complete the execution in the manager
      this.toolExecutionManager.completeExecution(executionId, result, executionTime);
      
      // Generate a preview for the completed tool
      // this.generateToolExecutionPreview(executionId, toolId, args, result);
      
      // Remove from active tools
      const newActiveTools = activeTools.filter(t => t.toolId !== toolId);
      this.activeTools.set(sessionId, newActiveTools);
      
      // // Clean up stored arguments
      this.activeToolArgs.delete(`${sessionId}:${toolId}`);
      this.activeToolArgs.delete(`${sessionId}:${executionId}`);
    } else {
      serverLogger.warn(`No execution ID found for completed tool: ${toolId}`);
    }
  }
  
  // When a tool execution fails
  private handleToolExecutionError(
    executionId: string,
    toolId: string, 
    args: Record<string, unknown>, 
    error: Error, 
    sessionId: string
  ): void {
    // Find the execution ID for this tool
    const activeTools = this.activeTools.get(sessionId) || [];
    // const activeTool = activeTools.find(t => t.toolId === toolId);
    // const executionId = activeTool?.executionId;
    
    if (executionId) {
      // Mark the execution as failed in the manager
      this.toolExecutionManager.failExecution(executionId, error);
      
      // Remove from active tools
      this.activeTools.set(
        sessionId, 
        activeTools.filter(t => t.toolId !== toolId)
      );
      
      // Clean up stored arguments
      this.activeToolArgs.delete(`${sessionId}:${toolId}`);
      this.activeToolArgs.delete(`${sessionId}:${executionId}`);
    } else {
      // If we don't have an execution ID, fall back to old behavior
      serverLogger.warn(`No execution ID found for failed tool: ${toolId}`);
    }
  }

  /**
   * Save complete agent session state including conversation history and agent service config
   */
  public async saveSessionState(
    sessionId: string, 
    sessionState: SessionState
  ): Promise<void> {
    try {
      // Get persistence service
      const persistence = getSessionStatePersistence();
      
      // Get saved session data or create new if it doesn't exist
      let sessionData = await persistence.getSessionDataWithoutEvents(sessionId);
      if (!sessionData) {
        // Create basic session data structure
        const session = sessionManager.getSession(sessionId);
        sessionData = {
          id: sessionId,
          name: `Session ${sessionId}`,
          createdAt: session.createdAt.toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
          toolExecutions: [],
          permissionRequests: [],
          previews: [],
          sessionState
        };
      }
      
      if (sessionData) {
        // Update session state with conversation history included
        sessionData.sessionState = sessionState;
        sessionData.updatedAt = new Date().toISOString();
        
        // Save complete data
        await persistence.saveSession(sessionData);
      }
    } catch (error) {
      serverLogger.error(`Failed to save agent session state for session ${sessionId}:`, error);
    }
  }

  /**
   * Process a query for a specific session
   * @param sessionId The session ID to process the query for
   * @param query The query text to process
   * @param model Model name to use for this query
   */
  public async processQuery(
    sessionManager: SessionManager,
    webSocketService: WebSocketService,
    sessionId: string,
    query: string,
    model: string
  ): Promise<{
    response: string;
    toolResults: ToolResultEntry[];
  }> {
    // Get the session
    const session = sessionManager.getSession(sessionId);
    // Get the execution adapter type and sandbox ID for this session
    const executionAdapterType = this.getExecutionAdapterType(sessionId) || 'local';
    const remoteId = this.getRemoteId(sessionId);

    // Check if the session is already processing
    if (session.isProcessing || this.activeProcessingSessionIds.has(sessionId)) {
      throw new AgentBusyError();
    }

    try {
      // Mark the session as processing
      // Note: Abort status will be cleared in AgentRunner.processQuery when a new message is received
      this.activeProcessingSessionIds.add(sessionId);
      
      // Do NOT clearSessionAborted() here - that will be done in AgentRunner after abort is handled
      // Why? Because:
      // 1. If we clear here, we'd lose the abort status that AgentRunner uses to detect aborts
      // 2. AgentRunner needs to both check and clear the status in the same critical section (try/finally)
      // 3. Clearing here would create a race condition if another abort comes in between clear and AgentRunner's check
      
      sessionManager.updateSession(sessionId, { 
        isProcessing: true,
        state: {
          ...session.state
        }
      });

      // Emit event for processing started
      this.emit(AgentServiceEvent.PROCESSING_STARTED, { sessionId });

      this.agent = await Agent.create({
        config: {
          defaultModel: model,
          cachingEnabled: this.config.cachingEnabled || true,
          environment: {
            type: executionAdapterType,
          },
          logLevel: 'debug',
          experimentalFeatures: {}
        },
        callbacks: {
          getRemoteId: async () => {
            return remoteId!;
          },
          onCheckpointReady: async (cp: CheckpointData) => {
            sessionManager.checkpointEventHandler(cp);
          },
          onEnvironmentStatusChanged: async (event: EnvironmentStatusData) => {
            webSocketService.io.to(sessionId).emit(WebSocketEvent.ENVIRONMENT_STATUS_CHANGED, event);
          },
          onProcessingCompleted: async (event: ProcessingCompletedData) => {
            webSocketService.io.to(sessionId).emit(WebSocketEvent.PROCESSING_COMPLETED, {sessionId, result: event.response});
          },
          onPermissionRequested: async ({toolId, args}: {toolId: string, args: Record<string, unknown>}) => {
            // For interactive mode, find or create a tool execution for this permission request
            let executionId: string;
            const activeTools = this.activeTools.get(sessionId) || [];
            const activeTool = activeTools.find(t => t.toolId === toolId);
            
            if (activeTool?.executionId) {
              executionId = activeTool.executionId;
            } else {
              serverLogger.warn(`No execution ID found for permission request: ${toolId}`);
              throw new Error(`No execution ID found for permission request: ${toolId}`);
            }
            
            // Create the permission request in the manager
            const permission = this.toolExecutionManager.requestPermission(executionId, args);
            if (!permission || !permission.id) {
              serverLogger.error(`Failed to create permission request for tool execution ${executionId}`);
              return Promise.resolve(false);
            }
            
            // Create a promise to wait for permission resolution
            return new Promise<boolean>(resolve => {
              // Store resolver in a closure that will be called when permission is resolved
              // We're now utilizing toolExecutionManager to track permissions
              // The UI will call resolvePermissionByExecutionId which will trigger resolution
              
              // Create a one-time event listener for permission resolution
              const onPermissionResolved = (data: unknown) => {
                // Type check and cast the data
                const typedData = data as { execution: ToolExecutionState; permissionRequest: PermissionRequestState };
                
                // Check if this is our permission request
                if (typedData.permissionRequest.id === permission.id) {
                  // Remove the listener to avoid memory leaks
                  const removeListener = this.toolExecutionManager.on(ToolExecutionEvent.PERMISSION_RESOLVED, onPermissionResolved);
                  removeListener();
                  
                  // Resolve with the permission status
                  resolve(typedData.permissionRequest.granted || false);
                }
              };
              
              // Add the listener
              this.toolExecutionManager.on(ToolExecutionEvent.PERMISSION_RESOLVED, onPermissionResolved); 
            });
          }
        }
      })
      
      // Apply permission mode to the agent's permission manager
      const permissionMode = this.getPermissionMode(sessionId);
      const isFastEditModeEnabled = permissionMode === PermissionMode.FAST_EDIT;
      this.agent.setFastEditMode(isFastEditModeEnabled);
      
      // Apply dangerous mode if enabled
      if (permissionMode === PermissionMode.DANGEROUS) {
        this.agent.setDangerMode(true);
      } else {
        this.agent.setDangerMode(false);
      }
      
      // Store the execution adapter type in the session
      // Get the actual type from the agent's environment or default to 'local'
      const executionType = this.agent.environment as 'local' | 'docker' | 'remote' || 'docker';
      this.setExecutionAdapterType(sessionId, executionType);

      // Collect tool results
      const toolResults: ToolResultEntry[] = [];
      
      // Register callbacks for tool execution events using the new API
      const unregisterStart = this.agent.on(ToolExecutionEvents.STARTED, 
        ({id, toolId, toolName, toolUseId, args}: {id: string, toolId: string, toolName: string, toolUseId: string, args: Record<string, unknown>}) => {
          this.handleToolExecutionStart(id, toolId, toolName, toolUseId, args, sessionId);
        }
      );
      
      const unregisterComplete = this.agent.on(ToolExecutionEvents.COMPLETED, 
        ({id, toolId, args, result, executionTime}: {id: string, toolId: string, args: Record<string, unknown>, result?: unknown, executionTime?: number}) => {
          this.handleToolExecutionComplete(id, toolId, args, result, executionTime!, sessionId);
        }
      );
      
      const unregisterError = this.agent.on(ToolExecutionEvents.ERROR,
        ({id, toolId, args, error}: {id: string, toolId: string, args: Record<string, unknown>, error?: {message: string, stack?: string}}) => {
          this.handleToolExecutionError(id, toolId, args, new Error(error?.message || 'Unknown error'), sessionId);
        }
      );
      
      try {
        // Ensure the session state includes the sessionId for the new abort system
        session.state.coreSessionState.id = sessionId;
        
        console.log('session state', session.state.coreSessionState);
        // Process the query with our registered callbacks
        const result = await this.agent.processQuery(query, model, session.state.coreSessionState);
  
        if (result.error) {
          throw new ServerError(`Agent error: ${result.error}`);
        }
        
        // Capture any tool results from the response
        if (result.result && result.result.toolResults) {
          toolResults.push(...result.result.toolResults);
        }
        
        // Update the session with the new state, ensuring proper structure for conversationHistory
        const coreSessionState = result.sessionState;
        
        sessionManager.updateSession(sessionId, {
          state: {
            coreSessionState: coreSessionState,
            checkpoints: session.state.checkpoints,
          },
          isProcessing: false,
        });

        this.emit(AgentServiceEvent.PROCESSING_COMPLETED, {
          sessionId,
          response: result.response,
        });
        
        // After successful query processing, save the complete session state
        await this.saveSessionState(sessionId, session.state);

        /*
         * ----------------------------------------------------------------------
         * Ensure assistant response is persisted to the timeline and broadcast
         * ----------------------------------------------------------------------
         * Prior to migrating to the finite‑state‑machine driven agent loop, the
         * assistant reply was written to the timeline service inside the
         * legacy execution path.  The UI relies on the resulting
         * `message_received` WebSocket event to display the assistant message
         * in real‑time.  Since the FSM refactor the AgentService only emitted
         * `PROCESSING_COMPLETED`, so no assistant text reached the client.
         *
         * To restore the previous behaviour we now:
         *   1. Build a message object representing the assistant reply.
         *   2. Persist it via the TimelineService which in turn emits the
         *      appropriate WebSocket event.
         *
         * We perform this step AFTER the main processing succeeds so we only
         * save complete responses.  Any error paths are handled earlier.
         */

        try {
          // Only create a timeline entry for non‑empty assistant responses
          if (result.response && result.response.trim().length > 0) {
            if (container?.isBound?.(TimelineService)) {
              const timelineServiceInstance = container.get(TimelineService) as TimelineService;

              // Construct the assistant message compatible with StoredMessage
              const assistantMessage: StoredMessage = {
                id: crypto.randomUUID(),
                role: 'assistant' as const,
                timestamp: new Date().toISOString(),
                content: [{ type: 'text', text: result.response }],
                confirmationStatus: 'confirmed' as const,
              };

              await timelineServiceInstance.addMessageToTimeline(sessionId, assistantMessage);
            } else {
              serverLogger.warn('TimelineService not found in container – cannot record assistant message');
            }
          }
        } catch (err) {
          // Soft‑fail – message persistence must not block the main flow
          serverLogger.error('Failed to persist assistant message to timeline:', err);
        }

        return {
          response: result.response || '',
          toolResults,
        };
      } catch (error) {
        // Update the session to mark it as not processing
        sessionManager.updateSession(sessionId, { isProcessing: false });

        // Emit error event
        this.emit(AgentServiceEvent.PROCESSING_ERROR, {
          sessionId,
          error,
        });

        throw error;
      } finally {
        // Clean up by unregistering callbacks to prevent memory leaks
        // Check if the unregister functions exist before calling them
        // (in case listener registration failed for some reason)
        if (unregisterStart) unregisterStart();
        if (unregisterComplete) unregisterComplete(); 
        if (unregisterError) unregisterError();
        
        // Remove the session from the active processing set
        this.activeProcessingSessionIds.delete(sessionId);
      }
    } catch (error) {
      // Update the session to mark it as not processing
      sessionManager.updateSession(sessionId, { isProcessing: false });

      // Emit error event
      this.emit(AgentServiceEvent.PROCESSING_ERROR, {
        sessionId,
        error,
      });

      // Remove the session from the active processing set
      this.activeProcessingSessionIds.delete(sessionId);

      throw error;
    }
  }

  /**
   * Resolve a permission request by execution ID
   * 
   * This is the recommended approach that directly uses the execution ID.
   */
  public resolvePermissionByExecutionId(executionId: string, granted: boolean): boolean {
    try {
      // Directly use the ToolExecutionManager method to resolve permission
      const result = this.toolExecutionManager.resolvePermissionByExecutionId(executionId, granted);
      return !!result;
    } catch (error) {
      console.log(`Error resolving permission for execution: ${executionId}`, error);
      return false;
    }
  }
  
  /**
   * Get pending permission requests for a session
   */
  public getPermissionRequests(sessionId: string): Array<{
    permissionId: string;
    toolId: string;
    args: Record<string, unknown>;
    timestamp: string;
  }> {
    const requests: Array<{
      permissionId: string;
      toolId: string;
      args: Record<string, unknown>;
      timestamp: string;
    }> = [];
    
    // Use the toolExecutionManager to get permission requests for the session
    const permissionRequests = this.toolExecutionManager
      .getExecutionsForSession(sessionId)
      .filter(e => e.status === ToolExecutionStatus.AWAITING_PERMISSION)
      .map(e => this.toolExecutionManager.getPermissionRequestForExecution(e.id))
      .filter(Boolean);
    
    for (const request of permissionRequests) {
      if (request) {
        requests.push({
          permissionId: request.id,
          toolId: request.toolId,
          args: request.args,
          timestamp: request.requestTime,
        });
      }
    }
    
    return requests;
  }

  /**
   * Abort a running operation for a session
   */
  public abortOperation(sessionId: string): boolean {
    // Get the session
    const session = sessionManager.getSession(sessionId);

    // Check if the session is processing
    if (!session.isProcessing && !this.activeProcessingSessionIds.has(sessionId)) {
      console.log(`[AgentService] Session ${sessionId} is not processing, nothing to abort`);
      // Not processing, nothing to abort
      return false;
    }

    // Use the centralized session abort mechanism to get timestamp
    // This will update the abort registry and emit events
    const abortTimestamp = Agent.setSessionAborted(sessionId);
    
    // Store the timestamp in the session state
    session.state.coreSessionState.abortedAt = abortTimestamp;
    
    // Abort via the AbortController in the session state
    if (session.state.coreSessionState.abortController && !session.state.coreSessionState.abortController.signal.aborted) {
      console.log(`[AgentService] Aborting operation for session ${sessionId} via AbortController`);
      session.state.coreSessionState.abortController.abort();
      console.log(`[AgentService] AbortController.signal.aborted=${session.state.coreSessionState.abortController.signal.aborted}`);
    } else if (session.state.coreSessionState.abortController) {
      console.log(`[AgentService] AbortController for session ${sessionId} was already aborted`);
    } else {
      console.log(`[AgentService] No AbortController found for session ${sessionId}`);
      // Ensure we have an abortController even if it's missing
      session.state.coreSessionState.abortController = new AbortController();
      session.state.coreSessionState.abortController.abort();
    }

    serverLogger.info('abortOperation', { sessionId, session });
    
    // Get active tools for this session before we mark it as not processing
    const activeTools = this.getActiveTools(sessionId);
    
    // Update the session with modified state object
    // Since we modified the state object in place, any code holding a reference
    // to session.state will see these changes
    sessionManager.updateSession(sessionId, { 
      isProcessing: false,
      // We don't need to include state in the update since we modified it in place
    });
    
    // Also remove from active processing set
    this.activeProcessingSessionIds.delete(sessionId);

    // Emit abort event with timestamp
    this.emit(AgentServiceEvent.PROCESSING_ABORTED, { 
      sessionId,
      timestamp: new Date().toISOString(),
      abortTimestamp
    });
    
    // For each active tool, mark it as aborted in the manager and emit an event
    for (const tool of activeTools) {
      if (tool.executionId) {
        try {
          // Abort the execution in the manager (this will emit events)
          this.toolExecutionManager.abortExecution(tool.executionId);
          
          // Also remove it from the active tools list to prevent further processing
          this.activeTools.set(
            sessionId, 
            (this.activeTools.get(sessionId) || []).filter(t => t.executionId !== tool.executionId)
          );
          
          // Clean up stored arguments
          this.activeToolArgs.delete(`${sessionId}:${tool.toolId}`);
          this.activeToolArgs.delete(`${sessionId}:${tool.executionId}`);
        } catch (error) {
          // If abortion in manager fails, fall back to old behavior
          serverLogger.warn(`Failed to abort tool execution ${tool.executionId}: ${(error as Error).message}`);
        }
      } else {
         serverLogger.warn(`No execution ID found for aborted tool: ${tool.toolId}`);
      }
    }

    return true;
  }

  /**
   * Get the processing status of a session
   */
  public isProcessing(sessionId: string): boolean {
    // Get the session
    const session = sessionManager.getSession(sessionId);
    return session.isProcessing || this.activeProcessingSessionIds.has(sessionId);
  }

  /**
   * Get the history for a session
   */
  public getHistory(sessionId: string): Anthropic.Messages.MessageParam[] {
    // Get the session
    const session = sessionManager.getSession(sessionId);
    return session.state.coreSessionState.contextWindow?.getMessages() || [];
  }
  
  /**
   * Set permission mode for a session
   */
  public setPermissionMode(sessionId: string, mode: PermissionMode): boolean {
    try {
      // Verify the session exists (will throw if not found)
      sessionManager.getSession(sessionId);
      
      const previousMode = this.sessionPermissionModes.get(sessionId) || PermissionMode.NORMAL;
      this.sessionPermissionModes.set(sessionId, mode);
      
      // Emit appropriate events for backward compatibility
      if (mode === PermissionMode.FAST_EDIT && previousMode !== PermissionMode.FAST_EDIT) {
        this.emit(AgentServiceEvent.FAST_EDIT_MODE_ENABLED, { sessionId, enabled: true });
      } else if (mode !== PermissionMode.FAST_EDIT && previousMode === PermissionMode.FAST_EDIT) {
        this.emit(AgentServiceEvent.FAST_EDIT_MODE_DISABLED, { sessionId, enabled: false });
      }
      
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get the permission mode for a session
   */
  public getPermissionMode(sessionId: string): PermissionMode {
    return this.sessionPermissionModes.get(sessionId) || PermissionMode.NORMAL;
  }
  
  /**
   * Toggle fast edit mode for a session (backward compatibility)
   */
  public toggleFastEditMode(sessionId: string, enabled: boolean): boolean {
    const mode = enabled ? PermissionMode.FAST_EDIT : PermissionMode.NORMAL;
    return this.setPermissionMode(sessionId, mode);
  }
  
  /**
   * Get the fast edit mode state for a session (backward compatibility)
   */
  public getFastEditMode(sessionId: string): boolean {
    return this.getPermissionMode(sessionId) === PermissionMode.FAST_EDIT;
  }
  
  /**
   * Get active tools for a session
   */
  public getActiveTools(sessionId: string): ActiveTool[] {
    return this.activeTools.get(sessionId) || [];
  }
  
  /**
   * Get the arguments for a tool execution
   */
  public getToolArgs(sessionId: string, toolId: string): Record<string, unknown> | undefined {
    return this.activeToolArgs.get(`${sessionId}:${toolId}`);
  }
  
  /**
   * Get all tool executions for a session
   */
  public getToolExecutionsForSession(sessionId: string): ToolExecutionState[] {
    return this.toolExecutionManager.getExecutionsForSession(sessionId);
  }
  
  /**
   * Get a specific tool execution
   */
  public getToolExecution(executionId: string): ToolExecutionState | undefined {
    return this.toolExecutionManager.getExecution(executionId);
  }
  
  /**
   * Get the tool execution manager instance
   */
  public getToolExecutionManager(): ToolExecutionManagerImpl {
    return this.toolExecutionManager;
  }
  
  /**
   * Get a preview for a specific tool execution
   */
  public getPreviewForExecution(executionId: string): ToolPreviewState | undefined {
    try {
      return this.previewManager.getPreviewForExecution(executionId);
    } catch (error) {
      serverLogger.error(`Error getting preview for execution ${executionId}:`, error);
      return undefined;
    }
  }
  
  /**
   * Get permission request for a specific tool execution
   */
  public getPermissionRequestForExecution(executionId: string): PermissionRequestState | null {
    const request = this.toolExecutionManager.getPermissionRequestForExecution(executionId);
    return request || null;
  }
  
  /**
   * Set the execution adapter type for a session
   */
  public setExecutionAdapterType(sessionId: string, type: 'local' | 'docker' | 'remote'): boolean {
    try {
      // Verify the session exists (will throw if not found)
      const session = sessionManager.getSession(sessionId);

      // Track it in the AgentService‑local cache that some callers use
      this.sessionExecutionAdapterTypes.set(sessionId, type);

      // Update the top‑level session property so that callers like the REST
      // controller return the correct environment to the front‑end.
      sessionManager.updateSession(sessionId, { executionAdapterType: type });

      // Keep the nested coreSessionState in sync as well.  This is the value
      // consumed by agent‑core utilities and some WebSocket initialisation
      // logic.  Previously this property was only set when the session was
      // first created which meant that if `createExecutionAdapter()` fell back
      // from Docker → Local (or E2B → Local) the two locations could diverge
      // leading to confusing diagnostics like the ones reported (🚩 logs).
      if (session.state && session.state.coreSessionState) {
        session.state.coreSessionState.executionAdapterType = type;
      }

      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get the execution adapter type for a session
   */
  public getExecutionAdapterType(sessionId: string): 'local' | 'docker' | 'remote' | undefined {
    try {
      // First check our map for the most current value
      const typeFromMap = this.sessionExecutionAdapterTypes.get(sessionId);
      console.log('🚩🚩🚩typeFromMap', typeFromMap);
      if (typeFromMap) {
        return typeFromMap;
      }
      
      // Then try to get it from the session
      const session = sessionManager.getSession(sessionId);
      return session.state.coreSessionState.executionAdapterType;
    } catch {
      return undefined;
    }
  }
  
  /**
   * Set the remote sandbox ID for a session
   */
  public setRemoteId(sessionId: string, sandboxId: string): boolean {
    try {
      // Verify the session exists
      sessionManager.getSession(sessionId);
      
      // Store the sandbox ID
      this.sessionRemoteIds.set(sessionId, sandboxId);
      
      // Also update the session state
      const session = sessionManager.getSession(sessionId);
      sessionManager.updateSession(sessionId, {
        state: {
          ...session.state,
          coreSessionState: {
            ...session.state.coreSessionState,
            remoteId: sandboxId
          }
        }
      });
      
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get the remote sandbox ID for a session
   */
  public getRemoteId(sessionId: string): string | undefined {
    try {
      // First check the map
      const sandboxId = this.sessionRemoteIds.get(sessionId);
      if (sandboxId) {
        return sandboxId;
      }
      
      // Then try to get it from the session
      const session = sessionManager.getSession(sessionId);
      return session.state.coreSessionState.remoteId;
    } catch {
      return undefined;
    }
  }
  
  /**
   * List all persisted sessions
   */
  public async listPersistedSessions(): Promise<SessionListEntry[]> {
    try {
      // Get the persistence service
      const persistence = getSessionStatePersistence();
      
      // Get session list entries
      const sessions = await persistence.listSessions();
      
      return sessions;
    } catch (error) {
      serverLogger.error('Failed to list persisted sessions:', error);
      return [];
    }
  }
  
  /**
   * Delete a persisted session
   */
  public async deletePersistedSession(sessionId: string): Promise<boolean> {
    try {
      // Get the persistence service
      const persistence = getSessionStatePersistence();
      
      // Delete the session data
      await persistence.deleteSessionData(sessionId);
      
      // Remove from memory caches
      this.sessionMessages.delete(sessionId);
      this.sessionRepositoryInfo.delete(sessionId);
      
      // Emit event
      this.emit(AgentServiceEvent.SESSION_DELETED, {
        sessionId,
        timestamp: new Date().toISOString()
      });
      
      return true;
    } catch (error) {
      serverLogger.error(`Failed to delete persisted session ${sessionId}:`, error);
      return false;
    }
  }
  
  /**
   * Create an execution adapter for a session with the specified type
   */
  public async createExecutionAdapterForSession(
    sessionId: string, 
    options: { 
      type?: 'local' | 'docker' | 'remote';
      remoteId?: string;
      projectsRoot?: string;
    } = {}
  ): Promise<void> {
    try {
      // Get the current session
      const session = sessionManager.getSession(sessionId);
      
      /*
       * Prepare options for the execution‑adapter factory.
       *
       * If the caller explicitly asked for a concrete adapter type (e.g.
       * `docker`) we disable the built‑in auto‑fallback mechanism so that the
       * server surfaces an error instead of silently downgrading to `local`.
       * This prevents confusing situations where a user selects Docker in the
       * UI but the backend later reports that the session is running locally
       * because Docker was unavailable.
       */
      const adapterOptions: ExecutionAdapterFactoryOptions = {
        type: options.type,
        autoFallback: options.type ? false : true,
        logger: serverLogger,
        sessionId,
      };
      
      // Add E2B-specific options if needed
      if (options.type === 'remote' && options.remoteId) {
        adapterOptions.e2b = {
          sandboxId: options.remoteId,
          projectsRoot: options.projectsRoot
        };
      }

      if (options.type === 'docker') {
        adapterOptions.docker = {
          projectRoot: options.projectsRoot || process.cwd()
        };
      }

      console.log('🚩🚩🚩adapterOptions', JSON.stringify(adapterOptions, null, 2));
      
      // For Docker, check if we need to initialize the container right away
      // This is a performance optimization for the first tool call
      if (options.type === 'docker' || (options.type === undefined && !options.remoteId)) {
        // Only pre-initialize if Docker initialization isn't already in progress
        if (!this.dockerInitializing) {
          this.dockerInitializing = true;
          
          // Start Docker initialization early for a smoother experience
          this.dockerInitializationPromise = new Promise((resolve) => {
            // Use an immediately-invoked async function to avoid async executor
            (async () => {
              try {
                // Use the containerManager directly for faster initialization
                console.log(`Pre-initializing Docker container for session ${sessionId}...`, 'system');
                
                // Create temp adapter and initialize container (returns immediately with background task)
                const res = await createExecutionAdapter({
                  type: 'docker',
                  autoFallback: false,
                  logger: serverLogger,
                  sessionId,
                  docker: {
                    projectRoot: options.projectsRoot || process.cwd()
                  }
                });
                console.log('🚩🚩🚩pre-init adapter', res.adapter);
                
                resolve(res.adapter);
              } catch (error) {
                console.error(`Docker pre-initialization failed: ${(error as Error).message}`, 'system');
                resolve(null);
              }
            })();
          });
        }
      }
      
      // Wait for Docker initialization if it's in progress and we're using Docker
      if (!session.state.coreSessionState.executionAdapter) {
        let adapter: ExecutionAdapter | null;
        let type: 'local' | 'docker' | 'remote';
        if ((options.type === 'docker' || (options.type === undefined && !options.remoteId)) && 
            this.dockerInitializationPromise) {
          console.log('🚩🚩🚩dockerInitializationPromise', this.dockerInitializationPromise);
          adapter = await this.dockerInitializationPromise;
          console.log('🚩🚩🚩adapter', adapter);
          type = 'docker';
        } else {
          const res = await createExecutionAdapter(adapterOptions);
          adapter = res.adapter;
          type = res.type;
          console.log('🚩🚩🚩res', res);
        }

        console.log('🚩🚩🚩adapter-type', type);

        // Store the adapter type in the session
        this.setExecutionAdapterType(sessionId, type);

        if (adapter) {
          session.state.coreSessionState.executionAdapter = adapter;
        }
      }

      if (!session.state.coreSessionState.executionAdapter) {
        console.log('🚩🚩🚩no execution adapter found for session ' + sessionId);
        throw new Error('No execution adapter found for session ' + sessionId);
      }
      
      // Try to restore from checkpoint if available
      try {
        // Check if this session has checkpoints
        const executionId = 'agent-service-restore-from-checkpoint';
        const persistence = getSessionStatePersistence();
        const sessionData = await persistence.getSessionDataWithoutEvents(sessionId);
        
        if (sessionData?.checkpoints?.length) {
          const lastCheckpoint = sessionData.checkpoints.at(-1);
          
          if (lastCheckpoint && 'repositories' in lastCheckpoint && lastCheckpoint.repositories) {
            // Multi-repo checkpoint restoration
            const bundles = await SessionPersistence.loadCheckpointBundles(sessionId, lastCheckpoint.toolExecutionId);
            
            if (bundles.size > 0) {
              serverLogger.info(`Restoring ${bundles.size} repositories for session ${sessionId}`);
              
              // Restore each repository
              for (const [repoName, bundleData] of bundles) {
                const checkpoint = lastCheckpoint as CheckpointInfo;
                const repoInfo = Object.entries(checkpoint.repositories).find(([_, info]) => info.repoName === repoName);
                if (!repoInfo) continue;
                
                const [repoPath, repoData] = repoInfo;
                const { shadowCommit } = repoData;
                
                // Write the bundle to a temporary file using base64 encoding
                const base64 = Buffer.from(bundleData).toString('base64');
                await session.state.coreSessionState.executionAdapter.writeFile(`/tmp/${repoName}_shadow.b64`, base64, 'utf8');
                
                // Decode the base64 file back to binary
                await session.state.coreSessionState.executionAdapter.executeCommand(
                  executionId, 
                  `base64 -d /tmp/${repoName}_shadow.b64 > /tmp/${repoName}_shadow.bundle && rm /tmp/${repoName}_shadow.b64`
                );
                
                // Define the shadow repo directory
                const shadowDir = `${repoPath}/.agent-shadow/${sessionId}`;
                
                // Command to restore the state
                const cmd = `
                  set -e &&
                  rm -rf "${shadowDir}" 2>/dev/null || true &&
                  git clone --bare /tmp/${repoName}_shadow.bundle "${shadowDir}" &&
                  git --git-dir="${shadowDir}" config core.worktree "${repoPath}" &&
                  git --git-dir="${shadowDir}" checkout chkpt/${lastCheckpoint.toolExecutionId} &&
                  git --git-dir="${shadowDir}" checkout-index -a -f &&
                  rm /tmp/${repoName}_shadow.bundle
                `;
                
                // Execute the restore command
                await session.state.coreSessionState.executionAdapter?.executeCommand(executionId, cmd);
                serverLogger.info(`Restored shadow repo for ${repoName} in session ${sessionId} to checkpoint ${lastCheckpoint.toolExecutionId}`);
              }
            }
          }
        }
      } catch (error) {
        // Log the error but continue - we can operate without a shadow repo
        serverLogger.error('Failed to restore shadow repo from checkpoint:', error);
      }
      
      const type = this.getExecutionAdapterType(sessionId);
      console.log('🚩🚩🚩type', type);
      // Update the session object with the execution adapter
      sessionManager.updateSession(sessionId, {
        state: {
          ...session.state,
          coreSessionState: {
            ...session.state.coreSessionState,
            executionAdapter: session.state.coreSessionState.executionAdapter || undefined,
            executionAdapterType: type
          }
        }
      });
      
      serverLogger.info(`Created ${type} execution adapter for session ${sessionId}`);
    } catch (error) {
      serverLogger.error(`Failed to create execution adapter for session ${sessionId}`, error);
      
      // Log detailed error
      if (error instanceof Error) {
        serverLogger.error(`Detailed error creating execution adapter: ${error.message}`, error.stack);
      }
      
      // Fallback to local execution adapter
      serverLogger.warn(`Falling back to local execution for session ${sessionId}`);
      this.setExecutionAdapterType(sessionId, 'local');
    }
  }
}

/**
 * Create and configure the agent service
 */
export function createAgentService(config: AgentServiceConfig): AgentService {
  return new AgentService(config);
}
