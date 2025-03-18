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
      if (prompt.messages && prompt.messages.length > 0) {
        logger?.debug('Calling Anthropic API', LogCategory.MODEL, { 
          model,
          messageCount: prompt.messages.length
        });
      } else {
        logger?.debug('Calling Anthropic API', LogCategory.MODEL, { model, prompt: 'No messages provided' });
      }

      if (prompt.responseType === 'user_message') {
        // This is a response generation request
        const messages = prompt.messages || [];
        
        // User-facing response - focus on clear communication of findings
        let systemMessage = 'You are a helpful AI assistant creating a response directly for the user. ' +
                        'This response will be shown to the user, not used for further tool calls. ' +
                        'Use your knowledge from the previous tool calls to give a clear and helpful response. ' + 
                        'Summarize what you\'ve learned and directly answer the user\'s original question. ' +
                        'Be concise but complete. ' +
                        'IMPORTANT: Always provide a substantive response to the user. ' +
                        'If you\'ve found information, share it clearly. If you need more information, explicitly ask for it. ' +
                        'Check in with the user about whether your findings are helpful and what additional support they need. ' +
                        'Never leave the conversation hanging - always provide next steps, suggestions, or questions to continue the interaction. ' +
                        'If appropriate, you may suggest potential next steps for the user. ' +
                        'Do not request further tool use in this message as this is your final response to the user.';
                        
        // If we also want detailed response for user messages, enhance but don't override the user-facing focus
        if (prompt.encourageDetailedResponse) {
          systemMessage += ' While being concise, include specific details from your findings that directly address the user\'s question.';
        }
        
        // Make the API call
        const response = await anthropic.messages.create({
          model,
          max_tokens: maxTokens,
          system: systemMessage,
          messages: messages as Anthropic.MessageParam[],
          temperature: 0.4
        });
        
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
      } else {
        const messages = prompt.messages || [];
        
        // Default system message
        let systemMessage = 'You are a helpful AI assistant that uses tools to answer user queries. ' +
                         'Always try to use a tool when appropriate rather than generating information yourself.';
        
        if (prompt.systemMessage) {
          systemMessage = prompt.systemMessage;
        }
        
        // Make the API call
        const response = await anthropic.messages.create({
          model,
          max_tokens: maxTokens,
          system: systemMessage,
          messages: messages as Anthropic.MessageParam[],
          tools: prompt.tools as Anthropic.Tool[],
          tool_choice: prompt.tool_choice as Anthropic.ToolChoice,
          temperature: 0.2
        });
        
        // Make sure token usage information is available for tracking
        if (!response.usage) {
          logger?.warn('Token usage information not provided in the response', LogCategory.MODEL);
        }
        
        logger?.debug('Anthropic API response', LogCategory.MODEL, { 
          id: response.id,
          usage: response.usage,
          contentTypes: response.content?.map(c => c.type)
        });
        return response as Anthropic.Messages.Message;
      }
    } catch (error) {
      logger?.error('Error calling Anthropic API', LogCategory.MODEL, error);
      throw error;
    }
  };
};