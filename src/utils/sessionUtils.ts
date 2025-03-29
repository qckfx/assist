/**
 * Utility functions for working with session state
 */
import { SessionState } from "../types/model";

/**
 * Check if a session has been aborted
 * @param sessionState The session state object to check
 * @returns Whether the session has been aborted
 */
export function isSessionAborted(sessionState: SessionState): boolean {
  return sessionState.__aborted === true;
}