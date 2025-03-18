/**
 * AgentRunner - Orchestrates the entire agent process
 */

import { 
  AgentRunner, 
  AgentRunnerConfig, 
  ConversationResult, 
  ProcessQueryResult, 
  ToolResultEntry 
} from '../types/agent';
import { ToolCall, ConversationMessage, SessionState } from '../types/model';
import { manageConversationSize } from '../utils/TokenManager';
import { LogCategory } from '../utils/logger';

/**
 * Helper function to create a concise summary of tool arguments
 * @param args The arguments to summarize
 * @returns A concise string representation of the arguments
 */
function summarizeArgs(args: Record<string, unknown>): string {
  // Handle file paths specially
  if (args.file_path || args.filepath || args.path) {
    const filePath = (args.file_path || args.filepath || args.path) as string;
    const otherArgs = { ...args };
    delete otherArgs.file_path;
    delete otherArgs.filepath;
    delete otherArgs.path;
    
    if (Object.keys(otherArgs).length > 0) {
      return `${filePath} + ${Object.keys(otherArgs).length} more args`;
    } else {
      return filePath;
    }
  }
  
  // For pattern-based tools
  if (args.pattern) {
    return `pattern: ${args.pattern}${args.include ? `, include: ${args.include}` : ''}`;
  }
  
  // For command execution
  if (args.command) {
    const cmd = args.command as string;
    return cmd.length > 30 ? `${cmd.substring(0, 30)}...` : cmd;
  }
  
  // Default case - list all args with their types
  return Object.entries(args)
    .map(([key, val]) => {
      if (typeof val === 'string') {
        if (val.length > 20) {
          return `${key}: "${val.substring(0, 20)}..."`;
        }
        return `${key}: "${val}"`;
      } else if (Array.isArray(val)) {
        return `${key}: [${val.length} items]`;
      } else if (typeof val === 'object' && val !== null) {
        return `${key}: {object}`;
      }
      return `${key}: ${val}`;
    })
    .join(', ');
}

/**
 * Creates an agent runner to orchestrate the agent process
 * @param config - Configuration options
 * @returns The agent runner interface
 */
