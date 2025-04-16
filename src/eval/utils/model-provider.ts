/**
 * Model Provider for the Judge
 * 
 * Creates a model provider for the AI judge to evaluate agent execution.
 */

import { createAnthropicProvider } from '../../providers/AnthropicProvider';
import { createContextWindow } from '../../types/contextWindow';
import { createLogger, LogLevel } from '../../utils/logger';
import { ModelProvider, ProcessQueryOptions } from '../runners/judge';
import { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages.mjs';

// Provider types

/**
 * A simple adapter that makes AnthropicProvider compatible with the ModelProvider interface
 */
class AnthropicProviderAdapter implements ModelProvider {
  private provider: ReturnType<typeof createAnthropicProvider>;
  private logger = createLogger({
    level: LogLevel.INFO,
    prefix: 'JudgeProvider'
  });

  constructor(provider: ReturnType<typeof createAnthropicProvider>) {
    this.provider = provider;
  }

  async processQuery(prompt: string, options: ProcessQueryOptions = {}) {
    try {
      // Create user message from the prompt
      const userMessage: MessageParam = { 
        role: 'user', 
        content: [{ type: 'text', text: prompt }] 
      };
      
      // Call the provider
      const response = await this.provider({
        systemMessage: options.systemPrompt || "You are an expert AI evaluator and judge.",
        temperature: options.temperature || 0.1, // Lower temperature for more consistent judging
        sessionState: {
          contextWindow: createContextWindow([userMessage]),
          agentServiceConfig: {
            apiKey: process.env.ANTHROPIC_API_KEY!,
            defaultModel: process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219',
            permissionMode: process.env.QCKFX_PERMISSION_MODE as 'auto' | 'interactive' || 'interactive',
            allowedTools: ['ReadTool', 'GlobTool', 'GrepTool', 'LSTool'],
            cachingEnabled: process.env.QCKFX_DISABLE_CACHING ? false : true,
          }
        }
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
      this.logger.error('Error in AnthropicProviderAdapter', error);
      return { response: null };
    }
  }
}

/**
 * Create a model provider for the judge
 */
export function createJudgeModelProvider(): ModelProvider {
  // Create an Anthropic provider
  const anthropicProvider = createAnthropicProvider({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: 'claude-3-7-sonnet-20250219'
  });

  // Wrap it in the adapter
  return new AnthropicProviderAdapter(anthropicProvider);
}

export default createJudgeModelProvider;