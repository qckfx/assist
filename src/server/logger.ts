/**
 * Server logger
 */

import { createLogger, LogLevel } from '../utils/logger';

// Get development mode from environment
// Fallback to development mode if NODE_ENV is not set
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

/**
 * Create a logger for the server
 * Only show DEBUG logs in development mode
 */
export const serverLogger = createLogger({
  level: isDevelopment ? LogLevel.DEBUG : LogLevel.INFO,
  prefix: 'server',
  formatOptions: {
    showTimestamp: false,
    showPrefix: true,
    colors: true
  }
});