/**
 * API controller functions
 */
import { Request, Response, NextFunction } from 'express';
import { Session, sessionManager } from '../services/SessionManager';
import { AgentServiceRegistry } from '../container';
import { serverLogger } from '../logger';
import { LogCategory } from '../../utils/logger';
import crypto from 'crypto';
import {
  StartSessionRequest,
  QueryRequest,
  AbortRequest,
  HistoryRequest,
  StatusRequest,
  SessionValidationRequest,
} from '../schemas/api';
import { getSessionStatePersistence } from '../services/SessionStatePersistence';
import { TimelineService } from '../container';
import { AgentServiceConfig } from '../services/AgentService';
import { createContextWindow } from '../../types/contextWindow';

/**
 * Start a new agent session or reconnect to an existing one
 * @route POST /api/start
 */
export async function startSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as StartSessionRequest;
    let session: Session;
    
    // Get the agent service registry from the container
    const appInstance = req.app;
    const containerInstance = appInstance.locals.container;
    const agentServiceRegistry = containerInstance.get(AgentServiceRegistry);
    
    // Check if sessionId is provided for reconnection
    if (body.sessionId) {
      // First try to get the session from memory
      try {
        session = sessionManager.getSession(body.sessionId);
        serverLogger.info(`Reconnected to existing in-memory session ${body.sessionId}`, LogCategory.SESSION);
      } catch {
        // Session not found in memory, try to load from persistence
        const sessionStatePersistence = getSessionStatePersistence();
        const savedSession = await sessionStatePersistence.loadSession(body.sessionId);
        
        if (!savedSession) {
          serverLogger.warn(`Session ${body.sessionId} not found in memory or persistence`);
          res.status(404).json({
            success: false,
            message: `Session ${body.sessionId} not found`
          });
          return;
        }
        
        // Get default agent service config
        const defaultAgentServiceConfig: AgentServiceConfig = {
          defaultModel: process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219',
          permissionMode: process.env.QCKFX_PERMISSION_MODE as 'auto' | 'interactive' || 'interactive',
          allowedTools: ['ReadTool', 'GlobTool', 'GrepTool', 'LSTool'],
          cachingEnabled: process.env.QCKFX_DISABLE_CACHING ? false : true,
        };
        
        // Use saved agent service config if available or use defaults
        const agentServiceConfig = savedSession.sessionState?.agentServiceConfig || defaultAgentServiceConfig;
        
        // Create a state object that includes the agentServiceConfig
        const state = savedSession.sessionState || { 
          contextWindow: createContextWindow(),
        };
        
        // Convert SavedSessionData to Session
        session = {
          id: savedSession.id,
          createdAt: new Date(savedSession.createdAt),
          lastActiveAt: new Date(savedSession.updatedAt),
          state: state,
          isProcessing: false,
          executionAdapterType: savedSession.sessionState?.executionAdapterType as 'local' | 'docker' | 'e2b' || 'docker',
          e2bSandboxId: savedSession.sessionState?.e2bSandboxId,
          agentServiceConfig: agentServiceConfig
        };
        
        // Add the loaded session to the session manager
        session = sessionManager.addSession(session);
        serverLogger.info(`Restored persisted session ${body.sessionId}`, LogCategory.SESSION);
      }
    } else {
      // Extract environment settings from request if provided
      const executionAdapterType = body?.config?.executionAdapterType || 'docker';
      const e2bSandboxId = body?.config?.e2bSandboxId;
      
      // Create a new session with provided environment settings
      session = sessionManager.createSession({
        executionAdapterType,
        e2bSandboxId
      });
      serverLogger.info(`Created new session ${session.id}`, LogCategory.SESSION);
    }
    
    // Initialize an agent service for this session (lazy loading)
    const agentService = agentServiceRegistry.getServiceForSession(session.id);
    
    // Initialize the execution environment for this session
    await agentService.createExecutionAdapterForSession(session.id, {
      type: session.executionAdapterType,
      e2bSandboxId: session.e2bSandboxId
    });
    
    // Return the session info with environment details
    res.status(201).json({
      sessionId: session.id,
      createdAt: session.createdAt.toISOString(),
      lastActiveAt: session.lastActiveAt.toISOString(),
      isProcessing: session.isProcessing,
      executionAdapterType: session.executionAdapterType,
      e2bSandboxId: session.e2bSandboxId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Submit a query to the agent
 * @route POST /api/query
 */
export async function submitQuery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionId, query } = req.body as QueryRequest;
    
    // Get the agent service registry from the container
    const appInstance = req.app;
    const containerInstance = appInstance.locals.container;
    const agentServiceRegistry = containerInstance.get(AgentServiceRegistry);
    
    // Get the specific agent service for this session
    const agentService = agentServiceRegistry.getServiceForSession(sessionId);
    
    // Get the timeline service from the app container
    const appForTimeline = req.app;
    const containerForTimeline = appForTimeline.locals.container;
    
    // Use the imported TimelineService as the token for container.get
    let timelineService;
    try {
      if (containerForTimeline) {
        timelineService = containerForTimeline.get(TimelineService);
      }
    } catch (err) {
      serverLogger.error('Error getting TimelineService from container:', err);
    }
    
    if (!timelineService) {
      serverLogger.warn('Timeline service not available in container for recording user message');
    }
    
    // Start processing the query - this is asynchronous
    // We'll respond immediately and let the client poll for updates
    try {
      // Generate a message ID that will be used for the timeline message
      const userMessageId = crypto.randomUUID();
      
      // Create a user message object for the timeline only (won't affect agent processing)
      const userMessage = {
        id: userMessageId,
        role: 'user',
        timestamp: new Date().toISOString(),
        content: [{ type: 'text', text: query }],
        confirmationStatus: 'confirmed' // Mark as confirmed since it's server-generated
      };
      
      // IMPORTANT: The AgentRunner now handles the contextWindow updates
      // so we need to ensure we don't create a race condition with the timeline
      
      // Start agent processing in the background 
      // AgentRunner will add the user message to contextWindow itself
      serverLogger.info(`Starting agent processing for session ${sessionId}`);
      agentService.processQuery(sessionId, query)
        .catch((error: unknown) => {
          serverLogger.error('Error processing query:', error, LogCategory.AGENT);
        });
      
      // Add the user message to the timeline AFTER starting agent processing
      // But do it in a separate "thread" to avoid blocking the response
      if (timelineService) {
        // Use setTimeout to ensure this runs after the response and doesn't block
        setTimeout(async () => {
          try {
            await timelineService.addMessageToTimeline(sessionId, userMessage);
            serverLogger.info(`User message directly saved to timeline for session ${sessionId}`);
          } catch (err) {
            serverLogger.error('Error recording user message in timeline:', err);
          }
        }, 100); // Small delay to ensure agent processing starts first
      }
      
      // Return accepted response immediately
      res.status(202).json({
        accepted: true,
        sessionId,
        message: 'Query accepted for processing',
      });
    } catch (error) {
      // If there's an immediate error (like the agent is busy),
      // we'll catch it here and return an error response
      next(error);
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Abort current operation
 * @route POST /api/abort
 */
export async function abortOperation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    console.log('🔴🔴🔴 AbortOperation', req.body);
    const { sessionId } = req.body as AbortRequest;
    
    // Get the agent service registry from the container
    const appInstance = req.app;
    const containerInstance = appInstance.locals.container;
    const agentServiceRegistry = containerInstance.get(AgentServiceRegistry);
    
    // Get the specific agent service for this session
    const agentService = agentServiceRegistry.getServiceForSession(sessionId);
    
    // Abort the operation
    const aborted = agentService.abortOperation(sessionId);
    
    res.status(200).json({
      success: aborted,
      sessionId,
      message: aborted ? 'Operation aborted' : 'No operation to abort',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get conversation history
 * @route GET /api/history
 */
export async function getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionId } = req.query as unknown as HistoryRequest;
    
    // Get the agent service registry from the container
    const appInstance = req.app;
    const containerInstance = appInstance.locals.container;
    const agentServiceRegistry = containerInstance.get(AgentServiceRegistry);
    
    // Get the specific agent service for this session
    const agentService = agentServiceRegistry.getServiceForSession(sessionId);
    
    // Get the conversation history
    const history = agentService.getHistory(sessionId);
    
    res.status(200).json({
      sessionId,
      history,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get current agent status
 * @route GET /api/status
 */
export async function getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionId } = req.query as unknown as StatusRequest;
    
    // Get the session
    const session = sessionManager.getSession(sessionId);
    
    // Get the agent service registry from the container
    const appInstance = req.app;
    const containerInstance = appInstance.locals.container;
    const agentServiceRegistry = containerInstance.get(AgentServiceRegistry);
    
    // Get the specific agent service for this session
    const agentService = agentServiceRegistry.getServiceForSession(sessionId);
    
    // Check if the session is processing
    const isProcessing = agentService.isProcessing(sessionId);
    
    // Get any pending permission requests
    const permissionRequests = agentService.getPermissionRequests(sessionId);
    
    res.status(200).json({
      sessionId,
      isProcessing,
      lastActiveAt: session.lastActiveAt.toISOString(),
      pendingPermissionRequests: permissionRequests.length > 0 ? permissionRequests : undefined,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Save session state
 * @route POST /api/sessions/:sessionId/state/save
 */
export async function saveSessionState(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionId } = req.params;
    
    // Get the agent service registry from the container
    const appInstance = req.app;
    const containerInstance = appInstance.locals.container;
    const agentServiceRegistry = containerInstance.get(AgentServiceRegistry);
    
    // Get the specific agent service for this session
    const agentService = agentServiceRegistry.getServiceForSession(sessionId);
    
    // Verify the session exists
    try {
      sessionManager.getSession(sessionId);
    } catch {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }
    
    await agentService.saveSessionState(sessionId);
    res.status(200).json({ success: true, message: 'Session state saved successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * List persisted sessions
 * @route GET /api/sessions/persisted
 */
export async function listPersistedSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Get the agent service registry from the container
    const appInstance = req.app;
    const containerInstance = appInstance.locals.container;
    const agentServiceRegistry = containerInstance.get(AgentServiceRegistry);
    
    // For operations that don't require a specific session, use the first available
    // In a multi-tenant environment, this might need refinement
    const sessionIds = sessionManager.getAllSessionIds();
    const sessionId = sessionIds.length > 0 ? sessionIds[0] : sessionManager.createSession().id;
    const agentService = agentServiceRegistry.getServiceForSession(sessionId);
    
    const sessions = await agentService.listPersistedSessions();
    res.status(200).json({ sessions });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a persisted session
 * @route DELETE /api/sessions/persisted/:sessionId
 */
export async function deletePersistedSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionId } = req.params;
    
    // Get the agent service registry from the container
    const appInstance = req.app;
    const containerInstance = appInstance.locals.container;
    const agentServiceRegistry = containerInstance.get(AgentServiceRegistry);
    
    // For operations that don't require a specific session, use the first available
    // In a multi-tenant environment, this might need refinement
    const sessionIds = sessionManager.getAllSessionIds();
    const currentSessionId = sessionIds.length > 0 ? sessionIds[0] : sessionManager.createSession().id;
    const agentService = agentServiceRegistry.getServiceForSession(currentSessionId);
    
    const success = await agentService.deletePersistedSession(sessionId);
    
    res.status(200).json({
      success,
      message: success ? 'Session deleted successfully' : 'Failed to delete session',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Validate multiple session IDs efficiently
 * @route POST /api/sessions/validate
 */

/**
 * Validate multiple session IDs efficiently
 * @route POST /api/sessions/validate
 */
export async function validateSessionIds(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionIds } = req.body as SessionValidationRequest;
    const validSessionIds: string[] = [];
    
    // Get session state persistence
    const sessionStatePersistence = getSessionStatePersistence();
    
    // Log session validation with the SESSION category to make it easy to filter
    serverLogger.debug(`Validating ${sessionIds.length} session IDs`, LogCategory.SESSION);
    
    // First check in-memory sessions (these are always valid)
    for (const sessionId of sessionIds) {
      // Try to get the session from memory first (fast)
      try {
        sessionManager.getSession(sessionId);
        // If we get here, the session exists in memory
        validSessionIds.push(sessionId);
        serverLogger.debug(`Session ${sessionId} found in memory, marking as valid`, LogCategory.SESSION);
        continue; // Skip persistence check for this session
      } catch {
        // Session not in memory, will check persistence below
        serverLogger.debug(`Session ${sessionId} not found in memory, checking persistence`, LogCategory.SESSION);
      }
      
      // If not in memory, check persistence
      const metadataExists = await sessionStatePersistence.sessionMetadataExists(sessionId);
      if (metadataExists) {
        validSessionIds.push(sessionId);
        serverLogger.debug(`Session ${sessionId} found in persistence, marking as valid`, LogCategory.SESSION);
      }
    }
    
    serverLogger.debug(`Found ${validSessionIds.length} valid session IDs`, LogCategory.SESSION);
    res.status(200).json({ validSessionIds });
  } catch (error) {
    next(error);
  }
}

/**
 * Toggle Fast Edit Mode for a session
 * @route POST /api/fast-edit-mode
 */
export async function toggleFastEditMode(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionId, enabled } = req.body;
    
    // Get the agent service registry from the container
    const appInstance = req.app;
    const containerInstance = appInstance.locals.container;
    const agentServiceRegistry = containerInstance.get(AgentServiceRegistry);
    
    // Get the specific agent service for this session
    const agentService = agentServiceRegistry.getServiceForSession(sessionId);
    
    // Validate that session exists
    try {
      sessionManager.getSession(sessionId);
    } catch {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }
    
    // Toggle fast edit mode
    const success = agentService.toggleFastEditMode(sessionId, enabled);
    
    res.status(200).json({
      success,
      sessionId,
      fastEditMode: enabled
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get Fast Edit Mode status for a session
 * @route GET /api/fast-edit-mode
 */
export async function getFastEditMode(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionId } = req.query;
    
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ success: false, message: 'Session ID is required' });
      return;
    }
    
    // Get the agent service registry from the container
    const appInstance = req.app;
    const containerInstance = appInstance.locals.container;
    const agentServiceRegistry = containerInstance.get(AgentServiceRegistry);
    
    // Get the specific agent service for this session
    const agentService = agentServiceRegistry.getServiceForSession(sessionId);
    
    // Validate that session exists
    try {
      sessionManager.getSession(sessionId);
    } catch {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }
    
    // Get fast edit mode status
    const fastEditMode = agentService.getFastEditMode(sessionId);
    
    res.status(200).json({
      success: true,
      sessionId,
      fastEditMode
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Resolve a permission request
 * @route POST /api/permissions/resolve
 */
export async function resolvePermission(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Destructure request body with renamed fields to match expected inputs
    const { sessionId, executionId, granted } = req.body;
    
    // Validate all required fields are provided
    if (!sessionId || !executionId || granted === undefined) {
      res.status(400).json({ 
        success: false,
        message: 'Missing required fields: sessionId, executionId, and granted'
      });
      return;
    }
    
    // Get the agent service registry from the container
    const appInstance = req.app;
    const containerInstance = appInstance.locals.container;
    const agentServiceRegistry = containerInstance.get(AgentServiceRegistry);
    
    // Get the specific agent service for this session
    const agentService = agentServiceRegistry.getServiceForSession(sessionId);
    
    // Attempt to resolve permission
    try {
      serverLogger.debug(`Resolving permission for execution ID: ${executionId}`, LogCategory.PERMISSIONS);
      
      // Use resolvePermissionByExecutionId method with execution ID
      const resolved = agentService.resolvePermissionByExecutionId(executionId, granted);
      
      // Return success response
      res.status(200).json({
        success: true,
        resolved,
        message: `Permission ${granted ? 'granted' : 'denied'}`
      });
    } catch (error) {
      // Log error and return failure response
      serverLogger.error(`Failed to resolve permission: ${(error as Error).message}`, error);
      res.status(400).json({
        success: false,
        message: `Failed to resolve permission: ${(error as Error).message}`
      });
    }
  } catch (error) {
    next(error);
  }
}