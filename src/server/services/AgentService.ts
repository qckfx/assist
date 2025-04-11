/**
 * Agent service for API integration
 */
import { EventEmitter } from 'events';
import { Anthropic } from '@anthropic-ai/sdk';
import crypto from 'crypto';
import {
  createAgent,
  createAnthropicProvider,
  createLogger,
  LogLevel,
} from '../../index';
import { Agent } from '../../types/main';
import { 
  ToolPreviewState, 
  PreviewContentType, 
} from '../../types/preview';
import { ToolResultEntry } from '../../types';
import { 
  ToolExecutionState, 
  ToolExecutionStatus,
  ToolExecutionEvent,
  PermissionRequestState
} from '../../types/tool-execution';

import { ExecutionCompletedWithPreviewEventData } from './tool-execution/ToolExecutionManagerImpl';
import { StoredMessage, RepositoryInfo, SessionListEntry } from '../../types/session';
import { StructuredContent, TextContentPart } from '../../types/message';
import { createToolExecutionManager } from './tool-execution'; 
import { ToolExecutionManagerImpl } from './tool-execution/ToolExecutionManagerImpl';
import { createPreviewManager, PreviewManagerImpl } from './PreviewManagerImpl';
import { sessionManager } from './SessionManager';
import { previewService } from './preview/PreviewService';
import { ServerError, AgentBusyError } from '../utils/errors';
import { ExecutionAdapterFactoryOptions, createExecutionAdapter } from '../../utils/ExecutionAdapterFactory';
import { serverLogger } from '../logger';
import { SessionState } from '../../types/model';
import { LogCategory } from '../../types/logger';
import { setSessionAborted, generateExecutionId } from '../../utils/sessionUtils';
import { getSessionStatePersistence } from './sessionPersistenceProvider';
import { ExecutionAdapter } from '../../types/tool';

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
  /** Anthropic API key */
  apiKey: string;
  /** Default model to use */
  defaultModel?: string;
  /** Permission mode */
  permissionMode?: 'auto' | 'interactive';
  /** Tools that are always allowed without permission */
  allowedTools?: string[];
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

interface PermissionEventData {
  permissionId: string;
  sessionId: string;
  toolId: string;
  toolName?: string;
  executionId?: string;
  args?: Record<string, unknown>;
  granted?: boolean;
  timestamp?: string;
  preview?: {
    contentType: string;
    briefContent: string;
    fullContent?: string;
    metadata?: Record<string, unknown>;
  };
}

export class AgentService extends EventEmitter {
  private config: AgentServiceConfig;
  private activeProcessingSessionIds: Set<string> = new Set();
  private sessionFastEditMode: Map<string, boolean> = new Map();
  private activeTools: Map<string, ActiveTool[]> = new Map();
  private sessionExecutionAdapterTypes: Map<string, 'local' | 'docker' | 'e2b'> = new Map();
  private sessionE2BSandboxIds: Map<string, string> = new Map();
  private activeToolArgs = new Map<string, Record<string, unknown>>();
  
  // Add new properties for the managers
  private toolExecutionManager: ToolExecutionManagerImpl;
  private previewManager: PreviewManagerImpl;
  // Store reference to the current agent
  private agent: Agent | null = null;
  
