/**
 * Model provider utilities for A/B testing
 */

import { createAnthropicProvider, AnthropicProvider } from '../../../providers/AnthropicProvider';
import { AgentConfiguration } from '../../models/ab-types';
import { ModelProvider, ProcessQueryOptions } from '../judge-runner';

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
      const response = await this.provider({
        messages: [
          { role: 'user', content: [{ type: 'text', text: prompt }] }
        ],
        systemMessage: options.systemPrompt,
        responseType: 'tool_use'
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
      return { response: null };
    }
  }
}

/**
 * Create a model provider for a given configuration
 */
export function createModelProvider(config: AgentConfiguration): AnthropicProvider {
  return createAnthropicProvider({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: config.model
  });
}

/**
 * Create a model provider adapter for the judge
 */
export function createJudgeModelProvider(): ModelProvider {
  // Create a fixed AnthropicProvider for the judge
  const judgeProvider = createAnthropicProvider({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: 'claude-3-7-sonnet-20250219' // Fixed model for judging to ensure consistency
  });
  
  // Wrap it in the adapter
  return new AnthropicProviderAdapter(judgeProvider);
}