export const createAgentRunner = (config: AgentRunnerConfig): AgentRunner => {
  // Validate required dependencies
  if (!config.modelClient) throw new Error('AgentRunner requires a modelClient');
  if (!config.toolRegistry) throw new Error('AgentRunner requires a toolRegistry');
  if (!config.permissionManager) throw new Error('AgentRunner requires a permissionManager');
  if (!config.executionAdapter) throw new Error('AgentRunner requires an executionAdapter');
  // Dependencies
  const modelClient = config.modelClient;
  const toolRegistry = config.toolRegistry;
  const permissionManager = config.permissionManager;
  const executionAdapter = config.executionAdapter;
  const logger = config.logger || console;
  
  // Return the public interface
  return {
    /**
     * Process a user query
     * @param query - The user's query
     * @param sessionState - Current session state 
     * @returns The result of processing the query
     * 
     * NOTE: The query is always appended to the end of the conversation 
     * history before this call is made.
     */
    async processQuery(query: string, sessionState: SessionState): Promise<ProcessQueryResult> {
      try {
        // Initialize tracking variables
        let currentQuery = query;
        const toolResults: ToolResultEntry[] = [];
        let finalResponse = null;
        const maxIterations = 15; // Prevent infinite loops
        let iterations = 0;
        
        // Initialize conversation history if it doesn't exist
        if (!sessionState.conversationHistory) {
          sessionState.conversationHistory = [];
        }
        
        // Manage conversation size to prevent token limit issues
        // Do this before adding the new query to avoid trimming it
        if (sessionState.tokenUsage) {
          logger.debug('Managing conversation size before processing query', LogCategory.SYSTEM);
          manageConversationSize(sessionState, 60000, logger);
        }
        
        // Add the user query to conversation history if it's not already there
        if (sessionState.conversationHistory.length === 0 || 
            sessionState.conversationHistory[sessionState.conversationHistory.length - 1].role !== 'user') {
          sessionState.conversationHistory.push({
            role: 'user',
            content: [{ type: 'text', text: query }]
          });
        }
        
        // Create the context for tool execution
        const context = {
          permissionManager,
          sessionState,
          logger,
          toolRegistry,
          modelClient,
          executionAdapter
        };
        
        // Loop until we get a final response or reach max iterations
        while (iterations < maxIterations) {
          iterations++;
          logger.debug(`Iteration ${iterations}/${maxIterations}`, LogCategory.SYSTEM);
          
          try {
            // 1. Ask the model what to do next
            logger.debug('Getting tool call from model', LogCategory.MODEL);
            
            const toolCallChat = await modelClient.getToolCall(
              currentQuery, 
              toolRegistry.getToolDescriptions(), 
              sessionState
            );
            // If the model doesn't want to use a tool, it's ready to respond
            if (!toolCallChat.toolChosen) {
              logger.debug('Model chose not to use a tool, generating final response', LogCategory.MODEL);
              
              finalResponse = toolCallChat.response;
              
              break; // Exit the loop
            }

            const toolCall = toolCallChat.toolCall as ToolCall;
            
            // 2. Get the chosen tool
            logger.debug(`Model selected tool: ${toolCall.toolId}`, LogCategory.MODEL);
            const tool = toolRegistry.getTool(toolCall.toolId);
            if (!tool) {
              throw new Error(`Tool ${toolCall.toolId} not found`);
            }
            
            // Store the toolId, toolUseId, and args in the session state
            sessionState.lastToolId = toolCall.toolId;
            sessionState.lastToolUseId = toolCall.toolUseId;
            sessionState.lastArgs = toolCall.args;
            delete sessionState.lastToolError;
            
            // 3. Execute the tool
            const argSummary = summarizeArgs(toolCall.args as Record<string, unknown>);
            logger.debug(`Executing tool ${tool.name} with args: ${argSummary}`, LogCategory.TOOLS);
            let result;
            try {
              result = await tool.execute(toolCall.args as Record<string, unknown>, context);
            } catch (error: unknown) {
              // Handle validation errors specifically
              const errorObj = error as Error;
              if (errorObj.message && errorObj.message.includes('Invalid args')) {
                logger.warn(`Tool argument error: ${errorObj.message}`, LogCategory.TOOLS);
                
                // Store the error in state for the model to learn from
                sessionState.lastToolError = {
                  toolId: toolCall.toolId,
                  args: toolCall.args as Record<string, unknown>,
                  error: errorObj.message
                };
                
                // Ask the model to fix the arguments
                const fixPrompt = `The tool ${tool.name} reported an error: "${errorObj.message}"
                                  Please provide corrected arguments for this tool to answer the query: ${query}
                                  Previous incorrect args: ${JSON.stringify(toolCall.args)}`;
                
                // Modify the current query for the next iteration
                currentQuery = fixPrompt;

                sessionState.conversationHistory.push({
                  role: 'user',
                  content: [
                    { type: 'tool_result', tool_use_id: toolCall.toolUseId, content: fixPrompt } 
                  ]
                });
                
                // Skip the rest of this iteration
                continue;
              } else {
                // For other errors, rethrow
                throw error;
              }
            }
            
            // 4. Update state with result
            sessionState.lastResult = result;
            
            // Add tool result to conversation history if it exists
            if (sessionState.conversationHistory && toolCall.toolUseId) {
              sessionState.conversationHistory.push({
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    tool_use_id: toolCall.toolUseId,
                    content: JSON.stringify(result)
                  } 
                ]
              });
            }
            
            // 5. Add to the list of tool results
            toolResults.push({
              toolId: toolCall.toolId,
              args: toolCall.args as Record<string, unknown>,
              result,
              toolUseId: toolCall.toolUseId
            });
            
            // Ask the model to decide what to do next
            currentQuery = `Based on the result of using ${tool.name}, what should I do next to answer: ${query}`;
          } catch (error: unknown) {
            logger.error(`Error in iteration ${iterations}:`, error, LogCategory.SYSTEM);
            
            // If we have at least one tool result, try to generate a response
            if (toolResults.length > 0) {
              logger.debug('Generating response from partial results due to error', LogCategory.MODEL);
              
              finalResponse = await modelClient.generateResponse(
                query,
                toolRegistry.getToolDescriptions(),
                sessionState
              );
              
              break;
            } else {
              // If we have no results, propagate the error
              throw error;
            }
          }
        }
        
        // If we reached max iterations without a response, generate one
        if (!finalResponse) {
          logger.debug('Reached maximum iterations, generating response', LogCategory.MODEL);
          
          finalResponse = await modelClient.generateResponse(
            query,
            toolRegistry.getToolDescriptions(),
            sessionState
          );
        }

        // Add the assistant's response to conversation history
        if (finalResponse && finalResponse.content && finalResponse.content.length > 0) {
          (sessionState.conversationHistory as ConversationMessage[]).push({
            role: 'assistant',
            content: finalResponse.content
          });
        }
        
        // Extract the text response from the first content item
        let responseText = '';
        if (finalResponse && finalResponse.content && finalResponse.content.length > 0) {
          const firstContent = finalResponse.content[0];
          if (firstContent.type === 'text' && firstContent.text) {
            responseText = firstContent.text;
          }
        }
        
        return {
          result: {
            toolResults,
            iterations
          },
          response: responseText,
          sessionState,
          done: true
        };
      } catch (error: unknown) {
        logger.error('Error in processQuery:', error, LogCategory.SYSTEM);
        return {
          error: (error as Error).message,
          sessionState,
          done: true
        };
      }
    },
    
    /**
     * Run a conversation loop until completion
     * @param initialQuery - The initial user query
     * @returns The final result
     */
    async runConversation(initialQuery: string): Promise<ConversationResult> {
      let query = initialQuery;
      let sessionState: Record<string, unknown> = { conversationHistory: [] };
      let done = false;
      const responses: string[] = [];
      
      while (!done) {
        // Manage conversation size before starting a new loop
        if (sessionState.tokenUsage) {
          logger.debug('Managing conversation size before starting new conversation loop', LogCategory.SYSTEM);
          manageConversationSize(sessionState as SessionState, 60000, logger);
        }
        
        const result = await this.processQuery(query, sessionState);
        
        if (result.error) {
          logger.error('Error in conversation:', result.error, LogCategory.SYSTEM);
          responses.push(`Error: ${result.error}`);
          break;
        }
        
        if (result.response) {
          responses.push(result.response);
        }
        
        sessionState = result.sessionState;
        done = result.done;
        
        // If not done, we would get the next user query here
        // For automated runs, we'd need to handle this differently
        if (!done) {
          // In a real implementation, this would wait for user input
          query = 'Continue'; // Placeholder
        }
      }
      
      return {
        responses,
        sessionState
      };
    }
  };
};