  // Add new properties to store messages and repository info
  private sessionMessages: Map<string, StoredMessage[]> = new Map();
  private sessionRepositoryInfo: Map<string, RepositoryInfo> = new Map();
  
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
      defaultModel: config.defaultModel || 'claude-3-7-sonnet-20250219',
      permissionMode: config.permissionMode || 'interactive',
      allowedTools: config.allowedTools || ['ReadTool', 'GlobTool', 'GrepTool', 'LSTool'],
      cachingEnabled: config.cachingEnabled !== undefined ? config.cachingEnabled : true,
    };
    
    // Initialize the new managers
    this.toolExecutionManager = createToolExecutionManager() as ToolExecutionManagerImpl;
    this.previewManager = createPreviewManager() as PreviewManagerImpl;
    
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
        // Transform the data to match the expected format for AgentService events
        const transformedData = this.transformEventData(
          toolEvent as ToolExecutionEvent, 
          data as ToolExecutionState | { execution: ToolExecutionState; permission: PermissionRequestState }
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
    data: ToolExecutionState | { execution: ToolExecutionState; permission: PermissionRequestState } | ExecutionCompletedWithPreviewEventData
  ): ToolExecutionEventData | PermissionEventData {
    switch (toolEvent) {
      case ToolExecutionEvent.CREATED:
        return this.transformToolCreatedEvent(data as ToolExecutionState);
        
      case ToolExecutionEvent.UPDATED:
        return this.transformToolUpdatedEvent(data as ToolExecutionState);
        
      case ToolExecutionEvent.COMPLETED:
        // Only support new format with execution property
        return this.transformToolCompletedEvent((data as any).execution);
        
      case ToolExecutionEvent.ERROR:
        return this.transformToolErrorEvent(data as ToolExecutionState);
        
      case ToolExecutionEvent.ABORTED:
        return this.transformToolAbortedEvent(data as ToolExecutionState);
        
      case ToolExecutionEvent.PERMISSION_REQUESTED:
        return this.transformPermissionRequestedEvent(data as { execution: ToolExecutionState; permission: PermissionRequestState });
        
      case ToolExecutionEvent.PERMISSION_RESOLVED:
        return this.transformPermissionResolvedEvent(data as { execution: ToolExecutionState; permission: PermissionRequestState });
        
      default:
        // Create a basic structure for unknown event types
        if ('execution' in data) {
          return {
            sessionId: data.execution.sessionId,
            tool: {
              id: data.execution.toolId,
              name: data.execution.toolName,
              executionId: data.execution.id
            },
            timestamp: new Date().toISOString()
          } as ToolExecutionEventData;
        } else {
          return {
            sessionId: data.sessionId,
            tool: {
              id: data.toolId,
              name: data.toolName,
              executionId: data.id
            },
            timestamp: new Date().toISOString()
          } as ToolExecutionEventData;
        }
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
   * Transform tool completed event data
   */
  /**
   * Transform a completed tool execution into event data
   * Previews are now generated by ToolExecutionManager.completeExecution
   */
  private transformToolCompletedEvent(execution: ToolExecutionState): ToolExecutionEventData {
    // Get the preview if it exists - it should have been generated by ToolExecutionManager
    const preview = this.previewManager.getPreviewForExecution(execution.id);
    
    // Also emit a timeline item event for this tool execution completion
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
    
    // Prepare the event data to return
    const eventData = {
      sessionId: execution.sessionId,
      tool: {
        id: execution.toolId,
        name: execution.toolName,
        executionId: execution.id
      },
      result: execution.result,
      paramSummary: execution.summary,
      executionTime: execution.executionTime,
      timestamp: execution.endTime,
      startTime: execution.startTime,
      preview: preview ? this.convertPreviewStateToData(preview) : undefined
    };
    
    return eventData;
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
   * Transform permission requested event data
   */
  private transformPermissionRequestedEvent(data: { execution: ToolExecutionState, permission: PermissionRequestState }): PermissionEventData {
    const { execution, permission } = data;
    
    // Check if a preview exists already
    let preview = this.previewManager.getPreviewForExecution(execution.id);
    
    // If no preview exists, generate a permission preview
    if (!preview) {
      try {
        // Generate a preview specifically for this permission request
        const permissionPreview = previewService.generatePermissionPreview(
          { id: execution.toolId, name: execution.toolName },
          permission.args || {}
        );
        
        // Extract fullContent from permission preview if available
        let fullContent: string | undefined = undefined;
        
        // Permission previews may have a fullContent field with details
        if (permissionPreview.hasFullContent) {
          // Try to safely extract fullContent from any preview with it
          fullContent = (permissionPreview as unknown as { fullContent?: string }).fullContent;
        }
        
        // Create and store the preview
        preview = this.previewManager.createPreview(
          execution.sessionId,
          execution.id,
          permissionPreview.contentType,
          permissionPreview.briefContent,
          fullContent,
          { 
            ...permissionPreview.metadata,
            executionId: execution.id
          }
        );
        
        // Link the preview to the execution
        this.toolExecutionManager.associatePreview(execution.id, preview.id);
      } catch (error) {
        serverLogger.error(`Error generating permission preview for ${execution.id}:`, error);
      }
    }
    
    return {
      permissionId: permission.id,
      sessionId: permission.sessionId,
      toolId: permission.toolId,
      toolName: permission.toolName,
      executionId: execution.id,
      args: permission.args,
      timestamp: permission.requestTime,
      preview: preview ? this.convertPreviewStateToData(preview) : undefined
    };
  }
  
  /**
   * Transform permission resolved event data
   */
  private transformPermissionResolvedEvent(data: { execution: ToolExecutionState, permission: PermissionRequestState }): PermissionEventData {
    const { execution, permission } = data;
    
    // Get the existing preview
    const preview = this.previewManager.getPreviewForExecution(execution.id);
    
    // Update the preview if it exists to include resolution information
    if (preview) {
      // Add the resolution status to the preview metadata
      this.previewManager.updatePreview(preview.id, {
        metadata: {
          ...preview.metadata,
          permissionResolved: true,
          permissionGranted: permission.granted,
          resolvedTime: permission.resolvedTime
        }
      });
    }
    
    return {
      permissionId: permission.id,
      sessionId: permission.sessionId,
      toolId: permission.toolId,
      executionId: execution.id,
      granted: permission.granted,
      timestamp: permission.resolvedTime,
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
  private handleToolExecutionStart(toolId: string, toolUseId: string, args: Record<string, unknown>, sessionId: string): void {
    const tool = this.agent?.toolRegistry.getTool(toolId);
    const toolName = tool?.name || toolId;
    
    // Generate executionId from toolUseId using the same function used for message.toolCalls
    // This ensures the executionId matches what's in message.toolCalls
    const executionId = generateExecutionId(toolUseId);
    
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
    toolId: string, 
    args: Record<string, unknown>, 
    result: unknown, 
    executionTime: number, 
    sessionId: string
  ): void {

    console.log("🟠🟠🟠handleToolExecutionComplete", toolId, args, result, executionTime, sessionId);
    // Find the execution ID for this tool
    const activeTools = this.activeTools.get(sessionId) || [];
    const activeTool = activeTools.find(t => t.toolId === toolId);
    const executionId = activeTool?.executionId;
    
    if (executionId) {
      // Complete the execution in the manager
      this.toolExecutionManager.completeExecution(executionId, result, executionTime);
      
      // Generate a preview for the completed tool
      this.generateToolExecutionPreview(executionId, toolId, args, result);
      
      // Remove from active tools
      const newActiveTools = activeTools.filter(t => t.toolId !== toolId);
      this.activeTools.set(sessionId, newActiveTools);
      
      // Clean up stored arguments
      this.activeToolArgs.delete(`${sessionId}:${toolId}`);
      this.activeToolArgs.delete(`${sessionId}:${executionId}`);
    } else {
      serverLogger.warn(`No execution ID found for completed tool: ${toolId}`);
    }
  }
  
  // When a tool execution fails
  private handleToolExecutionError(
    toolId: string, 
    args: Record<string, unknown>, 
    error: Error, 
    sessionId: string
  ): void {
    // Find the execution ID for this tool
    const activeTools = this.activeTools.get(sessionId) || [];
    const activeTool = activeTools.find(t => t.toolId === toolId);
    const executionId = activeTool?.executionId;
    
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
        
        // Log conversation history size
        const historyLength = sessionState?.conversationHistory?.length || 0;
        serverLogger.debug(
          `Saved agent conversation history for session ${sessionId} (${historyLength} messages)`,
          LogCategory.SESSION
        );
      }
    } catch (error) {
      serverLogger.error(`Failed to save agent session state for session ${sessionId}:`, error);
    }
  }
  
  /**
   * Extract messages from conversation history into storable format
   */
  private extractStorableMessages(
    conversationHistory: Anthropic.Messages.MessageParam[]
  ): StoredMessage[] {
    const messages: StoredMessage[] = [];
    let sequence = 0;
    
    // Generate predictable IDs for messages based on content hash
    const generateMessageId = (role: string, content: string, sequence: number): string => {
      const hash = crypto.createHash('md5').update(`${role}-${content}-${sequence}`).digest('hex');
      return `msg-${hash.substring(0, 8)}`;
    };
    
    // Process each message in the conversation history
    for (const message of conversationHistory) {
      // Skip system messages
      // Using a type assertion to handle 'system' role
      if ((message.role as string) === 'system') continue;
      
            // Create structured content using our imported type
      const structuredContent: StructuredContent = [];
      let toolCalls: StoredMessage['toolCalls'] = undefined;
      
      // Process content blocks if available
      if (Array.isArray(message.content)) {
        // For each content block
        for (const block of message.content) {
          if (typeof block === 'string') {
            // Convert string to text content part
            structuredContent.push({
              type: 'text',
              text: block
            });
          } else if (block.type === 'text') {
            // Add text content part
            structuredContent.push({
              type: 'text',
              text: block.text
            });
          } else if (block.type === 'tool_use') {
            // Handle tool use blocks
            if (!toolCalls) toolCalls = [];
            
            // Generate a deterministic UUID from Anthropic's tool use ID
            // using our shared utility function
            const executionId = generateExecutionId(block.id);
            
            // Add tool call reference with our UUID
            toolCalls.push({
              executionId: executionId,
              toolUseId: block.id, // Also store the original Anthropic ID
              toolName: block.name,
              index: toolCalls.length,
              isBatchedCall: block.name === 'BatchTool'
            });
          }
        }
      } else if (typeof message.content === 'string') {
        // Convert string to text content part
        structuredContent.push({
          type: 'text',
          text: message.content
        });
      }
      
      // Extract plain text for ID generation
      const plainText = structuredContent
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('');
      
      // Create the stored message
      const storedMessage: StoredMessage = {
        id: generateMessageId(message.role, plainText, sequence),
        role: message.role as 'user' | 'assistant',
        timestamp: new Date().toISOString(), // We don't have timestamps in the original messages
        content: structuredContent,
        toolCalls,
        sequence: sequence++
      };
      
      messages.push(storedMessage);
    }
    
    return messages;
  }
  
  /**
   * Enrich messages with tool summary information for quick rendering
   */
  private enrichMessagesWithToolSummaries(
    messages: StoredMessage[],
    toolExecutions: ToolExecutionState[]
  ): StoredMessage[] {
    // Build a map of execution IDs to tool details
    const executionMap = new Map<string, {
      toolName: string;
      status: string;
      args: Record<string, unknown>;
    }>();
    
    // Populate the map
    for (const execution of toolExecutions) {
      executionMap.set(execution.id, {
        toolName: execution.toolName,
        status: execution.status,
        args: execution.args
      });
    }
    
    // Update each message's tool calls with more details
    return messages.map(message => {
      if (!message.toolCalls) {
        return message;
      }
      
      // Update each tool call with additional details
      const updatedToolCalls = message.toolCalls.map(toolCall => {
        const executionDetails = executionMap.get(toolCall.executionId);
        if (!executionDetails) {
          return toolCall;
        }
        
        return {
          ...toolCall,
          toolName: executionDetails.toolName,
          index: toolCall.index,
          isBatchedCall: toolCall.isBatchedCall
        };
      });
      
      return {
        ...message,
        toolCalls: updatedToolCalls
      };
    });
  }
  
  /**
   * Save session messages to persistence
   */
  private async saveSessionMessages(sessionId: string): Promise<void> {
    try {
      // Get session
      const session = sessionManager.getSession(sessionId);
      if (!session.state?.conversationHistory) {
        return;
      }
      
      // Extract storable messages from conversation history
      const messages = this.extractStorableMessages(session.state.conversationHistory);
      
      // Enrich with tool details
      const toolExecutions = this.toolExecutionManager.getExecutionsForSession(sessionId);
      const enrichedMessages = this.enrichMessagesWithToolSummaries(messages, toolExecutions);
      
      // Save messages to memory cache
      this.sessionMessages.set(sessionId, enrichedMessages);
      
      // Get the persistence service
      const persistence = getSessionStatePersistence();
      
      // Save to persistence
      await persistence.persistMessages(sessionId, enrichedMessages);
      
      serverLogger.debug(`Saved ${enrichedMessages.length} messages for session ${sessionId}`);
    } catch (error) {
      serverLogger.error(`Failed to save messages for session ${sessionId}:`, error);
    }
  }
  
  /**
   * Load session messages from persistence
   */
  private async loadSessionMessages(sessionId: string): Promise<void> {
    try {
      // Get the persistence service
      const persistence = getSessionStatePersistence();
      
      // Load messages
      const messages = await persistence.loadMessages(sessionId);
      if (messages.length === 0) {
        return;
      }
      
      // Store in memory cache
      this.sessionMessages.set(sessionId, messages);
      
      // Emit event
      this.emit(AgentServiceEvent.SESSION_LOADED, {
        sessionId,
        timestamp: new Date().toISOString()
      });
      
      serverLogger.debug(`Loaded ${messages.length} messages for session ${sessionId}`);
    } catch (error) {
      serverLogger.error(`Failed to load messages for session ${sessionId}:`, error);
    }
  }
  
  /**
   * Capture Git repository information for a session
   */
  private async captureRepositoryInfo(sessionId: string): Promise<RepositoryInfo | null> {
    try {
      // Get the persistence service
      const persistence = getSessionStatePersistence();
      
      // Capture repo info
      const repoInfo = await persistence.captureRepositoryInfo();
      if (!repoInfo) {
        return null;
      }
      
      // Store in memory cache
      this.sessionRepositoryInfo.set(sessionId, repoInfo);
      
      return repoInfo;
    } catch (error) {
      serverLogger.error(`Failed to capture repository information for session ${sessionId}:`, error);
      return null;
    }
  }
  
  /**
   * Save repository information for a session
   */
  private async saveRepositoryInfo(sessionId: string): Promise<void> {
    try {
      // Get repo info from memory cache
      const repoInfo = this.sessionRepositoryInfo.get(sessionId);
      if (!repoInfo) {
        return;
      }
      
      // Get the persistence service
      const persistence = getSessionStatePersistence();
      
      // Save to persistence
      await persistence.persistRepositoryInfo(sessionId, repoInfo);
      
      serverLogger.debug(`Saved repository information for session ${sessionId}`);
    } catch (error) {
      serverLogger.error(`Failed to save repository information for session ${sessionId}:`, error);
    }
  }
  
  /**
   * Save session metadata
   */
  private async saveSessionMetadata(sessionId: string): Promise<void> {
    try {
      // Get session
      const session = sessionManager.getSession(sessionId);
      
      // Get messages
      const messages = this.sessionMessages.get(sessionId) || [];
      
      // Get repository info
      const repoInfo = this.sessionRepositoryInfo.get(sessionId);
      
      // Get tool executions count
      const toolExecutions = this.toolExecutionManager.getExecutionsForSession(sessionId);
      
      // Find the initial query (first user message)
      const initialMessage = messages.find(msg => msg.role === 'user');
      
      // Get the last message
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
      
      // Build metadata
      const metadata = {
        id: sessionId,
        createdAt: session.createdAt.toISOString(),
        lastActiveAt: session.lastActiveAt.toISOString(),
        messageCount: messages.length,
        toolCount: toolExecutions.length,
        initialQuery: initialMessage ? 
          initialMessage.content
            .filter(part => part.type === 'text')
            .map(part => (part as TextContentPart).text)
            .join('') 
          : undefined,
        lastMessage: lastMessage && {
          role: lastMessage.role,
          // Extract text from structured content for preview
          content: lastMessage.content
            .filter(part => part.type === 'text')
            .map(part => (part as TextContentPart).text)
            .join('')
            .substring(0, 100), // Preview
          timestamp: lastMessage.timestamp
        },
        repositoryInfo: repoInfo
      };
      
      // Get the persistence service
      const persistence = getSessionStatePersistence();
      
      // Save to persistence
      await persistence.persistSessionMetadata(sessionId, metadata);
      
      serverLogger.debug(`Saved metadata for session ${sessionId}`);
    } catch (error) {
      serverLogger.error(`Failed to save metadata for session ${sessionId}:`, error);
    }
  }
  

  /**
   * Process a query for a specific session
   */
  public async processQuery(
    sessionId: string,
    query: string
  ): Promise<{
    response: string;
    toolResults: ToolResultEntry[];
  }> {
    // Get the session
    const session = sessionManager.getSession(sessionId);

    // Check if the session is already processing
    if (session.isProcessing || this.activeProcessingSessionIds.has(sessionId)) {
      throw new AgentBusyError();
    }

    try {
      // Mark the session as processing
      // Note: Abort status will be cleared in AgentRunner.processQuery when a new message is received
      this.activeProcessingSessionIds.add(sessionId);
      sessionManager.updateSession(sessionId, { isProcessing: true });

      // Emit event for processing started
      this.emit(AgentServiceEvent.PROCESSING_STARTED, { sessionId });

      // Create the model provider
      const modelProvider = createAnthropicProvider({
        apiKey: this.config.apiKey,
        model: this.config.defaultModel,
        cachingEnabled: this.config.cachingEnabled,
      });

      // Create a logger for this session
      const logger = createLogger({
        level: LogLevel.INFO,
        formatOptions: {
          showTimestamp: true,
          showPrefix: true,
          colors: true,
        },
      });

      // Get the execution adapter type and sandbox ID for this session
      const executionAdapterType = this.getExecutionAdapterType(sessionId) || 'local';
      const e2bSandboxId = this.getE2BSandboxId(sessionId);
      
      // Create appropriate environment config based on execution type
      let environment;
      
      if (executionAdapterType === 'e2b' && e2bSandboxId) {
        environment = { 
          type: 'e2b' as const, 
          sandboxId: e2bSandboxId 
        };
      } else if (executionAdapterType === 'docker') {
        environment = { type: 'docker' as const };
      } else {
        // Default to local
        environment = { type: 'local' as const };
      }
      
      // Create the agent with permission handling based on configuration
      this.agent = createAgent({
        modelProvider,
        environment,
        logger,
        permissionUIHandler: {
          requestPermission: (toolId: string, args: Record<string, unknown>): Promise<boolean> => {
            // If auto-approve mode is enabled and the tool is in the allowed list
            if (this.config.permissionMode === 'auto' && this.config.allowedTools?.includes(toolId)) {
              return Promise.resolve(true);
            }

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
            
            // Generate a preview for the permission request
            this.generatePermissionPreview(executionId, toolId, args);
            
            // Create a promise to wait for permission resolution
            return new Promise<boolean>(resolve => {
              // Store resolver in a closure that will be called when permission is resolved
              // We're now utilizing toolExecutionManager to track permissions
              // The UI will call resolvePermissionByExecutionId which will trigger resolution
              
              // Create a one-time event listener for permission resolution
              const onPermissionResolved = (data: unknown) => {
                // Type check and cast the data
                const typedData = data as { execution: ToolExecutionState; permission: PermissionRequestState };
                
                // Check if this is our permission request
                if (typedData.permission.id === permission.id) {
                  // Remove the listener to avoid memory leaks
                  const removeListener = this.toolExecutionManager.on(ToolExecutionEvent.PERMISSION_RESOLVED, onPermissionResolved);
                  removeListener();
                  // Resolve with the permission status
                  resolve(typedData.permission.granted || false);
                }
              };
              
              // Add the listener
              this.toolExecutionManager.on(ToolExecutionEvent.PERMISSION_RESOLVED, onPermissionResolved);
            });
          },
        },
      });
      
      // Set Fast Edit Mode on the agent's permission manager based on this session's setting
      const isFastEditModeEnabled = this.getFastEditMode(sessionId);
      this.agent.permissionManager.setFastEditMode(isFastEditModeEnabled);
      
      // Store the execution adapter type in the session
      // Get the actual type from the agent's environment or default to 'local'
      const executionType = this.agent.environment?.type as 'local' | 'docker' | 'e2b' || 'docker';
      this.setExecutionAdapterType(sessionId, executionType);

      // Collect tool results
      const toolResults: ToolResultEntry[] = [];
      
      // Register callbacks for tool execution events using the new API
      const unregisterStart = this.agent.toolRegistry.onToolExecutionStart(
        (toolId: string, toolUseId: string, args: Record<string, unknown>, _context: unknown) => {
          this.handleToolExecutionStart(toolId, toolUseId, args, sessionId);
        }
      );
      
      const unregisterComplete = this.agent.toolRegistry.onToolExecutionComplete(
        (toolId: string, args: Record<string, unknown>, result: unknown, executionTime: number) => {
          this.handleToolExecutionComplete(toolId, args, result, executionTime, sessionId);
        }
      );
      
      const unregisterError = this.agent.toolRegistry.onToolExecutionError(
        (toolId: string, args: Record<string, unknown>, error: Error) => {
          this.handleToolExecutionError(toolId, args, error, sessionId);
        }
      );
      
      try {
        // Ensure the session state includes the sessionId for the new abort system
        session.state.id = sessionId;
        
        // Process the query with our registered callbacks
        const result = await this.agent.processQuery(query, session.state);
  
        if (result.error) {
          throw new ServerError(`Agent error: ${result.error}`);
        }
        
        // Capture any tool results from the response
        if (result.result && result.result.toolResults) {
          toolResults.push(...result.result.toolResults);
        }
        
        // Update the session with the new state, ensuring proper structure for conversationHistory
        const sessionState = result.sessionState;
        
        sessionManager.updateSession(sessionId, {
          state: sessionState,
          isProcessing: false,
        });

        // Process completed successfully
        serverLogger.info(`⚠️ [AgentService] Emitting PROCESSING_COMPLETED for session ${sessionId}`);
        this.emit(AgentServiceEvent.PROCESSING_COMPLETED, {
          sessionId,
          response: result.response,
        });
        serverLogger.info(`⚠️ [AgentService] PROCESSING_COMPLETED emitted for session ${sessionId}`);
        
        // After successful query processing, save the complete session state
        await this.saveSessionState(sessionId, session.state);

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
        // Clean up by unregistering callbacks
        unregisterStart();
        unregisterComplete();
        unregisterError();
        
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
      this.toolExecutionManager.resolvePermissionByExecutionId(executionId, granted);
      return true;
    } catch (error) {
      serverLogger.error(`Error resolving permission for execution: ${executionId}`, error);
      return false;
    }
  }
  
  
  /**
   * Generate a preview for a tool execution
   */
  private generateToolExecutionPreview(
    executionId: string,
    toolId: string,
    args: Record<string, unknown>,
    result: unknown
  ): void {
    try {
      // Get the execution from the manager
      const execution = this.toolExecutionManager.getExecution(executionId);
      if (!execution) {
        serverLogger.warn(`No execution found for preview generation: ${executionId}`);
        return;
      }
      
      // Use the existing previewService to generate the preview
      const toolInfo = {
        id: toolId,
        name: execution.toolName
      };
      
      serverLogger.debug(`Generating preview for tool execution: ${executionId}`, {
        toolId,
        toolName: execution.toolName,
        hasResult: !!result
      });
      
      // Asynchronously generate the preview
      previewService.generatePreview(toolInfo, args, result)
        .then(previewData => {
          if (!previewData) {
            serverLogger.warn(`No preview data generated for execution ${executionId}`);
            return;
          }
          
          serverLogger.debug(`Preview generated for execution ${executionId}:`, {
            contentType: previewData.contentType,
            hasBriefContent: !!previewData.briefContent,
            hasFullContent: previewData.hasFullContent
          });
          
          // Create a preview in the manager
          // For TypeScript compatibility - check if there's full content available
          const fullContent = previewData.hasFullContent 
            ? (previewData as unknown as { fullContent: string }).fullContent
            : undefined;
          
          const preview = this.previewManager.createPreview(
            execution.sessionId,
            executionId,
            previewData.contentType,
            previewData.briefContent,
            fullContent,
            previewData.metadata
          );
          
          serverLogger.debug(`Preview created and stored for execution ${executionId}:`, {
            previewId: preview.id,
            executionId: preview.executionId
          });
          
          // Also update the execution to link to the preview
          this.toolExecutionManager.updateExecution(executionId, { previewId: preview.id });
          serverLogger.debug(`Updated execution ${executionId} with previewId: ${preview.id}`);
        })
        .catch(error => {
          serverLogger.error(`Error generating preview for ${executionId}:`, error);
        });
    } catch (error) {
      serverLogger.error(`Error in generateToolExecutionPreview:`, error);
    }
  }
  
  /**
   * Generate a preview for a permission request
   */
  private generatePermissionPreview(
    executionId: string,
    toolId: string,
    args: Record<string, unknown>
  ): void {
    try {
      // Get the execution and permission from the manager
      const execution = this.toolExecutionManager.getExecution(executionId);
      if (!execution) {
        serverLogger.warn(`No execution found for permission preview: ${executionId}`);
        return;
      }
      
      const permission = this.toolExecutionManager.getPermissionRequestForExecution(executionId);
      if (!permission) {
        serverLogger.warn(`No permission found for execution: ${executionId}`);
        return;
      }
      
      // Use the existing previewService to generate the preview
      const toolInfo = {
        id: toolId,
        name: execution.toolName
      };
      
      serverLogger.debug(`Generating permission preview for execution: ${executionId}`, {
        toolId,
        toolName: execution.toolName,
        permissionId: permission.id
      });
      
      // Generate the permission preview
      const previewData = previewService.generatePermissionPreview(toolInfo, args);
      if (!previewData) {
        serverLogger.warn(`No preview data generated for permission request: ${permission.id}`);
        return;
      }
      
      serverLogger.debug(`Permission preview generated for execution ${executionId}:`, {
        contentType: previewData.contentType,
        hasBriefContent: !!previewData.briefContent,
        hasFullContent: previewData.hasFullContent
      });
      
      // Create a preview in the manager
      // For TypeScript compatibility - check if there's full content available
      const fullContent = previewData.hasFullContent 
        ? (previewData as unknown as { fullContent: string }).fullContent
        : undefined;
        
      const preview = this.previewManager.createPermissionPreview(
        execution.sessionId,
        executionId,
        permission.id,
        previewData.contentType,
        previewData.briefContent,
        fullContent,
        previewData.metadata
      );
      
      serverLogger.debug(`Permission preview created and stored for execution ${executionId}:`, {
        previewId: preview.id,
        executionId: preview.executionId,
        permissionId: permission.id
      });
      
      // Also update the execution to link to the preview
      this.toolExecutionManager.updateExecution(executionId, { previewId: preview.id });
      serverLogger.debug(`Updated execution ${executionId} with permission preview ID: ${preview.id}`);
    } catch (error) {
      serverLogger.error(`Error in generatePermissionPreview:`, error);
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
      // Not processing, nothing to abort
      return false;
    }

    // Create abort timestamp
    const abortTimestamp = Date.now();
    
    // No need to ensure session state exists anymore for aborting
    
    // Use the centralized session abort mechanism
    // This will update the abort registry and emit events
    setSessionAborted(sessionId);

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
    return session.state.conversationHistory || [];
  }
  
  /**
   * Toggle fast edit mode for a session
   */
  public toggleFastEditMode(sessionId: string, enabled: boolean): boolean {
    try {
      // Verify the session exists (will throw if not found)
      sessionManager.getSession(sessionId);
      
      // Update the fast edit mode state
      this.sessionFastEditMode.set(sessionId, enabled);
      
      // Emit the appropriate event
      this.emit(
        enabled ? AgentServiceEvent.FAST_EDIT_MODE_ENABLED : AgentServiceEvent.FAST_EDIT_MODE_DISABLED,
        { sessionId, enabled }
      );
      
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get the fast edit mode state for a session
   */
  public getFastEditMode(sessionId: string): boolean {
    return this.sessionFastEditMode.get(sessionId) || false;
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
  public setExecutionAdapterType(sessionId: string, type: 'local' | 'docker' | 'e2b'): boolean {
    try {
      // Verify the session exists (will throw if not found)
      sessionManager.getSession(sessionId);
      
      // Update the session with the execution adapter type
      this.sessionExecutionAdapterTypes.set(sessionId, type);
      
      // Also update the session object
      sessionManager.updateSession(sessionId, { executionAdapterType: type });
      
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get the execution adapter type for a session
   */
  public getExecutionAdapterType(sessionId: string): 'local' | 'docker' | 'e2b' | undefined {
    try {
      // First check our map for the most current value
      const typeFromMap = this.sessionExecutionAdapterTypes.get(sessionId);
      if (typeFromMap) {
        return typeFromMap;
      }
      
      // Then try to get it from the session
      const session = sessionManager.getSession(sessionId);
      return session.state.executionAdapterType;
    } catch {
      return undefined;
    }
  }
  
  /**
   * Set the E2B sandbox ID for a session
   */
  public setE2BSandboxId(sessionId: string, sandboxId: string): boolean {
    try {
      // Verify the session exists
      sessionManager.getSession(sessionId);
      
      // Store the sandbox ID
      this.sessionE2BSandboxIds.set(sessionId, sandboxId);
      
      // Also update the session state
      const session = sessionManager.getSession(sessionId);
      sessionManager.updateSession(sessionId, {
        state: {
          ...session.state,
          e2bSandboxId: sandboxId
        }
      });
      
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get the E2B sandbox ID for a session
   */
  public getE2BSandboxId(sessionId: string): string | undefined {
    try {
      // First check the map
      const sandboxId = this.sessionE2BSandboxIds.get(sessionId);
      if (sandboxId) {
        return sandboxId;
      }
      
      // Then try to get it from the session
      const session = sessionManager.getSession(sessionId);
      return session.state.e2bSandboxId;
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
  
  
  // Static cache to track Docker initialization status
  private static dockerInitializing = false;
  private static dockerInitializationPromise: Promise<ExecutionAdapter | null> | null = null;

  /**
   * Create an execution adapter for a session with the specified type
   */
  public async createExecutionAdapterForSession(
    sessionId: string, 
    options: { 
      type?: 'local' | 'docker' | 'e2b';
      e2bSandboxId?: string;
    } = {}
  ): Promise<void> {
    try {
      // Get the current session
      const session = sessionManager.getSession(sessionId);
      
      // Prepare options for execution adapter
      const adapterOptions: ExecutionAdapterFactoryOptions = {
        type: options.type,
        autoFallback: true,
        logger: serverLogger,
      };
      
      // Add E2B-specific options if needed
      if (options.type === 'e2b' && options.e2bSandboxId) {
        adapterOptions.e2b = {
          sandboxId: options.e2bSandboxId
        };
      }
      
      // For Docker, check if we need to initialize the container right away
      // This is a performance optimization for the first tool call
      if (options.type === 'docker' || (options.type === undefined && !options.e2bSandboxId)) {
        // Only pre-initialize if Docker initialization isn't already in progress
        if (!AgentService.dockerInitializing) {
          AgentService.dockerInitializing = true;
          
          // Start Docker initialization early for a smoother experience
          AgentService.dockerInitializationPromise = new Promise((resolve) => {
            // Use an immediately-invoked async function to avoid async executor
            (async () => {
              try {
                // Use the containerManager directly for faster initialization
                serverLogger.info(`Pre-initializing Docker container for session ${sessionId}...`, 'system');
                
                // Create temp adapter and initialize container (returns immediately with background task)
                const { adapter: dockerAdapter } = await createExecutionAdapter({
                  type: 'docker',
                  autoFallback: false,
                  logger: serverLogger
                });
                
                // Force container initialization to complete before first tool call
                if ('initializeContainer' in dockerAdapter) {
                  await (dockerAdapter as { initializeContainer: () => Promise<unknown> }).initializeContainer();
                  serverLogger.info('Docker container pre-initialization complete', 'system');
                }
                
                resolve(dockerAdapter as ExecutionAdapter);
              } catch (error) {
                serverLogger.warn(`Docker pre-initialization failed: ${(error as Error).message}`, 'system');
                resolve(null);
              }
            })();
          });
        }
      }
      
      // Wait for Docker initialization if it's in progress and we're using Docker
      let adapter: ExecutionAdapter | null;
      let type: 'local' | 'docker' | 'e2b' | undefined;
      if ((options.type === 'docker' || (options.type === undefined && !options.e2bSandboxId)) && 
          AgentService.dockerInitializationPromise) {
        adapter = await AgentService.dockerInitializationPromise;
        type = 'docker';
      } else {
        const res = await createExecutionAdapter(adapterOptions);
        adapter = res.adapter;
        type = res.type;
      }
      
      // Store the adapter type in the session
      this.setExecutionAdapterType(sessionId, type);
      
      // Update the session object with the execution adapter
      sessionManager.updateSession(sessionId, {
        state: {
          ...session.state,
          executionAdapter: adapter || undefined,
          executionAdapterType: type
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

/**
 * Singleton instance of the agent service
 */
let agentServiceInstance: AgentService | null = null;

/**
 * Get or initialize the agent service
 */
export function getAgentService(): AgentService {
  if (!agentServiceInstance) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ServerError('ANTHROPIC_API_KEY environment variable is required');
    }

    agentServiceInstance = createAgentService({
      apiKey,
      defaultModel: process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219',
      permissionMode: process.env.QCKFX_PERMISSION_MODE as 'auto' | 'interactive' || 'interactive',
      allowedTools: process.env.QCKFX_ALLOWED_TOOLS ? process.env.QCKFX_ALLOWED_TOOLS.split(',') : undefined,
      cachingEnabled: process.env.QCKFX_DISABLE_CACHING ? false : true,
    });
  }

  return agentServiceInstance;
}