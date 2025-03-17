/**
 * Types and interfaces for model clients
 */

import Anthropic from '@anthropic-ai/sdk';
import { ToolDescription } from './registry';

export interface ToolCall {
  toolId: string;
  args: unknown;
  toolUseId: string;
}

export interface ToolCallResponse {
  toolCall?: ToolCall;
  toolChosen: boolean;
  response?: Anthropic.Messages.Message;
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

export interface SessionState {
  conversationHistory: Anthropic.Messages.MessageParam[];
  lastToolError?: {
    toolId: string;
    error: string;
    args: Record<string, unknown>;
  };
  isExplorationSession?: boolean;
  shouldExplore?: boolean;
  tokenUsage?: TokenUsage;
  historyTrimmed?: boolean;
  [key: string]: unknown;
}

export interface ModelProviderRequest {
  query?: string;
  tools?: unknown[];
  tool_choice?: { type: string };
  encourageToolUse?: boolean;
  systemMessage?: string;
  messages?: Anthropic.Messages.MessageParam[];
  responseType?: string;
  errorGuidance?: boolean;
  toolErrorContext?: {
    toolId: string;
    error: string;
    args: Record<string, unknown>;
  };
  encourageDetailedResponse?: boolean;
}

export type ModelProvider = (request: ModelProviderRequest) => Promise<Anthropic.Messages.Message>;

export interface ModelClientConfig {
  modelProvider: ModelProvider;
}

export interface ModelClient {
  formatToolsForClaude(toolDescriptions: ToolDescription[]): unknown[];
  getToolCall(query: string, toolDescriptions: ToolDescription[], sessionState?: SessionState): Promise<ToolCallResponse>;
  generateResponse(query: string, toolDescriptions: ToolDescription[], sessionState?: SessionState): Promise<Anthropic.Messages.Message>;
}