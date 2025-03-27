/**
 * AnthropicProvider - Handles interactions with Anthropic's Claude API
 */

import Anthropic from '@anthropic-ai/sdk';
import { 
  AnthropicConfig,  
  AnthropicProvider, 
  ModelProviderRequest, 
} from '../types';
import { LogCategory } from '../utils/logger';

/**
 * Creates a provider for Anthropic's Claude API
 * @param config - Configuration options
 * @returns The provider function
 */
export const createAnthropicProvider = (config: AnthropicConfig): AnthropicProvider => {
  if (!config.apiKey) {
    throw new Error('Anthropic provider requires an API key');
  }
  
  const apiKey = config.apiKey;
  const model = config.model || 'claude-3-7-sonnet-20250219';
  const maxTokens = config.maxTokens || 4096;
  const logger = config.logger;
  
  // Create Anthropic client
  const anthropic = new Anthropic({
    apiKey
  });
  
  /**
   * Provider function that handles API calls to Claude
   * @param prompt - The prompt object
   * @returns The API response
   */
  return async (prompt: ModelProviderRequest): Promise<Anthropic.Messages.Message> => {
    try {
      if (prompt.sessionState?.conversationHistory && prompt.sessionState.conversationHistory.length > 0) {
        logger?.debug('Calling Anthropic API', LogCategory.MODEL, { 
          model,
          messageCount: prompt.sessionState.conversationHistory.length
        });
      } else {
        logger?.debug('Calling Anthropic API', LogCategory.MODEL, { model, prompt: 'No messages provided' });
      }

      const messages = prompt.sessionState?.conversationHistory || [];

      // Prepare API call parameters
      const apiParams: Anthropic.Messages.MessageCreateParams = {
        model,
        max_tokens: maxTokens,
        system: prompt.systemMessage,
        messages: messages as Anthropic.MessageParam[],
        temperature: prompt.temperature
      };
      
      // Add tools if provided (for tool use mode)
      if (prompt.tools) {
        apiParams.tools = prompt.tools as Anthropic.Tool[];
      }
      
      // Add tool_choice if provided
      if (prompt.tool_choice) {
        apiParams.tool_choice = prompt.tool_choice as Anthropic.ToolChoice;
      }
      
      // Make the API call
      const response = await anthropic.messages.create(apiParams);
      
      // Make sure token usage information is available for tracking
      if (!response.usage) {
        logger?.warn('Token usage information not provided in the response', LogCategory.MODEL);
      }
      
      logger?.debug('Anthropic API response', LogCategory.MODEL, { 
        id: response.id,
        usage: response.usage,
        contentTypes: response.content?.map(c => c.type)
      });

      // Handle empty content array by providing a fallback message
      if (!response.content || response.content.length === 0) {
        // Create a fallback content that matches Anthropic's expected format
        const fallbackContent: Anthropic.TextBlock = {
          type: "text", 
          text: "I just wanted to check in that everything looks okay with you, please let me know if you'd like to me change anything or continue on.",
          citations: []
        };
        response.content = [fallbackContent];
        logger?.debug('Added fallback content for empty response', LogCategory.MODEL, { content: response.content });
      }
      
      return response as Anthropic.Messages.Message;
    } catch (error) {
      logger?.error('Error calling Anthropic API', LogCategory.MODEL, error);
      throw error;
    }
  };
};