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
import { ToolPreviewState } from '../../types/preview';
import { ToolResultEntry } from '../../types';
import { 
  ToolExecutionState, 
  ToolExecutionStatus,
  ToolExecutionEvent,
  PermissionRequestState
} from '../../types/tool-execution';
import { StoredMessage, RepositoryInfo, SessionListEntry } from '../../types/session';
import { StructuredContent, TextContentPart } from '../../types/message';
import { createToolExecutionManager, ToolExecutionManagerImpl } from './ToolExecutionManagerImpl';
import { createPreviewManager, PreviewManagerImpl } from './PreviewManagerImpl';
import { Session, sessionManager } from './SessionManager';
import { previewService } from './preview/PreviewService';
import { ServerError, AgentBusyError } from '../utils/errors';
import { ExecutionAdapterFactoryOptions, createExecutionAdapter } from '../../utils/ExecutionAdapterFactory';
import { serverLogger } from '../logger';
import { setSessionAborted } from '../../utils/sessionUtils';
import { getSessionStatePersistence } from './sessionPersistenceProvider';

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
  SESSION_DELETED = 'session:deleted'
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
 * Permission request data 
 */
export interface PermissionRequest {
  /** Unique ID for this permission request */
  id: string;
  /** Session ID */
  sessionId: string;
  /** Tool ID */
  toolId: string;
  /** Tool arguments */
  args: Record<string, unknown>;
  /** Timestamp when the request was created */
  timestamp: Date;
  /** Resolver function to call when permission is granted or denied */
  resolver: (granted: boolean) => void;
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
  private permissionRequests: Map<string, PermissionRequest> = new Map();
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
    const eventMap: Record<ToolExecutionEvent, AgentServiceEvent> = {
      [ToolExecutionEvent.CREATED]: AgentServiceEvent.TOOL_EXECUTION_STARTED,
      [ToolExecutionEvent.UPDATED]: AgentServiceEvent.TOOL_EXECUTION,
      [ToolExecutionEvent.COMPLETED]: AgentServiceEvent.TOOL_EXECUTION_COMPLETED,
      [ToolExecutionEvent.ERROR]: AgentServiceEvent.TOOL_EXECUTION_ERROR,
      [ToolExecutionEvent.ABORTED]: AgentServiceEvent.TOOL_EXECUTION_ABORTED,
      [ToolExecutionEvent.PERMISSION_REQUESTED]: AgentServiceEvent.PERMISSION_REQUESTED,
      [ToolExecutionEvent.PERMISSION_RESOLVED]: AgentServiceEvent.PERMISSION_RESOLVED
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
    data: ToolExecutionState | { execution: ToolExecutionState; permission: PermissionRequestState }
  ): ToolExecutionEventData | PermissionEventData {
    switch (toolEvent) {
      case ToolExecutionEvent.CREATED:
        return this.transformToolCreatedEvent(data as ToolExecutionState);
        
      case ToolExecutionEvent.UPDATED:
        return this.transformToolUpdatedEvent(data as ToolExecutionState);
        
      case ToolExecutionEvent.COMPLETED:
        return this.transformToolCompletedEvent(data as ToolExecutionState);
        
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
  private transformToolCompletedEvent(execution: ToolExecutionState): ToolExecutionEventData {
    // Get the preview for this execution if available
    const preview = this.previewManager.getPreviewForExecution(execution.id);
    
    return {
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
  }
  
  /**
   * Transform tool error event data
   */
  private transformToolErrorEvent(execution: ToolExecutionState): ToolExecutionEventData {
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
      startTime: execution.startTime
    };
  }
  
  /**
   * Transform tool aborted event data
   */
  private transformToolAbortedEvent(execution: ToolExecutionState): ToolExecutionEventData {
    return {
      sessionId: execution.sessionId,
      tool: {
        id: execution.toolId,
        name: execution.toolName,
        executionId: execution.id
      },
      timestamp: execution.endTime,
      startTime: execution.startTime,
      abortTimestamp: execution.endTime
    };
  }
  
  /**
   * Transform permission requested event data
   */
  private transformPermissionRequestedEvent(data: { execution: ToolExecutionState, permission: PermissionRequestState }): PermissionEventData {
    const { execution, permission } = data;
    
    // Get the preview for this execution if available
    const preview = this.previewManager.getPreviewForExecution(execution.id);
    
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
    
    return {
      permissionId: permission.id,
      sessionId: permission.sessionId,
      toolId: permission.toolId,
      executionId: execution.id,
      granted: permission.granted,
      timestamp: permission.resolvedTime
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
  private handleToolExecutionStart(toolId: string, args: Record<string, unknown>, sessionId: string): void {
    const tool = this.agent?.toolRegistry.getTool(toolId);
    const toolName = tool?.name || toolId;
    
    // Create a new tool execution in the manager
    const execution = this.toolExecutionManager.createExecution(
      sessionId,
      toolId,
      toolName,
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
      this.activeTools.set(
        sessionId, 
        activeTools.filter(t => t.toolId !== toolId)
      );
      
      // Clean up stored arguments
      this.activeToolArgs.delete(`${sessionId}:${toolId}`);
      this.activeToolArgs.delete(`${sessionId}:${executionId}`);
    } else {
      // If we don't have an execution ID, fall back to old behavior
      serverLogger.warn(`No execution ID found for completed tool: ${toolId}`);
      
      // Emit directly instead of through the manager
      this.emit(AgentServiceEvent.TOOL_EXECUTION_COMPLETED, {
        sessionId,
        tool: {
          id: toolId,
          name: this.agent?.toolRegistry.getTool(toolId)?.name || toolId
        },
        result,
        executionTime,
        timestamp: new Date().toISOString()
      });
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
      
      // Emit directly instead of through the manager
      this.emit(AgentServiceEvent.TOOL_EXECUTION_ERROR, {
        sessionId,
        tool: {
          id: toolId,
          name: this.agent?.toolRegistry.getTool(toolId)?.name || toolId
        },
        error: {
          message: error.message,
          stack: error.stack
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Start a session with optional configuration
   */
  public async startSession(config?: { 
    model?: string; 
    executionAdapterType?: 'local' | 'docker' | 'e2b';
    e2bSandboxId?: string;
  }): Promise<Session> {
    // Create a new session
    const session = sessionManager.createSession();
    
    // Ensure session state exists and has the sessionId
    if (!session.state) {
      session.state = { conversationHistory: [] };
    }
    session.state.id = session.id;
    
    // Set execution adapter type if specified
    const adapterType = config?.executionAdapterType || 'docker';
    this.setExecutionAdapterType(session.id, adapterType);
    
    // If using e2b, also store the sandbox ID
    if (adapterType === 'e2b' && config?.e2bSandboxId) {
      this.setE2BSandboxId(session.id, config.e2bSandboxId);
    }
    
    // Start execution adapter creation immediately (fire and forget)
    serverLogger.info(`Starting ${adapterType} execution adapter initialization for session ${session.id}`);
    
    // Fire and forget - don't wait for container initialization
    this.createExecutionAdapterForSession(session.id, {
      type: adapterType,
      e2bSandboxId: config?.e2bSandboxId
    }).then(() => {
      serverLogger.info(`Execution adapter initialization completed for session ${session.id}`);
    }).catch(error => {
      serverLogger.error(`Failed to create execution adapter for session ${session.id}`, error);
    });
    
    // Capture repository information if available
    this.captureRepositoryInfo(session.id)
      .then(repoInfo => {
        if (repoInfo) {
          this.sessionRepositoryInfo.set(session.id, repoInfo);
          serverLogger.debug(`Captured repository information for session ${session.id}`);
        }
      })
      .catch(error => {
        serverLogger.debug(`Unable to capture repository information: ${error.message}`);
      });
    
    // Load any persisted tool state
    try {
      await this.toolExecutionManager.loadSessionData(session.id);
      await this.previewManager.loadSessionData(session.id);
      await this.loadSessionMessages(session.id);
    } catch (error) {
      serverLogger.warn(`Failed to load persisted session state for session ${session.id}:`, error);
    }
    
    // Return the session immediately without waiting for adapter initialization
    return session;
  }
  
  /**
   * Save complete session state including messages, repository info, and tool state
   */
  public async saveSessionState(sessionId: string): Promise<void> {
    try {
      // Save tool executions and previews
      await this.toolExecutionManager.saveSessionData(sessionId);
      await this.previewManager.saveSessionData(sessionId);
      
      // Save message history
      await this.saveSessionMessages(sessionId);
      
      // Save repository information if available
      await this.saveRepositoryInfo(sessionId);
      
      // Save session metadata
      await this.saveSessionMetadata(sessionId);
      
      // Emit event
      this.emit(AgentServiceEvent.SESSION_SAVED, {
        sessionId,
        timestamp: new Date().toISOString()
      });
      
      serverLogger.info(`Saved complete session state for session ${sessionId}`);
    } catch (error) {
      serverLogger.error(`Failed to save session state for session ${sessionId}:`, error);
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
            
            // Add tool call reference
            toolCalls.push({
              executionId: block.id,
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
              // Create a new execution for this permission request
              const tool = this.agent?.toolRegistry.getTool(toolId);
              const toolName = tool?.name || toolId;
              const execution = this.toolExecutionManager.createExecution(
                sessionId,
                toolId,
                toolName,
                args
              );
              executionId = execution.id;
              
              // Add to active tools
              const paramSummary = this.summarizeToolParameters(toolId, args);
              this.toolExecutionManager.updateExecution(executionId, { summary: paramSummary });
              
              if (!this.activeTools.has(sessionId)) {
                this.activeTools.set(sessionId, []);
              }
              
              this.activeTools.get(sessionId)?.push({
                toolId,
                executionId,
                name: toolName,
                startTime: new Date(execution.startTime),
                paramSummary
              });
            }
            
            // Create the permission request in the manager
            const permission = this.toolExecutionManager.requestPermission(executionId, args);
            
            // Generate a preview for the permission request
            this.generatePermissionPreview(executionId, toolId, args);
            
            // Create a promise to wait for permission resolution
            return new Promise<boolean>(resolve => {
              const permissionId = permission.id;
              
              // Store the permission request with the resolver
              const permissionRequest: PermissionRequest = {
                id: permissionId,
                sessionId,
                toolId,
                args,
                timestamp: new Date(permission.requestTime),
                resolver: resolve
              };
              
              this.permissionRequests.set(permissionId, permissionRequest);
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
        (toolId: string, args: Record<string, unknown>, _context: unknown) => {
          this.handleToolExecutionStart(toolId, args, sessionId);
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
        const sessionState = result.sessionState || {};
        const conversationHistory = Array.isArray(sessionState.conversationHistory) 
          ? sessionState.conversationHistory 
          : [];
        
        sessionManager.updateSession(sessionId, {
          state: { 
            conversationHistory,
            ...sessionState
          },
          isProcessing: false,
        });

        // Process completed successfully
        this.emit(AgentServiceEvent.PROCESSING_COMPLETED, {
          sessionId,
          response: result.response,
        });
        
        // After successful query processing, save the complete session state
        await this.saveSessionState(sessionId);

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
   * This is the new recommended approach that directly uses the execution ID
   * instead of requiring a separate permission ID lookup.
   */
  public resolvePermissionByExecutionId(executionId: string, granted: boolean): boolean {
    try {
      // Directly use the new ToolExecutionManager method for simplicity
      this.toolExecutionManager.resolvePermissionByExecutionId(executionId, granted);
      
      // Get the permission request to handle legacy code
      const permissionRequest = this.toolExecutionManager.getPermissionRequestForExecution(executionId);
      if (permissionRequest) {
        // Look up the request in the legacy map as well (backward compatibility)
        const legacyRequest = this.permissionRequests.get(permissionRequest.id);
        if (legacyRequest) {
          // Remove the request from the map
          this.permissionRequests.delete(permissionRequest.id);
          
          // Call the resolver function
          legacyRequest.resolver(granted);
        }
      }
      
      return true;
    } catch (error) {
      serverLogger.error(`Error resolving permission for execution: ${executionId}`, error);
      return false;
    }
  }
  
  /**
   * Resolve a permission request (legacy method using permission ID)
   * @deprecated Use resolvePermissionByExecutionId instead
   */
  public resolvePermission(permissionId: string, granted: boolean): boolean {
    const request = this.permissionRequests.get(permissionId);
    if (!request) {
      return false;
    }
    
    // Remove the request from the map
    this.permissionRequests.delete(permissionId);
    
    // Call the resolver
    request.resolver(granted);
    
    // Resolve the permission in the manager
    try {
      // Find the execution ID for this permission
      const sessionId = request.sessionId;
      const toolId = request.toolId;
      const activeTools = this.activeTools.get(sessionId) || [];
      const activeTool = activeTools.find(t => t.toolId === toolId);
      const executionId = activeTool?.executionId;
      
      if (executionId) {
        // Resolve in the manager (will emit appropriate events)
        const permissionRequests = this.toolExecutionManager
          .getExecutionsForSession(sessionId)
          .filter(e => e.status === ToolExecutionStatus.AWAITING_PERMISSION)
          .map(e => this.toolExecutionManager.getPermissionRequestForExecution(e.id))
          .filter(Boolean);
        
        const matchingRequest = permissionRequests.find(p => p?.id === permissionId);
        
        if (matchingRequest) {
          this.toolExecutionManager.resolvePermission(permissionId, granted);
          return true;
        }
      }
      
      // If we can't find the permission in the manager, fall back to old behavior
      serverLogger.warn(`No execution found for permission: ${permissionId}`);
      
      // Emit directly instead of through the manager
      this.emit(AgentServiceEvent.PERMISSION_RESOLVED, {
        permissionId,
        sessionId: request.sessionId,
        toolId: request.toolId,
        granted,
        timestamp: new Date().toISOString()
      });
      
      return true;
    } catch (error) {
      serverLogger.error(`Error resolving permission: ${permissionId}`, error);
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
    
    for (const [id, request] of this.permissionRequests.entries()) {
      if (request.sessionId === sessionId) {
        requests.push({
          permissionId: id,
          toolId: request.toolId,
          args: request.args,
          timestamp: request.timestamp.toISOString(),
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
          this.emit(AgentServiceEvent.TOOL_EXECUTION_ABORTED, {
            sessionId,
            tool: {
              id: tool.toolId,
              name: tool.name,
              executionId: tool.executionId
            },
            timestamp: new Date().toISOString(),
            abortTimestamp
          });
        }
      } else {
        // Emit the old-style event if we don't have an execution ID
        this.emit(AgentServiceEvent.TOOL_EXECUTION_ABORTED, {
          sessionId,
          tool: {
            id: tool.toolId,
            name: tool.name,
          },
          timestamp: new Date().toISOString(),
          abortTimestamp
        });
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
  private static dockerInitializationPromise: Promise<boolean> | null = null;

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
                
                resolve(true);
              } catch (error) {
                serverLogger.warn(`Docker pre-initialization failed: ${(error as Error).message}`, 'system');
                resolve(false);
              }
            })();
          });
        }
      }
      
      // Wait for Docker initialization if it's in progress and we're using Docker
      if ((options.type === 'docker' || (options.type === undefined && !options.e2bSandboxId)) && 
          AgentService.dockerInitializationPromise) {
        await AgentService.dockerInitializationPromise;
      }
      
      // Create the execution adapter
      const { adapter, type } = await createExecutionAdapter(adapterOptions);
      
      // Store the adapter type in the session
      this.setExecutionAdapterType(sessionId, type);
      
      // Update the session object with the execution adapter
      sessionManager.updateSession(sessionId, {
        state: {
          ...session.state,
          executionAdapter: adapter,
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