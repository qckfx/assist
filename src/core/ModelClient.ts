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
import { ToolDescription } from '../types/registry';
import { trackTokenUsage } from '../utils/TokenManager';

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
      sessionState: SessionState = { conversationHistory: [] }
    ): Promise<ToolCallResponse> {
      // Format tools for Claude
      const claudeTools = this.formatToolsForClaude(toolDescriptions);
      
      // Build conversation history from sessionState
      const conversationHistory = sessionState.conversationHistory || [];
      
      // Create a system message with instructions about tool usage
      const systemMessage = "You are an AI assistant that helps with codebase exploration. " +
                 "Review previous tool calls before deciding what to do next. " +
                 "Avoid repeating the same tool calls with the same parameters. " +
                 "Pay close attention to tool parameter requirements. " +
                 "When using tools, ensure all parameters match the expected types and formats. " +
                 (sessionState.lastToolError ? 
                   `In your last tool call to ${sessionState.lastToolError.toolId}, ` +
                   `you encountered this error: "${sessionState.lastToolError.error}". ` +
                   "Please correct your approach accordingly." : "") +
                 "If a tool fails due to invalid arguments, carefully read the error message and fix your approach.";
      
      // Prepare the request for AnthropicProvider
      const request: ModelProviderRequest = {
        query: query,
        tools: claudeTools,
        tool_choice: { type: "auto" },
        encourageToolUse: true,
        systemMessage: systemMessage,
        // Pass the conversation history in a way AnthropicProvider can use
        messages: conversationHistory
      };
      
      // Call the model provider
      const response = await modelProvider(request);
      
      // Track token usage from response
      if (response.usage) {
        trackTokenUsage(response, sessionState);
      }
      
      // Check if Claude wants to use a tool - look for tool_use in the content
      const hasTool = response.content && response.content.some(c => c.type === "tool_use");
      
      if (hasTool) {
        // Extract the tool use from the response
        const toolUse = response.content && response.content.find(c => c.type === "tool_use");
        
        // Add the assistant's tool use response to the conversation history
        if (sessionState.conversationHistory && toolUse) {
          sessionState.conversationHistory.push({
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: toolUse.id,
                name: toolUse.name,
                input: toolUse.input || {}
              }
            ]
          });
        }
        
        if (toolUse) {
          return {
            toolCall: {
              toolId: toolUse.name || "",
              args: toolUse.input || {},
              toolUseId: toolUse.id || "", // Save this for returning results
            },
            toolChosen: true
          };
        }
      }
      
      return {response: response, toolChosen: false};
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
      sessionState: SessionState = { conversationHistory: [] }
    ): Promise<Anthropic.Messages.Message> {
      // Format tools for Claude
      const claudeTools = this.formatToolsForClaude(toolDescriptions);
      
      const prompt: ModelProviderRequest = {
        tools: claudeTools,
        messages: sessionState.conversationHistory,
        responseType: 'user_message'
      };
      
      // If there was a tool error, modify the prompt to include guidance
      if (sessionState.lastToolError) {
        prompt.errorGuidance = true;
        prompt.toolErrorContext = {
          toolId: sessionState.lastToolError.toolId,
          error: sessionState.lastToolError.error,
          args: sessionState.lastToolError.args
        };
      }
      
      // If this is an exploration session, encourage detailed responses
      if (sessionState.isExplorationSession || sessionState.shouldExplore) {
        prompt.encourageDetailedResponse = true;
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