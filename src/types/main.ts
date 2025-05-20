/**
 * Types and interfaces for the main module
 */

import { Agent as QckfxAgent } from '@qckfx/agent';

export interface AgentConfig {
  environment: 'local' | 'docker' | 'remote';
  logger?: {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };
  permissionUIHandler?: {
    requestPermission: (toolId: string, args: Record<string, unknown>) => Promise<boolean>;
  };
}

// Re-export the Agent interface from the qckfx/agent module
export type Agent = QckfxAgent;