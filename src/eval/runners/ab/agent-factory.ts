/**
 * Agent factory for A/B testing
 * 
 * Creates model clients and providers from agent configurations,
 * leveraging the PromptManager for consistent prompt handling.
 */

import { createAnthropicProvider } from '../../../providers/AnthropicProvider';
import { createModelClient } from '../../../core/ModelClient';
import { createPromptManager } from '../../../core/PromptManager';
import { AgentConfiguration } from '../../models/ab-types';
import { createLogger, LogLevel } from '../../../utils/logger';

// Create a logger for the agent factory
const logger = createLogger({
  level: LogLevel.INFO,
  prefix: 'AgentFactory'
});

/**
 * Create a model provider from an agent configuration
 * This creates a standard Anthropic provider without PromptManager integration
 * 
 * @param config Agent configuration to use
 * @returns An Anthropic provider
 */
export function createProviderFromConfig(config: AgentConfiguration) {
  // Create the model provider
  return createAnthropicProvider({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: config.model,
    logger
  });
}

/**
 * Create a model client configured with a PromptManager 
 * from an agent configuration
 * 
 * @param config Agent configuration to use
 * @returns A model client configured with the appropriate PromptManager
 */
export function createAgentFromConfig(config: AgentConfiguration) {
  try {
    // Create the model provider first
    const modelProvider = createProviderFromConfig(config);
    
    // Create a prompt manager from the configuration
    const promptManager = createPromptManager(
      config.systemPrompt,
      config.parameters?.temperature || 0.2
    );
    
    // Log the configuration
    logger.info(`Creating agent with prompt manager for ${config.name}`);
    
    // Create and return the model client
    return createModelClient({
      modelProvider,
      promptManager
    });
  } catch (error) {
    logger.error('Error creating agent from config', error);
    throw error;
  }
}