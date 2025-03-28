/**
 * Model provider utilities for A/B testing
 */

import { createAnthropicProvider, AnthropicProvider } from '../../../providers/AnthropicProvider';
import { AgentConfiguration } from '../../models/ab-types';
import { ModelProvider, ProcessQueryOptions } from '../judge-runner';
import Anthropic from '@anthropic-ai/sdk';
import { SessionState } from '../../../types/model';
import { createLogger, LogLevel } from '../../../utils/logger';

/**
 * Adapter class to make AnthropicProvider compatible with the ModelProvider interface
 * required by the judge runner.
 */
export class AnthropicProviderAdapter implements ModelProvider {
  private provider: AnthropicProvider;

  constructor(provider: AnthropicProvider) {
    this.provider = provider;
  }

  async processQuery(prompt: string, options: ProcessQueryOptions = {}) {
    try {
      // Adapt the provider to the ModelProvider interface
      const sessionState: SessionState = { 
        conversationHistory: [
          { 
            role: 'user' as const, 
            content: [{ type: 'text' as const, text: prompt }] 
          }
        ]
      };
      
      const response = await this.provider({
        systemMessage: options.systemPrompt || '',
        temperature: options.temperature || 0.2,
        sessionState
      });

      // Extract the text content from the response
      let responseText = '';
      if (response.content && response.content.length > 0) {
        for (const block of response.content) {
          if (block.type === 'text' && block.text) {
            responseText += block.text;
          }
        }
      }

      return { response: responseText };
    } catch (error) {
      console.error('Error in AnthropicProviderAdapter', error);
      console.error('Details:', {
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStatus: (error as any)?.status,
        errorBody: (error as any)?.body || (error as any)?.response?.body || null
      });
      return { response: null };
    }
  }
}

/**
 * Create a model provider for a given configuration
 */
export function createModelProvider(config: AgentConfiguration): AnthropicProvider {
  // Create a proper logger instead of an ad-hoc object
  const logger = createLogger({
    level: LogLevel.INFO,
    prefix: `ModelProvider[${config.name}]`
  });
  
  return createAnthropicProvider({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: config.model,
    logger
  });
}

/**
 * Create a model provider adapter for the judge
 */
export function createJudgeModelProvider(): ModelProvider {
  // Create a proper logger for the judge
  const logger = createLogger({
    level: LogLevel.INFO,
    prefix: 'Judge'
  });
  
  // Create a fixed AnthropicProvider for the judge
  const judgeProvider = createAnthropicProvider({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: 'claude-3-7-sonnet-20250219', // Fixed model for judging to ensure consistency
    logger
  });
  
  // Wrap it in the adapter
  return new AnthropicProviderAdapter(judgeProvider);
}