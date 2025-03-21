/**
 * API controller functions
 */
import { Request, Response, NextFunction } from 'express';
import { sessionManager } from '../services/SessionManager';
import {
  StartSessionRequest,
  QueryRequest,
  AbortRequest,
  HistoryRequest,
  StatusRequest,
} from '../schemas/api';
import { ValidationError, ServerError } from '../utils/errors';

/**
 * Start a new agent session
 * @route POST /api/start
 */
export async function startSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as StartSessionRequest;
    
    // Create a new session
    const session = sessionManager.createSession();
    
    // Return the session info
    res.status(201).json({
      sessionId: session.id,
      createdAt: session.createdAt.toISOString(),
      lastActiveAt: session.lastActiveAt.toISOString(),
      isProcessing: session.isProcessing,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Submit a query to the agent
 * This is just a stub - will be implemented in the next commit
 * @route POST /api/query
 */
export async function submitQuery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionId, query } = req.body as QueryRequest;
    
    // Get the session
    const session = sessionManager.getSession(sessionId);
    
    // Update the session to mark it as processing
    sessionManager.updateSession(sessionId, { isProcessing: true });
    
    // For now, just return a mock response
    res.status(202).json({
      accepted: true,
      sessionId,
      message: 'Query accepted for processing',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Abort current operation
 * This is just a stub - will be implemented in the next commit
 * @route POST /api/abort
 */
export async function abortOperation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionId } = req.body as AbortRequest;
    
    // Get the session
    const session = sessionManager.getSession(sessionId);
    
    // Just update the session to mark it as not processing
    sessionManager.updateSession(sessionId, { isProcessing: false });
    
    res.status(200).json({
      success: true,
      sessionId,
      message: 'Operation aborted',
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
    
    // Get the session
    const session = sessionManager.getSession(sessionId);
    
    res.status(200).json({
      sessionId,
      history: session.state.conversationHistory,
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
    
    res.status(200).json({
      sessionId,
      isProcessing: session.isProcessing,
      lastActiveAt: session.lastActiveAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
}