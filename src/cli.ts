#!/usr/bin/env node
/**
 * Command Line Interface for the Agent
 */

import { program } from 'commander';
import { createAgent, createAnthropicProvider, createLogger, LogLevel, LogCategory } from './index';
import readline from 'readline';
import dotenv from 'dotenv';
import { SessionState, ToolResultEntry } from './types';
import chalk from 'chalk';

// Load environment variables from .env file
dotenv.config();

// Get API key from environment
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Helper functions for formatting tool calls

/**
 * Formats a single tool call for display
 * @param toolResult - The tool result entry
 * @param index - The index of the tool result
 * @param logger - The logger instance
 */
function formatToolCall(
  toolResult: ToolResultEntry, 
  index: number, 
  logger: { 
    info: (message: string, category: LogCategory, ...args: unknown[]) => void 
  }
): void {
  // Get tool name
  const toolName = chalk.cyan(toolResult.toolId);
  
  // Format arguments in a more readable way
  let formattedArgs = '';
  
  // For file operations, highlight the file path
  if (toolResult.args.file_path || toolResult.args.filepath || toolResult.args.path) {
    const filePath = toolResult.args.file_path || toolResult.args.filepath || toolResult.args.path;
    
    // Show the file path with special formatting
    if (typeof filePath === 'string') {
      formattedArgs = chalk.yellow(filePath);
      
      // If there are other args, append them
      const otherArgs = { ...toolResult.args };
      delete otherArgs.file_path;
      delete otherArgs.filepath;
      delete otherArgs.path;
      
      if (Object.keys(otherArgs).length > 0) {
        const otherArgsStr = Object.entries(otherArgs)
          .map(([key, value]) => {
            // Truncate long string values
            if (typeof value === 'string' && value.length > 30) {
              return `${key}: "${value.substring(0, 30)}..."`;
            }
            return `${key}: ${JSON.stringify(value)}`;
          })
          .join(', ');
        
        if (otherArgsStr.length > 0) {
          formattedArgs += `, ${otherArgsStr}`;
        }
      }
    } else {
      // Fallback to standard formatting
      formattedArgs = formatArgs(toolResult.args);
    }
  } else {
    // Standard argument formatting
    formattedArgs = formatArgs(toolResult.args);
  }
  
  // Log the formatted tool call
  logger.info(`  ${index}. ${toolName}(${formattedArgs})`, LogCategory.TOOLS);
}

/**
 * Formats tool arguments in a more readable way
 * @param args - The tool arguments
 * @returns Formatted arguments string
 */
function formatArgs(args: Record<string, unknown>): string {
  // For simple objects, show key-value pairs with better formatting
  return Object.entries(args)
    .map(([key, value]) => {
      // Format based on type of value
      if (typeof value === 'string') {
        // Truncate long strings
        if (value.length > 50) {
          return `${key}: "${value.substring(0, 50)}..."`;
        }
        return `${key}: "${value}"`;
      } else if (value === null) {
        return `${key}: null`;
      } else if (Array.isArray(value)) {
        if (value.length > 3) {
          return `${key}: [${value.slice(0, 3).join(', ')}, ...]`;
        }
        return `${key}: [${value.join(', ')}]`;
      } else if (typeof value === 'object') {
        return `${key}: {...}`;
      }
      return `${key}: ${value}`;
    })
    .join(', ');
}

/**
 * Creates a summary of tool usage for display
 * @param toolResults - The list of tool results
 * @returns A summary string
 */
function summarizeToolUsage(toolResults: ToolResultEntry[]): string {
  // Count tools by type
  const toolCounts: Record<string, number> = {};
  
  toolResults.forEach(result => {
    const toolId = result.toolId;
    toolCounts[toolId] = (toolCounts[toolId] || 0) + 1;
  });
  
  // Create a summary string
  return Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1]) // Sort by most used
    .map(([tool, count]) => `${count}× ${tool}`)
    .join(', ');
}

