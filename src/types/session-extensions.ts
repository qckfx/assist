/**
 * Extensions to the base SessionState interface from agent-core
 */
import { SessionState as CoreSessionState } from '@qckfx/agent';

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
declare module '@qckfx/agent' {
  interface SessionState extends CoreSessionState {
    /**
     * Repository checkpoints that can be used to restore the state
     */
    checkpoints?: CheckpointInfo[];
  }
}

export type { CheckpointInfo };