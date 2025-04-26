/**
 * API configuration and settings
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
// Socket.IO should ALWAYS connect to the current origin in development
// and only use this value in production if specified
export const SOCKET_URL = process.env.NODE_ENV === 'development' 
  ? undefined 
  : (import.meta.env.VITE_SOCKET_URL || undefined);

export const API_ENDPOINTS = {
  START: '/start',
  QUERY: '/query',
  ABORT: '/abort',
  HISTORY: '/history',
  STATUS: '/status',
  PERMISSIONS: '/permissions',
  PERMISSIONS_RESOLVE: '/permissions/resolve',
  FAST_EDIT_MODE: '/permissions/fast-edit-mode',
  DOCS: '/docs',
  // Add session management endpoints
  SESSIONS_LIST: '/sessions/persisted',
  SESSIONS_SAVE: '/sessions/:sessionId/state/save',
  SESSIONS_DELETE: '/sessions/persisted/:sessionId',
  SESSIONS_VALIDATE: '/sessions/validate',
  // Timeline endpoint
  TIMELINE: '/sessions/:sessionId/timeline',
  // Rollback endpoint
  ROLLBACK: '/sessions/:sessionId/rollback',
  // Models endpoint
  MODELS: '/models',
};

// API request timeout in milliseconds
export const API_TIMEOUT = 30000;

// WebSocket configuration - improved settings for Docker environments
export const SOCKET_RECONNECTION_ATTEMPTS = 10; // Increased for Docker container start time
export const SOCKET_RECONNECTION_DELAY = 500; // Fast initial reconnect
export const SOCKET_RECONNECTION_DELAY_MAX = 3000; // Shorter max delay for more frequent attempts
export const SOCKET_TIMEOUT = 30000; // Allow more time for Docker initialization