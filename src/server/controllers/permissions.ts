/**
 * Permission handling controller
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AgentServiceRegistry } from '../services/AgentServiceRegistry';
import { container } from '../container';
import { ValidationError, NotFoundError } from '../utils/errors';
import { 
  permissionRequestQuerySchema, 
  permissionResolutionSchema,
  fastEditModeToggleSchema,
  fastEditModeQuerySchema
} from '../schemas/api';
import { PermissionMode } from '../../types/platform-types';

/**
 * Get pending permission requests for a session
 * @route GET /api/permissions
 */
export async function getPermissionRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionId } = permissionRequestQuerySchema.parse(req.query);
    
    // Get the agent service registry
    const agentServiceRegistry = container.get(AgentServiceRegistry);
    // Get the agent service for this session
    const agentService = agentServiceRegistry.getServiceForSession(sessionId);
    
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
    
    // Get the agent service registry
    const agentServiceRegistry = container.get(AgentServiceRegistry);
    // Get the agent service for this session
    const agentService = agentServiceRegistry.getServiceForSession(sessionId);
    
    // Use the new direct method that takes executionId
    const resolved = agentService.resolvePermissionByExecutionId(executionId, granted);
    
    if (!resolved) {
      throw new NotFoundError(`Execution ${executionId} not found or permission already resolved`);
    }
    
    // Log success
    
    res.status(200).json({
      success: true,
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
    
    // Get the agent service registry
    const agentServiceRegistry = container.get(AgentServiceRegistry);
    // Get the agent service for this session
    const agentService = agentServiceRegistry.getServiceForSession(sessionId);
    
    // Set permission mode using the new unified system
    const mode = enabled ? PermissionMode.FAST_EDIT : PermissionMode.NORMAL;
    const success = agentService.setPermissionMode(sessionId, mode);
    
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
    
    // Get the agent service registry
    const agentServiceRegistry = container.get(AgentServiceRegistry);
    // Get the agent service for this session
    const agentService = agentServiceRegistry.getServiceForSession(sessionId);
    
    // Get fast edit mode state
    const enabled = agentService.getFastEditMode(sessionId);
    
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