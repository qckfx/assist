/**
 * AnthropicProvider - Handles interactions with Anthropic's Claude API
 */

import Anthropic from '@anthropic-ai/sdk';
import { 
  AnthropicConfig,  
  AnthropicProvider, 
  ModelProviderRequest, 
} from '../types';
import { LogCategory } from '../types/logger';
import { Logger } from '../utils/logger';
import { tokenManager as defaultTokenManager } from '../utils/TokenManager';

export { AnthropicProvider };

// Maximum token limit for Claude API requests
const MAX_TOKEN_LIMIT = 200000;
// Target token limit after compression (half of max to provide ample buffer)
const TARGET_TOKEN_LIMIT = MAX_TOKEN_LIMIT / 2;

/**
 * Exponential backoff implementation for rate limit handling
 * @param fn - Function to call with retry logic
 * @param maxRetries - Maximum number of retry attempts
 * @param initialDelay - Initial delay in milliseconds
 * @param maxDelay - Maximum delay cap in milliseconds
 * @param logger - Logger instance
 * @returns Result of the function call
 */
async function withRetryAndBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
  initialDelay = 1000,
  maxDelay = 30000,
  logger?: Logger
): Promise<T> {
  let retries = 0;
  let delay = initialDelay;

  // Using retries with defined maxRetries, so no infinite loop
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      // Cast to a type that includes typical API error properties
      const apiError = error as {
        status?: number;
        response?: { status?: number };
        message?: string;
      };
      
      // Check if it's a rate limit error (HTTP 429)
      const isRateLimit = 
        apiError.status === 429 || 
        apiError.response?.status === 429 ||
        (apiError.message && apiError.message.includes('rate_limit_error'));

      // If max retries reached or not a rate limit error, rethrow
      if (retries >= maxRetries || !isRateLimit) {
        throw error;
      }

      // Increment retry count and calculate next delay
      retries++;
      
      // Apply exponential backoff with jitter
      const jitter = Math.random() * 0.3 * delay;
      delay = Math.min(delay * 1.5 + jitter, maxDelay);

      // Log the retry attempt
      if (logger) {
        logger.warn(
          `Rate limit hit, retrying in ${Math.round(delay)}ms (attempt ${retries}/${maxRetries})`,
          LogCategory.MODEL
        );
      } else {
        console.warn(`Rate limit hit, retrying in ${Math.round(delay)}ms (attempt ${retries}/${maxRetries})`);
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // This line will never be reached due to the for loop and return/throw,
  // but TypeScript requires it for compile-time checking
  throw new Error('Maximum retries exceeded');
}

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
  
  // Use the provided tokenManager or fall back to the default
  const tokenManager = config.tokenManager || defaultTokenManager;
  
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

      const conversationHistory = prompt.sessionState?.conversationHistory || [];
      
      // Proactively check token count if conversation history is getting long (> 8 messages)
      if (prompt.sessionState && conversationHistory.length > 2) {
        try {
          // Count tokens
          const tokenCountParams: Anthropic.Messages.MessageCountTokensParams = {
            model,
            messages: conversationHistory as Anthropic.MessageParam[],
            system: prompt.systemMessage
          };
          
          // Add tools if provided
          if (prompt.tools) {
            tokenCountParams.tools = prompt.tools as Anthropic.Tool[];
          }
          
          const tokenCount = await anthropic.messages.countTokens(tokenCountParams);
          logger?.debug('Proactive token count check', LogCategory.MODEL, { tokenCount: tokenCount.input_tokens });
          
          // If over the limit, compress before sending
          if (tokenCount.input_tokens > TARGET_TOKEN_LIMIT) {
            logger?.warn(
              `Token count (${tokenCount.input_tokens}) exceeds target limit (${TARGET_TOKEN_LIMIT}). Compressing conversation.`,
              LogCategory.MODEL,
              {
                tokenCount: tokenCount.input_tokens,
                targetLimit: TARGET_TOKEN_LIMIT,
                maxLimit: MAX_TOKEN_LIMIT,
                messageCount: conversationHistory.length,
                systemMessageLength: prompt.systemMessage?.length || 0,
                toolCount: prompt.tools?.length || 0
              }
            );
            
            // Ensure we pass the logger that matches the expected interface
            tokenManager.manageConversationSize(
              prompt.sessionState,
              TARGET_TOKEN_LIMIT,
              logger
            );
            
            logger?.info(
              `Compressed conversation history to ${prompt.sessionState.conversationHistory.length} messages before API call.`,
              LogCategory.MODEL
            );
          }
        } catch (error) {
          // If token counting fails, just log and continue
          logger?.warn('Token counting failed, continuing with uncompressed conversation', LogCategory.MODEL, error instanceof Error ? error : String(error));
        }
      }

      // Prepare API call parameters
      const apiParams: Anthropic.Messages.MessageCreateParams = {
        model,
        max_tokens: maxTokens,
        system: prompt.systemMessage,
        messages: prompt.sessionState?.conversationHistory || [],
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
      
      try {
        // Make the API call with retry and backoff for rate limits
        const response = await withRetryAndBackoff(
          () => anthropic.messages.create(apiParams),
          5, // max retries
          1000, // initial delay in ms
          30000, // max delay in ms
          logger
        );
        
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
      } catch (error: unknown) {
        // Cast to a type that includes typical API error properties
        const apiError = error as {
          status?: number;
          message?: string;
          body?: unknown;
          response?: { body?: unknown };
        };
        
        // Check for token limit error
        const isTokenLimitError = 
          apiError.status === 400 && 
          (apiError.message?.includes('prompt is too long') || 
           (apiError.message?.includes('token') && apiError.message?.includes('maximum')));
        
        // Log detailed error information for troubleshooting  
        logger?.error('API error details', LogCategory.MODEL, {
          errorStatus: apiError.status,
          errorMessage: apiError.message,
          errorBody: apiError.body || apiError.response?.body || null,
          isTokenLimitError
        });
        
        // If it's a token limit error and we have a session state and token manager, try to compress
        if (isTokenLimitError && prompt.sessionState && prompt.sessionState.conversationHistory.length > 0) {
          logger?.warn(
            `Token limit exceeded ${apiError.message ? `(${apiError.message})` : ''}. Attempting to compress conversation history.`,
            LogCategory.MODEL
          );
          
          // Use token manager to compress conversation to target limit (half of max)
          // Ensure we pass the logger that matches the expected interface
          tokenManager.manageConversationSize(
            prompt.sessionState,
            TARGET_TOKEN_LIMIT,
            logger
          );
          
          logger?.info(
            `Compressed conversation history to ${prompt.sessionState.conversationHistory.length} messages. Retrying API call.`,
            LogCategory.MODEL
          );
          
          // Update API params with compressed conversation
          apiParams.messages = prompt.sessionState.conversationHistory;
          
          // Retry the API call with compressed conversation
          const retryResponse = await withRetryAndBackoff(
            () => anthropic.messages.create(apiParams),
            3, // fewer retries for the second attempt
            1000,
            30000,
            logger
          );
          
          // Handle empty content array
          if (!retryResponse.content || retryResponse.content.length === 0) {
            const fallbackContent: Anthropic.TextBlock = {
              type: "text", 
              text: "I just wanted to check in that everything looks okay with you, please let me know if you'd like to me change anything or continue on.",
              citations: []
            };
            retryResponse.content = [fallbackContent];
          }
          
          return retryResponse as Anthropic.Messages.Message;
        }
        
        // If not a token limit error or compression didn't help, re-throw
        logger?.error('Error calling Anthropic API', LogCategory.MODEL, error);
        throw error;
      }
    } catch (error) {
      logger?.error('Error in Anthropic provider', LogCategory.SYSTEM, {
        error,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  };
};