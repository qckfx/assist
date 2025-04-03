/**
 * Timeline API controller
 */
import { Request, Response } from 'express';
import { TimelineQuery } from '../schemas/api';
import { TimelineResponse } from '../../types/timeline';
import { ValidationError, NotFoundError, ServerError } from '../utils/errors';
import { TimelineService } from '../services/TimelineService';

/**
 * Get timeline for a session
 */
export const getSessionTimeline = async (req: Request, res: Response): Promise<void> => {
  const { sessionId } = req.params; // Get sessionId from route params
  const { limit, pageToken, types, includeRelated } = req.query as unknown as TimelineQuery;
  
  console.log(`Timeline request received for session ${sessionId}`, {
    params: req.params,
    query: req.query
  });
  
  if (!sessionId) {
    throw new ValidationError('Session ID is required');
  }

  // Get the TimelineService from the app container
  const app = req.app;
  if (!app.locals.container) {
    console.error('Container not initialized in timeline controller. Request app:', {
      hasApp: !!req.app,
      hasLocals: !!req.app?.locals,
      localsKeys: req.app?.locals ? Object.keys(req.app.locals) : []
    });
    // Return a proper JSON error response instead of throwing
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Timeline service unavailable - container not initialized'
      }
    });
    return;
  }
  
  const container = app.locals.container;
  
  // Resolve the TimelineService from the container
  let timelineService: TimelineService | null = null;
  try {
    // Check if container has the get method (it should)
    if (typeof container.get !== 'function') {
      throw new Error('Container does not have a get method');
    }
    
    timelineService = container.get(TimelineService);
    
    if (!timelineService) {
      throw new Error('TimelineService resolved to null');
    }
  } catch (error) {
    console.error('Error getting TimelineService from container:', error);
    // Return a proper JSON error response instead of throwing
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Timeline service unavailable',
        details: error instanceof Error ? error.message : String(error)
      }
    });
    return;
  }
  
  const params = {
    limit: limit || 50,
    pageToken,
    types,
    includeRelated: includeRelated !== undefined ? includeRelated : true
  };
  
  try {
    console.log(`Calling getTimelineItems for session ${sessionId} with params:`, params);
    const timeline: TimelineResponse = await timelineService.getTimelineItems(sessionId, params);
    console.log(`Timeline data received for session ${sessionId}:`, {
      itemCount: timeline.items?.length || 0,
      totalCount: timeline.totalCount
    });
    
    // Return a proper JSON response
    res.json({
      success: true,
      sessionId,
      ...timeline
    });
    console.log(`Sent timeline response for session ${sessionId}`);
  } catch (error) {
    console.error(`Error getting timeline for session ${sessionId}:`, error);
    
    // Handle session not found error specifically
    if (error instanceof Error && error.message.includes('not found')) {
      console.error(`Session with ID ${sessionId} not found`);
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Session with ID ${sessionId} not found`
        }
      });
      return;
    }
    
    // Handle all other errors with a proper JSON response
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Error retrieving timeline data',
        details: error instanceof Error ? error.message : String(error)
      }
    });
  }
};