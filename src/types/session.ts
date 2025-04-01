/**
 * Types and interfaces for session state persistence
 */

import { SessionState } from './model';
import { ToolExecutionState, PermissionRequestState } from './tool-execution';
import { ToolPreviewState } from './preview';

/**
 * Reference to a tool call in a stored message
 */
export interface ToolCallReference {
  /**
   * Unique ID of the tool execution
   */
  executionId: string;
  
  /**
   * Display name of the tool
   */
  toolName: string;
  
  /**
   * Whether the tool was invoked as part of a batch
   */
  isBatchedCall?: boolean;
  
  /**
   * Index of this call in the original message
   */
  index: number;
}

/**
 * Normalized representation of a conversation message
 */
export interface StoredMessage {
  /**
   * Unique message ID
   */
  id: string;
  
  /**
   * Message sender role
   */
  role: 'user' | 'assistant';
  
  /**
   * ISO timestamp of when the message was created
   */
  timestamp: string;
  
  /**
   * Basic text content without embedded tool calls
   */
  content: string;
  
  /**
   * References to tool calls made within this message
   */
  toolCalls?: ToolCallReference[];
  
  /**
   * ID of the parent message (if this is a response)
   */
  parentMessageId?: string;
  
  /**
   * Ordering sequence in the conversation
   */
  sequence: number;
}

/**
 * Repository information for a session
 */
export interface RepositoryInfo {
  /**
   * Working directory path
   */
  workingDirectory: string;
  
  /**
   * Whether the directory is a git repository
   */
  isGitRepository: boolean;
  
  /**
   * Current branch name (if git repository)
   */
  currentBranch?: string;
  
  /**
   * Whether the repository has uncommitted changes
   */
  hasUncommittedChanges?: boolean;
  
  /**
   * Hash of the most recent commit (if git repository)
   */
  latestCommitHash?: string;
  
  /**
   * Warning flags for the repository state
   */
  warnings?: {
    /**
     * Whether there are uncommitted changes (which won't be included in the saved state)
     */
    uncommittedChanges?: boolean;
    
    /**
     * Whether there are untracked files (which won't be included in the saved state)
     */
    untrackedFiles?: boolean;
  };
}

/**
 * Complete saved session data
 */
export interface SavedSessionData {
  /**
   * Unique session ID
   */
  id: string;
  
  /**
   * Session display name
   */
  name: string;
  
  /**
   * ISO timestamp of when the session was created
   */
  createdAt: string;
  
  /**
   * ISO timestamp of when the session was last updated
   */
  updatedAt: string;
  
  /**
   * Ordered array of session messages
   */
  messages: StoredMessage[];
  
  /**
   * Tool execution records
   */
  toolExecutions: ToolExecutionState[];
  
  /**
   * Permission request records
   */
  permissionRequests: PermissionRequestState[];
  
  /**
   * Tool preview records
   */
  previews: ToolPreviewState[];
  
  /**
   * Repository information
   */
  repositoryInfo?: RepositoryInfo;
  
  /**
   * Core session state
   */
  sessionState: SessionState;
}

/**
 * Session metadata for listing available sessions
 */
export interface SessionListEntry {
  /**
   * Unique session ID
   */
  id: string;
  
  /**
   * Session display name
   */
  name: string;
  
  /**
   * ISO timestamp of when the session was created
   */
  createdAt: string;
  
  /**
   * ISO timestamp of when the session was last updated
   */
  updatedAt: string;
  
  /**
   * Number of messages in the session
   */
  messageCount: number;
  
  /**
   * Number of tool executions in the session
   */
  toolExecutionCount: number;
  
  /**
   * Repository information summary
   */
  repositoryInfo?: {
    workingDirectory: string;
    isGitRepository: boolean;
    currentBranch?: string;
    hasWarnings?: boolean;
  };
}

/**
 * Events emitted by the SessionStatePersistence service
 */
export enum SessionPersistenceEvent {
  SESSION_SAVED = 'session_persistence:session_saved',
  SESSION_LOADED = 'session_persistence:session_loaded',
  SESSION_DELETED = 'session_persistence:session_deleted',
  SESSION_UPDATED = 'session_persistence:session_updated'
}