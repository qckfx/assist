/**
 * ModelClient - Interacts with the Language Model
 */

import Anthropic from '@anthropic-ai/sdk';
import { 
  ModelClient, 
  ModelClientConfig, 
  ModelProvider, 
  ModelProviderRequest, 
  SessionState, 
  ToolCallResponse 
} from '../types/model';
// Import utils as needed
import { ToolDescription } from '../types/registry';
import { trackTokenUsage } from '../utils/TokenManager';
import { createDefaultPromptManager, PromptManager } from './PromptManager';
import { isSessionAborted } from '../utils/sessionUtils';

/**
 * Helper function to get sessionId from SessionState
 * @param sessionState The session state
 * @returns The session ID as a string
 */
function getSessionId(sessionState: SessionState): string {
  if (!sessionState.id) {
    console.warn('ModelClient: Session state missing ID property', sessionState);
  }
  return (sessionState.id as string) || 'unknown-session';
}

/**
 * Creates a client for interacting with the language model
 * @param config - Configuration options
 * @returns The model client interface
 */
export const createModelClient = (config: ModelClientConfig): ModelClient => {
  if (!config || !config.modelProvider) {
    throw new Error('ModelClient requires a modelProvider function');
  }
  
  const modelProvider: ModelProvider = config.modelProvider;
  const promptManager: PromptManager = config.promptManager || createDefaultPromptManager();
  
  return {
    /**
     * Format our tools into Claude's expected format
     * @param toolDescriptions - Array of tool descriptions
     * @returns Tools formatted for Claude's API
     */
    formatToolsForClaude(toolDescriptions: ToolDescription[]): unknown[] {
      return toolDescriptions.map(tool => ({
        name: tool.id,
        description: tool.description,
        input_schema: {
          type: "object",
          properties: tool.parameters || {},
          required: tool.requiredParameters || []
        }
      }));
    },
    
    /**
     * Get a tool call recommendation from the model
     * @param query - The user's query
     * @param toolDescriptions - Descriptions of available tools
     * @param sessionState - Current session state
     * @returns The recommended tool call
     */
    async getToolCall(
      query: string, 
      toolDescriptions: ToolDescription[], 
      sessionState: SessionState 
    ): Promise<ToolCallResponse> {
      console.log('⚠️ MODEL_CLIENT getToolCall called with:', {
        queryLength: query ? query.length : 0,
        query: query ? query.substring(0, 50) + (query.length > 50 ? '...' : '') : 'none',
        toolCount: toolDescriptions.length,
        sessionId: sessionState.id || 'unknown',
        historyLength: sessionState.conversationHistory?.length || 0,
        lastResult: !!sessionState.lastResult,
        hasToolError: !!sessionState.lastToolError
      });
      
      // Format tools for Claude
      const claudeTools = this.formatToolsForClaude(toolDescriptions);
      
      // Get system messages and temperature from the prompt manager
      const systemMessages = promptManager.getSystemPrompts(sessionState);
      const temperature = promptManager.getTemperature(sessionState);
      
      // Prepare the request for AnthropicProvider
      const request: ModelProviderRequest = {
        query: query,
        tools: claudeTools,
        tool_choice: { type: "auto" },
        encourageToolUse: true,
        systemMessages: systemMessages,
        // Include systemMessage for backward compatibility
        systemMessage: systemMessages[0],
        temperature: temperature,
        // Pass the conversation history in a way AnthropicProvider can use
        sessionState
      };
      
      console.log('⚠️ MODEL_CLIENT sending request to modelProvider with:', {
        hasQuery: !!query, 
        toolCount: claudeTools.length,
        historyLength: sessionState.conversationHistory?.length || 0,
        sessionId: sessionState.id || 'unknown'
      });
      
      let response;
      try {
        // Call the model provider
        console.log('⚠️ MODEL_CLIENT calling modelProvider...');
        response = await modelProvider(request);
        console.log('⚠️ MODEL_CLIENT received response from modelProvider');
      } catch (error) {
        console.error('⚠️ MODEL_CLIENT error calling modelProvider:', error);
        throw error;
      }
      
      // Track token usage from response
      if (response.usage) {
        trackTokenUsage(response, sessionState);
      }
      
      // Check if Claude wants to use a tool - look for tool_use in the content
      const hasTool = response.content && response.content.some(c => c.type === "tool_use");
      
      console.log('⚠️ MODEL_CLIENT response analysis:', {
        hasTool,
        contentLength: response.content?.length || 0,
        contentTypes: response.content?.map(c => c.type),
        hasToolUse: response.content?.some(c => c.type === "tool_use"),
        sessionId: sessionState.id || 'unknown'
      });
      
      if (hasTool) {
        // Extract the tool use from the response
        const toolUse = response.content && response.content.find(c => c.type === "tool_use");
        
        console.log('⚠️ MODEL_CLIENT toolUse found:', {
          toolUseName: toolUse?.name,
          toolUseId: toolUse?.id,
          hasInput: !!toolUse?.input,
          inputSize: toolUse?.input ? Object.keys(toolUse.input).length : 0
        });
        
        // Add the assistant's tool use response to the conversation history only if not aborted
        if (sessionState.conversationHistory && toolUse && !isSessionAborted(getSessionId(sessionState))) {
          const toolUseMessage: Anthropic.Messages.MessageParam = {
            role: "assistant",
            content: [
              {
                type: "tool_use" as const,
                id: toolUse.id,
                name: toolUse.name,
                input: toolUse.input || {}
              }
            ]
          };
          
          sessionState.conversationHistory.push(toolUseMessage);
          console.log('⚠️ MODEL_CLIENT added tool use to conversation history:', {
            toolName: toolUse.name,
            historyLength: sessionState.conversationHistory.length
          });
        } else {
          console.log('⚠️ MODEL_CLIENT did not add tool use to conversation history:', {
            hasHistory: !!sessionState.conversationHistory,
            hasToolUse: !!toolUse,
            isAborted: isSessionAborted(getSessionId(sessionState))
          });
        }
        
        if (toolUse) {
          const toolCallResponse = {
            toolCall: {
              toolId: toolUse.name || "",
              args: toolUse.input || {},
              toolUseId: toolUse.id || "", // Save this for returning results
            },
            toolChosen: true,
            aborted: isSessionAborted(getSessionId(sessionState)) // Check current abort status
          };
          
          console.log('⚠️ MODEL_CLIENT returning tool call:', {
            toolId: toolCallResponse.toolCall.toolId,
            toolUseId: toolCallResponse.toolCall.toolUseId,
            argsKeys: Object.keys(toolCallResponse.toolCall.args),
            isAborted: toolCallResponse.aborted
          });
          
          return toolCallResponse;
        }
      }
      
      console.log('⚠️ MODEL_CLIENT returning no tool chosen response');
      return {response: response, toolChosen: false, aborted: isSessionAborted(getSessionId(sessionState))};
    },
    
    /**
     * Generate a response to the user based on tool execution results
     * @param query - The original user query
     * @param toolDescriptions - Descriptions of available tools
     * @param sessionState - Current session state
     * @returns The generated response
     */
    async generateResponse(
      query: string, 
      toolDescriptions: ToolDescription[], 
      sessionState: SessionState,
      options?: { tool_choice?: { type: string } }
    ): Promise<Anthropic.Messages.Message> {
      // Format tools for Claude
      const claudeTools = this.formatToolsForClaude(toolDescriptions);
      
      // Get system messages and temperature from the prompt manager
      const systemMessages = promptManager.getSystemPrompts(sessionState);
      const temperature = promptManager.getTemperature(sessionState);
      
      const prompt: ModelProviderRequest = {
        tools: claudeTools,
        sessionState,
        systemMessages,
        // Include systemMessage for backward compatibility
        systemMessage: systemMessages[0],
        temperature
      };
      
      // Add optional tool_choice if provided
      if (options?.tool_choice) {
        prompt.tool_choice = options.tool_choice;
      }
      
      const response = await modelProvider(prompt);
      
      // Track token usage from response
      if (response.usage) {
        trackTokenUsage(response, sessionState);
      }
      
      return response;
    }
  };
};