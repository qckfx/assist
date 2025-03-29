/**
 * Utility functions for working with session state
 */
import { SessionState } from "../types/model";

/**
 * Check if a session has been aborted
 * This function is used to check if an operation should be stopped mid-execution.
 * Note: The abort flag is reset when a new user message is processed in AgentService.processQuery
 * 
 * @param sessionState The session state object to check
 * @returns Whether the session has been aborted
 */
export function isSessionAborted(sessionState: SessionState): boolean {
  return sessionState.__aborted === true;
}