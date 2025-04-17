/**
 * Types and interfaces for model clients
 */

import Anthropic from '@anthropic-ai/sdk';
import { ToolDescription, ToolRegistry } from './registry';
import { PromptManager } from '../core/PromptManager';
import { Logger } from '../utils/logger';
import { ExecutionAdapter } from './tool';
import { AgentServiceConfig } from '../server/services/AgentService';
import { ContextWindow } from './contextWindow';

export interface ToolCall {
  toolId: string;
  args: unknown;
  toolUseId: string;
}

export interface ToolCallResponse {
  toolCall?: ToolCall;
  toolChosen: boolean;
  response?: Anthropic.Messages.Message;
  /** Whether the operation was aborted */
  aborted?: boolean;
}

export type MessageTokenUsage = {
  messageIndex: number;
  tokens: number;
};

export type TokenUsage = {
  totalTokens: number;
  tokensByMessage: MessageTokenUsage[];
};

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: Anthropic.Messages.ContentBlock[];
}

/**
 * Cache metrics for tracking prompt caching efficiency 
 */
export interface CacheMetricsTracking {
  totalCacheWrites: number;
  totalCacheReads: number;
  lastRequestMetrics?: {
    creation: number;
    read: number;
    input: number;
  };
}

export interface SessionState {
  /** Conversation context with file tracking */
  contextWindow: ContextWindow;
  
  lastToolError?: {
    toolId: string;
    error: string;
    args: Record<string, unknown>;
  };
  isExplorationSession?: boolean;
  shouldExplore?: boolean;
  tokenUsage?: TokenUsage;
  historyTrimmed?: boolean;
  /** Whether the session has been aborted */
  __aborted?: boolean;
  /** Timestamp when the session was aborted */
  __abortTimestamp?: number;
  /** Cache metrics for tracking prompt caching performance */
  cacheMetrics?: CacheMetricsTracking;
  /** Execution adapter type */
  executionAdapterType?: 'local' | 'docker' | 'e2b';
  /** E2B sandbox ID if using E2B execution */
  e2bSandboxId?: string;
  /** Execution adapter instance */
  executionAdapter?: ExecutionAdapter;
  [key: string]: unknown;
}

export interface ModelProviderRequest {
  query?: string;
  tools?: unknown[];
  tool_choice?: { type: string };
  encourageToolUse?: boolean;
  systemMessage?: string; // Kept for backward compatibility
  systemMessages?: string[]; // New array-based system messages
  temperature: number;
  toolErrorContext?: {
    toolId: string;
    error: string;
    args: Record<string, unknown>;
  };
  sessionState?: SessionState;
  cachingEnabled?: boolean; // Whether to enable prompt caching
}

export type ModelProvider = (request: ModelProviderRequest) => Promise<Anthropic.Messages.Message>;

export interface ModelClientConfig {
  modelProvider: ModelProvider;
  promptManager?: PromptManager;
  toolRegistry?: ToolRegistry;
}

export interface ModelClient {
  formatToolsForClaude(toolDescriptions: ToolDescription[]): unknown[];
  getToolCall(query: string, toolDescriptions: ToolDescription[], sessionState?: SessionState): Promise<ToolCallResponse>;
  generateResponse(
    query: string, 
    toolDescriptions: ToolDescription[], 
    sessionState?: SessionState, 
    options?: { tool_choice?: { type: string } }
  ): Promise<Anthropic.Messages.Message>;
}

// TokenManager interface for conversation compression
export interface TokenManager {
  manageConversationSize: (
    sessionState: SessionState, 
    maxTokens: number,
    logger?: Logger
  ) => void;
}