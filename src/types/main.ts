/**
 * Types and interfaces for the main module
 */

import { AgentRunner, ProcessQueryResult, ConversationResult } from './agent';
import { ModelClient, SessionState } from './model';
import { PermissionManager } from './permission';
import { ToolRegistry } from './registry';
import { Tool } from './tool';
import { ModelProvider } from './model';

// Define repository environment types
export type RepositoryEnvironment = 
  | { type: 'local' }
  | { type: 'docker' }
  | { type: 'e2b', sandboxId: string };

export interface AgentConfig {
  modelProvider: ModelProvider;
  environment: RepositoryEnvironment;
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

export interface Agent {
  // Core components
  agentRunner: (env?: RepositoryEnvironment) => Promise<AgentRunner>;
  toolRegistry: ToolRegistry;
  permissionManager: PermissionManager;
  modelClient: ModelClient;
  environment?: RepositoryEnvironment;
  logger: {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };
  
  // Helper methods
  processQuery(query: string, sessionState?: SessionState): Promise<ProcessQueryResult>;
  runConversation(initialQuery: string): Promise<ConversationResult>;
  registerTool(tool: Tool): void;
}