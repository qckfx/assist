/**
 * API request/response schemas
 */
import { z } from 'zod';
import { TimelineItemType } from '../../types/timeline';
import { PermissionMode } from '../../types/platform-types';

/**
 * Schema for session start request
 */
export const startSessionSchema = z.object({
  // Optional session ID to reconnect to a persistent session
  sessionId: z.string().uuid().optional(),
  // Optional schema for any config params
  config: z
    .object({
      model: z.string().optional(),
      // Add execution environment configuration
      executionAdapterType: z.enum(['local', 'docker', 'remote']).optional(),
      remoteId: z.string().optional(), // Only needed when executionAdapterType is 'remote'
      projectsRoot: z.string().optional(), // Root directory containing multiple git repos
    })
    .optional(),
  // Optional agent configuration (mirrors .qckfx/agents/<agent>.json)
  // We accept arbitrary JSON and will validate specific fields later as needed.
  agentConfig: z.record(z.any()).optional(),
});

/**
 * Schema for query request
 */
export const querySchema = z.object({
  sessionId: z.string().uuid(),
  query: z.string().min(1),
  model: z.string().min(1).optional(),
  // Allow passing agentConfig on query as well (optional)
  agentConfig: z.record(z.any()).optional(),
  // Optional permission mode for controlling agent behavior
  permissionMode: z.nativeEnum(PermissionMode).optional(),
});

/**
 * Schema for abort request
 */
export const abortSchema = z.object({
  sessionId: z.string().uuid(),
});

/**
 * Schema for history request
 */
export const historySchema = z.object({
  sessionId: z.string().uuid(),
});

/**
 * Schema for status request
 */
export const statusSchema = z.object({
  sessionId: z.string().uuid(),
});

/**
 * Schema for session response
 */
export const sessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  createdAt: z.string().datetime(),
  lastActiveAt: z.string().datetime(),
  isProcessing: z.boolean(),
});

/**
 * Schema for status response
 */
export const statusResponseSchema = z.object({
  sessionId: z.string().uuid(),
  isProcessing: z.boolean(),
  lastActiveAt: z.string().datetime(),
});

/**
 * Schema for history response
 */
export const historyResponseSchema = z.object({
  sessionId: z.string().uuid(),
  history: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.array(
        z.object({
          type: z.string(),
          text: z.string(),
          citations: z.null(),
        })
      ),
    })
  ),
});

/**
 * Schema for permission request query
 */
export const permissionRequestQuerySchema = z.object({
  sessionId: z.string().uuid(),
});

/**
 * Schema for permission resolution
 */
export const permissionResolutionSchema = z.object({
  sessionId: z.string().uuid(),
  executionId: z.string(),  // Changed from permissionId to executionId
  granted: z.boolean(),
});

/**
 * Schema for permission request response
 */
export const permissionRequestsResponseSchema = z.object({
  sessionId: z.string().uuid(),
  permissionRequests: z.array(
    z.object({
      executionId: z.string(),  // Changed from permissionId to executionId
      toolId: z.string(),
      args: z.record(z.any()),
      timestamp: z.string().datetime(),
    })
  ),
});

/**
 * Schema for permission resolution response
 */
export const permissionResolutionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  executionId: z.string(),  // Changed from permissionId to executionId
  granted: z.boolean(),
  resolved: z.boolean(),
});

/**
 * Schema for fast edit mode toggle request
 */
export const fastEditModeToggleSchema = z.object({
  sessionId: z.string().uuid(),
  enabled: z.boolean(),
});

/**
 * Schema for fast edit mode query
 */
export const fastEditModeQuerySchema = z.object({
  sessionId: z.string().uuid().or(z.string()), // More permissive validation for debugging
});

/**
 * Schema for fast edit mode response
 */
export const fastEditModeResponseSchema = z.object({
  sessionId: z.string().uuid(),
  fastEditMode: z.boolean(),
});

/**
 * Schema for session validation request
 */
export const sessionValidationSchema = z.object({
  sessionIds: z.array(z.string())
});


// Types based on schemas
export type StartSessionRequest = z.infer<typeof startSessionSchema>;
export type QueryRequest = z.infer<typeof querySchema>;
export type AbortRequest = z.infer<typeof abortSchema>;
export type HistoryRequest = z.infer<typeof historySchema>;
export type StatusRequest = z.infer<typeof statusSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type StatusResponse = z.infer<typeof statusResponseSchema>;
export type HistoryResponse = z.infer<typeof historyResponseSchema>;
export type PermissionRequestQuery = z.infer<typeof permissionRequestQuerySchema>;
export type PermissionResolution = z.infer<typeof permissionResolutionSchema>;
export type PermissionRequestsResponse = z.infer<typeof permissionRequestsResponseSchema>;
export type PermissionResolutionResponse = z.infer<typeof permissionResolutionResponseSchema>;
export type FastEditModeToggle = z.infer<typeof fastEditModeToggleSchema>;
export type FastEditModeQuery = z.infer<typeof fastEditModeQuerySchema>;
export type FastEditModeResponse = z.infer<typeof fastEditModeResponseSchema>;
export type SessionValidationRequest = z.infer<typeof sessionValidationSchema>;

/**
 * Schema for timeline query
 */
export const timelineQuerySchema = z.object({
  // sessionId comes from route params, not query params
  limit: z.coerce.number().int().positive().optional(),
  pageToken: z.string().optional(),
  types: z.array(z.nativeEnum(TimelineItemType)).optional(),
  includeRelated: z.coerce.boolean().optional(),
});

/**
 * Schema for rollback request
 */
export const rollbackRequestSchema = z.object({
  toolExecutionId: z.string().optional()
});

/**
 * Type for rollback request
 */
export type RollbackRequestBody = z.infer<typeof rollbackRequestSchema>;

/**
 * Type for timeline query
 */
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;