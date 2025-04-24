/**
 * Types and interfaces for session state persistence
 */

import { 
  StructuredContent, 
  ToolExecutionState, 
  PermissionRequestState,
} from './platform-types';
import { ToolCallReference } from '@qckfx/agent';
import { ToolPreviewState } from './preview';
import { SessionState as CoreSessionState } from '@qckfx/agent/browser/internals';


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
   * Structured message content as array of content parts
   */
  content: StructuredContent;
  
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
  sequence?: number;
  
  /**
   * Status indicating server confirmation state
   * 'pending' - Message sent locally but not confirmed by server
   * 'confirmed' - Message confirmed received by server
   * 'failed' - Message failed to send to server
   */
  confirmationStatus?: 'pending' | 'confirmed' | 'failed';
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
 * Clean repository status - no uncommitted changes
 */
export interface CleanRepositoryStatus {
  type: 'clean';
}

/**
 * Dirty repository status - has uncommitted changes
 */
export interface DirtyRepositoryStatus {
  type: 'dirty';
  
  /**
   * Modified files not yet staged
   */
  modifiedFiles: string[];
  
  /**
   * Files staged for commit
   */
  stagedFiles: string[];
  
  /**
   * Untracked files
   */
  untrackedFiles: string[];
  
  /**
   * Deleted files
   */
  deletedFiles: string[];
}

/**
 * Repository status - either clean or dirty with details
 */
export type RepositoryStatus = CleanRepositoryStatus | DirtyRepositoryStatus;

/**
 * Git repository information to be used in the system prompt
 */
export interface GitRepositoryInfo {
  /**
   * Whether the directory is a git repository
   */
  isGitRepository: boolean;
  
  /**
   * Current branch name
   */
  currentBranch: string;
  
  /**
   * Default branch name (typically 'main' or 'master')
   */
  defaultBranch: string;
  
  /**
   * Repository status details
   */
  status: RepositoryStatus;
  
  /**
   * Recent commits (hash and message)
   */
  recentCommits: string[];
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
   * Path to the shadow Git bundle file, if available
   */
  shadowGitBundle?: string;
  
  /**
   * Checkpoints for repository snapshots
   */
  checkpoints?: Array<{
    /**
     * Tool execution ID associated with this checkpoint
     */
    toolExecutionId: string;
    
    /**
     * Shadow repository commit hash
     */
    shadowCommit: string;
    
    /**
     * Host repository commit hash
     */
    hostCommit: string;
  }>;
  
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

/**
 * Extends the core SessionState interface to include checkpoint information
 */
export interface CheckpointInfo {
  /**
   * Tool execution ID associated with this checkpoint
   */
  toolExecutionId: string;
  
  /**
   * Shadow repository commit hash
   */
  shadowCommit: string;
  
  /**
   * Host repository commit hash
   */
  hostCommit: string;
}

export interface SessionState {
  coreSessionState: CoreSessionState;
  checkpoints?: CheckpointInfo[];
}
