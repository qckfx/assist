/**
 * API configuration and settings
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

export const API_ENDPOINTS = {
  START: '/start',
  QUERY: '/query',
  ABORT: '/abort',
  HISTORY: '/history',
  STATUS: '/status',
  PERMISSIONS: '/permissions',
  PERMISSIONS_RESOLVE: '/permissions/resolve',
  DOCS: '/docs',
};

// API request timeout in milliseconds
export const API_TIMEOUT = 30000;

// WebSocket configuration
export const SOCKET_RECONNECTION_ATTEMPTS = 5;
export const SOCKET_RECONNECTION_DELAY = 1000;
export const SOCKET_RECONNECTION_DELAY_MAX = 5000;
export const SOCKET_TIMEOUT = 20000;