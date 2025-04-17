/**
 * Types and interfaces for Anthropic provider
 */

import Anthropic from '@anthropic-ai/sdk';
import { ModelProviderRequest, TokenManager } from './model';
import { Logger } from '../utils/logger';

/**
 * Cache control configuration for prompt caching
 */
export interface CacheControl {
  type: "ephemeral";
}

/**
 * Cache metrics for tracking prompt caching performance
 */
export interface CacheMetrics {
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
}

/**
 * Extended content block with cache control support
 */
export interface ContentBlockWithCache {
  type: string;
  text?: string;
  name?: string;
  id?: string;
  input?: Record<string, unknown>;
  cache_control?: CacheControl;
}

/**
 * Extended tool definition with cache control support
 */
export interface ToolWithCache {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  cache_control?: CacheControl;
}

/**
 * System content block with cache control support
 * For system parameter, use an array of these objects
 */
export interface SystemContentBlock {
  type: string;
  text: string;
  cache_control?: CacheControl;
}

/**
 * System parameter with cache control support
 * This is an array of content blocks
 */
export type SystemWithCache = SystemContentBlock[];

export interface AnthropicConfig {
  model?: string;
  maxTokens?: number;
  logger?: Logger;
  tokenManager?: TokenManager;
  cachingEnabled?: boolean; // Whether to enable prompt caching
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
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export type AnthropicProvider = (prompt: ModelProviderRequest) => Promise<Anthropic.Messages.Message>;