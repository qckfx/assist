/**
 * PromptManager - Manages system prompts
 */

import { SessionState } from '../types/model';

/**
 * Interface for prompt managers that generate system prompts
 */
export interface PromptManager {
  /**
   * Returns a system prompt based on the current session state
   * @param sessionState Current session state
   * @returns A system prompt string
   */
  getSystemPrompt(sessionState?: SessionState): string;
  
  /**
   * Returns the temperature setting based on the current session state
   * @param sessionState Current session state
   * @returns A temperature value between 0 and 1
   */
  getTemperature(sessionState?: SessionState): number;
}

// Default system prompt used for all interactions
const DEFAULT_SYSTEM_PROMPT = 
  'You are a helpful AI assistant that uses tools to answer user queries. ' +
  'Always try to use a tool when appropriate rather than generating information yourself. ' +
  'Review previous tool calls before deciding what to do next. ' +
  'Avoid repeating the same tool calls with the same parameters. ' +
  'Pay close attention to tool parameter requirements. ' +
  'When using tools, ensure all parameters match the expected types and formats. ' +
  'If a tool fails due to invalid arguments, carefully read the error message and fix your approach.';

/**
 * Basic implementation of the PromptManager that uses a fixed system prompt
 * and enhances it with context from the session state
 */
export class BasicPromptManager implements PromptManager {
  private readonly basePrompt: string;
  private readonly defaultTemperature: number;
  
  /**
   * Create a prompt manager with a fixed base prompt
   * @param basePrompt The base system prompt to use
   * @param defaultTemperature The default temperature to use (0.0-1.0)
   */
  constructor(basePrompt: string = DEFAULT_SYSTEM_PROMPT, defaultTemperature: number = 0.2) {
    this.basePrompt = basePrompt;
    this.defaultTemperature = defaultTemperature;
  }
  
  getSystemPrompt(sessionState?: SessionState): string {
    let prompt = this.basePrompt;
    
    // Enhance the prompt with error context if available
    if (sessionState?.lastToolError) {
      prompt += ` In your last tool call to ${sessionState.lastToolError.toolId}, ` +
               `you encountered this error: "${sessionState.lastToolError.error}". ` +
               "Please correct your approach accordingly.";
    }
    
    return prompt;
  }
  
  getTemperature(_sessionState?: SessionState): number {
    // For now, we just return a fixed temperature
    // In the future, this could adjust based on session state
    // For example, use a higher temperature for creative tasks
    // or a lower temperature for precise reasoning
    return this.defaultTemperature;
  }
}

/**
 * Creates a prompt manager with the default system prompt
 * @param temperature Optional temperature override (defaults to 0.2)
 * @returns A new prompt manager instance
 */
export function createDefaultPromptManager(temperature?: number): PromptManager {
  return new BasicPromptManager(undefined, temperature);
}

/**
 * Creates a prompt manager with a custom system prompt
 * @param basePrompt The base system prompt to use
 * @param temperature Optional temperature override (defaults to 0.2)
 * @returns A new prompt manager instance
 */
export function createPromptManager(basePrompt: string, temperature?: number): PromptManager {
  return new BasicPromptManager(basePrompt, temperature);
}