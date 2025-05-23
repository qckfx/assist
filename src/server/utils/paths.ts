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
 * Get the path to a session's checkpoints directory
 * @param {string} sessionId - The session ID
 * @returns {string} The path to the session's checkpoints directory
 */
export function getSessionCheckpointsDir(sessionId: string): string {
  return path.join(getSessionDir(sessionId), 'checkpoints');
}

/**
 * Get the path to a specific checkpoint directory
 * @param {string} sessionId - The session ID
 * @param {string} toolExecutionId - The tool execution ID
 * @returns {string} The path to the checkpoint directory
 */
export function getCheckpointDir(sessionId: string, toolExecutionId: string): string {
  return path.join(getSessionCheckpointsDir(sessionId), toolExecutionId);
}

/**
 * Get the path to a checkpoint bundle file for a specific repository
 * @param {string} sessionId - The session ID
 * @param {string} toolExecutionId - The tool execution ID
 * @param {string} repoName - The repository name
 * @returns {string} The path to the checkpoint bundle file
 */
export function getCheckpointBundlePath(sessionId: string, toolExecutionId: string, repoName: string): string {
  return path.join(getCheckpointDir(sessionId, toolExecutionId), `${repoName}.bundle`);
}