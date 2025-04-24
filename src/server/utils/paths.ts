/**
 * Path utilities for server operations
 */
import path from 'path';

/**
 * Get the absolute path to the data directory
 * @returns {string} The absolute path to the data directory
 */
export function getDataDir(): string {
  // Path relative to this file (which is in src/server/utils)
  return path.join(__dirname, '../../../data');
}

/**
 * Get the absolute path to the sessions data directory
 * @returns {string} The absolute path to the sessions data directory
 */
export function getSessionsDataDir(): string {
  return path.join(getDataDir(), 'sessions');
}

/**
 * Get the path to a specific session's data directory
 * @param {string} sessionId - The session ID
 * @returns {string} The path to the session's data directory
 */
export function getSessionDir(sessionId: string): string {
  return path.join(getSessionsDataDir(), sessionId);
}

/**
 * Get the path to a session bundle file
 * @param {string} sessionId - The session ID
 * @returns {string} The path to the session's bundle file
 */
export function getSessionBundlePath(sessionId: string): string {
  return path.join(getSessionsDataDir(), `${sessionId}.bundle`);
}