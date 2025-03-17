/**
 * Types and interfaces for Anthropic provider
 */

import Anthropic from '@anthropic-ai/sdk';
import { ModelProviderRequest } from './model';

export interface AnthropicConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  logger?: {
    debug: (message: string, data?: Record<string, unknown>) => void;
    info: (message: string, data?: Record<string, unknown>) => void;
    warn: (message: string, data?: Record<string, unknown>) => void;
    error: (message: string, error?: unknown) => void;
  };
}

export interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export type AnthropicProvider = (prompt: ModelProviderRequest) => Promise<Anthropic.Messages.Message>;