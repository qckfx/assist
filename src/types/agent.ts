/**
 * Types and interfaces for the agent runner
 * 
 */

import { ProcessQueryResult, ConversationResult } from "@qckfx/agent";

// This interface is kept for reference but should not be used directly
// Use the types from @qckfx/agent instead
export interface AgentRunnerConfig {
  logger?: {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };
}

export interface AgentRunner {
  processQuery(query: string, sessionState?: Record<string, unknown>): Promise<ProcessQueryResult>;
  runConversation(initialQuery: string): Promise<ConversationResult>;
}

// We'll use the SessionState and ConversationMessage types from model.ts

// Legacy interfaces from the original agent.ts file
export interface AgentMessage {
  role: string;
  content: string;
}

export interface AgentResponse {
  text: string;
  [key: string]: unknown;
}

export interface ToolParameter {
  name: string;
  description: string;
  type: string;
  required: boolean;
  default?: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}