// Chat command functionality, extracted to be reused in default command
const startChat = async (options: { debug?: boolean, model?: string, e2bSandboxId?: string, quiet?: boolean }) => {
  // Create a CLI logger first, so we can use it for errors
  const cliLogger = createLogger({ 
    level: options.quiet ? LogLevel.ERROR : (options.debug ? LogLevel.DEBUG : LogLevel.INFO),
    formatOptions: {
      showTimestamp: options.debug,
      showPrefix: true,
      colors: true
    }
  });
  
  if (!ANTHROPIC_API_KEY) {
    cliLogger.error('ANTHROPIC_API_KEY environment variable is required', LogCategory.SYSTEM);
    process.exit(1);
  }
  
  // Create the model provider
  const modelProvider = createAnthropicProvider({
    apiKey: ANTHROPIC_API_KEY,
    model: options.model
  });
  
  // Create readline interface first (needed for permission handling)
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  // We already created the logger above
  
  // Create the agent
  const agent = createAgent({
    modelProvider,
    environment: { type: options.e2bSandboxId ? 'e2b' : 'local', sandboxId: options.e2bSandboxId || '' },
    logger: cliLogger,
    permissionUIHandler: {
      async requestPermission(toolId: string, args: Record<string, unknown>): Promise<boolean> {
        return new Promise((resolve) => {
          cliLogger.info(`Tool ${toolId} wants to execute with args:`, LogCategory.PERMISSIONS, args);
          cliLogger.info('Type "y" to approve or anything else to deny:', LogCategory.PERMISSIONS);
          
          rl.question('> ', (answer) => {
            resolve(answer.toLowerCase() === 'y');
          });
        });
      }
    }
  });
  
  cliLogger.info('Agent ready. Type your query (or "exit" to quit, "/help" for help):', LogCategory.USER_INTERACTION);
  
  // Start conversation loop
  let conversationActive = true;
  let sessionState: SessionState = {
    conversationHistory: [],
  };
  
  while (conversationActive) {
    const query = await new Promise<string>(resolve => {
      rl.question('> ', resolve);
    });
    
    if (query.toLowerCase() === 'exit') {
      conversationActive = false;
      continue;
    }
    
    if (query.toLowerCase() === '/help') {
      cliLogger.info('\n=== QCKFX Help ===', LogCategory.USER_INTERACTION);
      cliLogger.info('Available commands:', LogCategory.USER_INTERACTION);
      cliLogger.info('  exit - Exit the chat session', LogCategory.USER_INTERACTION);
      cliLogger.info('  /help - Show this help message', LogCategory.USER_INTERACTION);
      cliLogger.info('\nUsage:', LogCategory.USER_INTERACTION);
      cliLogger.info('  Just type your query and the agent will respond', LogCategory.USER_INTERACTION);
      cliLogger.info('  The agent can perform various tasks using tools', LogCategory.USER_INTERACTION);
      cliLogger.info('\nParameters:', LogCategory.USER_INTERACTION);
      cliLogger.info('  -d, --debug       Enable debug logging', LogCategory.USER_INTERACTION);
      cliLogger.info('  -q, --quiet       Minimal output, show only errors and results', LogCategory.USER_INTERACTION);
      cliLogger.info('  -m, --model       Specify the model to use', LogCategory.USER_INTERACTION);
      cliLogger.info('  -e, --e2bSandboxId       Specify the E2B sandbox ID to use. If not provided, the agent will run locally.', LogCategory.USER_INTERACTION);
      cliLogger.info('\n', LogCategory.USER_INTERACTION);
      continue;
    }
    
    try {
      // Add user query to conversation history in the format expected by Claude
      sessionState.conversationHistory.push({
        role: "user",
        content: [
          { type: "text", text: query, citations: null }
        ]
      });
      
      // Process the query
      const result = await agent.processQuery(query, sessionState);
      
      if (result.error) {
        cliLogger.error(`Error: ${result.error}`, LogCategory.SYSTEM);
      } else {
        // Display prettier tool usage information without results
        if (!options.quiet && result.result && result.result.toolResults && result.result.toolResults.length > 0) {
          // Only show a summary initially if there are many tool calls
          const toolResults = result.result.toolResults;
          const totalTools = toolResults.length;
          
          if (totalTools > 5) {
            cliLogger.info(`\n🔧 ${totalTools} tools used (${summarizeToolUsage(toolResults)})`, LogCategory.TOOLS);
            
            // Show first and last tool call as a preview
            formatToolCall(toolResults[0], 1, cliLogger);
            cliLogger.info(`  ... ${totalTools - 2} more tools ...`, LogCategory.TOOLS);
            formatToolCall(toolResults[totalTools - 1], totalTools, cliLogger);
          } else {
            cliLogger.info('\n🔧 Tools Used:', LogCategory.TOOLS);
            toolResults.forEach((toolResult, index) => {
              formatToolCall(toolResult, index + 1, cliLogger);
            });
          }
          
          cliLogger.info('', LogCategory.TOOLS); // Empty line for spacing
        }
        
        // Display the response to the user
        if (result.response) {
          cliLogger.info(result.response, LogCategory.USER_INTERACTION);
          
          // Update session state for the next iteration
          // Keep our conversation history from the current session state
          const currentConversationHistory = sessionState.conversationHistory || [];
          
          // Update session state with the result
          sessionState = {
            ...result.sessionState,
            conversationHistory: currentConversationHistory,
            history: sessionState.history
          };
        }
      }
    } catch (error) {
      cliLogger.error(`Error: ${error instanceof Error ? error.message : String(error)}`, error, LogCategory.SYSTEM);
    }
  }
  
  rl.close();
};

// Setup command line interface
program
  .name('qckfx')
  .description('AI Agent CLI')
  .version('0.1.0');

// Chat command 
program
  .command('chat')
  .description('Start a conversation with the agent')
  .option('-d, --debug', 'Enable debug logging')
  .option('-q, --quiet', 'Minimal output, show only errors and results')
  .option('-m, --model <model>', 'Model to use', 'claude-3-7-sonnet-20250219')
  .option('-e, --e2bSandboxId <e2bSandboxId>', 'E2B sandbox ID to use, if not provided, the agent will run locally')
  .action(startChat);

// Default command (when no command is specified)
program
  .option('-d, --debug', 'Enable debug logging')
  .option('-q, --quiet', 'Minimal output, show only errors and results')
  .option('-m, --model <model>', 'Model to use', 'claude-3-7-sonnet-20250219')
  .option('-e, --e2bSandboxId <e2bSandboxId>', 'E2B sandbox ID to use, if not provided, the agent will run locally')
  .action(startChat);

// Parse command line arguments
program.parse();