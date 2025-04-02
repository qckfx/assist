/**
 * Permission handling controller
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getAgentService } from '../services/AgentService';
import { ValidationError, NotFoundError } from '../utils/errors';
import { 
  permissionRequestQuerySchema, 
  permissionResolutionSchema,
  fastEditModeToggleSchema,
  fastEditModeQuerySchema
} from '../schemas/api';

/**
 * Get pending permission requests for a session
 * @route GET /api/permissions
 */
export async function getPermissionRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionId } = permissionRequestQuerySchema.parse(req.query);
    
    // Get the agent service
    const agentService = getAgentService();
    
    // Get the permission requests
    const requests = agentService.getPermissionRequests(sessionId);
    
    res.status(200).json({
      sessionId,
      permissionRequests: requests,
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
    const { sessionId, executionId, granted } = permissionResolutionSchema.parse(req.body);
    
    // Get the agent service
    const agentService = getAgentService();
    
    // Use the new direct method that takes executionId
    const resolved = agentService.resolvePermissionByExecutionId(executionId, granted);
    
    if (!resolved) {
      throw new NotFoundError(`Execution ${executionId} not found or permission already resolved`);
    }
    
    res.status(200).json({
      sessionId,
      executionId,
      granted,
      resolved: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError('Invalid request data', error.format()));
    } else {
      next(error);
    }
  }
}

/**
 * Toggle fast edit mode for a session
 * @route POST /api/permissions/fast-edit-mode
 */
export async function toggleFastEditMode(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionId, enabled } = fastEditModeToggleSchema.parse(req.body);
    
    // Get the agent service
    const agentService = getAgentService();
    
    // Toggle fast edit mode
    const success = agentService.toggleFastEditMode(sessionId, enabled);
    
    if (!success) {
      throw new NotFoundError(`Session ${sessionId} not found`);
    }
    
    res.status(200).json({
      success: true,
      sessionId,
      fastEditMode: enabled,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError('Invalid request data', error.format()));
    } else {
      next(error);
    }
  }
}

/**
 * Get fast edit mode status for a session
 * @route GET /api/permissions/fast-edit-mode
 */
export async function getFastEditMode(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionId } = fastEditModeQuerySchema.parse(req.query);
    
    // Get the agent service with detailed logging
    console.log('Getting AgentService for getFastEditMode endpoint, sessionId:', sessionId);
    let agentService;
    try {
      agentService = getAgentService();
      console.log('AgentService obtained successfully:', {
        hasAgentService: !!agentService,
        hasGetFastEditMode: typeof agentService.getFastEditMode === 'function'
      });
    } catch (e) {
      console.error('Error getting AgentService:', e);
      throw new Error(`Failed to get AgentService: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    // Get fast edit mode state
    console.log('Calling getFastEditMode with sessionId:', sessionId);
    const enabled = agentService.getFastEditMode(sessionId);
    console.log('getFastEditMode result:', enabled);
    
    res.status(200).json({
      success: true,
      sessionId,
      fastEditMode: enabled,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError('Invalid request data', error.format()));
    } else {
      next(error);
    }
  }
}