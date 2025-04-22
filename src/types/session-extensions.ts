/**
 * Extensions to the base SessionState interface from agent-core
 */
import { SessionState as CoreSessionState } from '@qckfx/agent/node/internals';

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

/**
 * Extended SessionState interface with checkpoint support
 */
declare module '@qckfx/agent/node/internals' {
  interface SessionState extends CoreSessionState {
    /**
     * Repository checkpoints that can be used to restore the state
     */
    checkpoints?: CheckpointInfo[];
  }
}

// No need to re-export CheckpointInfo as it's already declared in this file