#!/usr/bin/env node
/**
 * Command Line Interface for the Agent
 */

import { program } from 'commander';
import { createAgent, createAnthropicProvider, createLogger, LogLevel } from './index';
import readline from 'readline';
import dotenv from 'dotenv';
import { SessionState, ToolResultEntry } from './types';

// Load environment variables from .env file
dotenv.config();

// Get API key from environment
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Chat command functionality, extracted to be reused in default command
const startChat = async (options: { debug?: boolean, model?: string, e2bSandboxId?: string }) => {
  if (!ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
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
  
  // Create the agent
  const agent = createAgent({
    modelProvider,
    environment: { type: options.e2bSandboxId ? 'e2b' : 'local', sandboxId: options.e2bSandboxId || '' },
    logger: createLogger({ 
      level: options.debug ? LogLevel.DEBUG : LogLevel.INFO 
    }),
    permissionUIHandler: {
      async requestPermission(toolId: string, args: Record<string, unknown>): Promise<boolean> {
        return new Promise((resolve) => {
          console.log(`\n[PERMISSION REQUEST] Tool ${toolId} wants to execute with args:`, args);
          console.log('Type "y" to approve or anything else to deny:');
          
          rl.question('> ', (answer) => {
            resolve(answer.toLowerCase() === 'y');
          });
        });
      }
    }
  });
  
  console.log('Agent ready. Type your query (or "exit" to quit, "/help" for help):');
  
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
      console.log('\n=== QCKFX Help ===');
      console.log('Available commands:');
      console.log('  exit - Exit the chat session');
      console.log('  /help - Show this help message');
      console.log('\nUsage:');
      console.log('  Just type your query and the agent will respond');
      console.log('  The agent can perform various tasks using tools');
      console.log('\nParameters:');
      console.log('  -d, --debug       Enable debug logging');
      console.log('  -m, --model       Specify the model to use');
      console.log('  -e, --e2bSandboxId       Specify the E2B sandbox ID to use. If not provided, the agent will run locally.');
      console.log('\n');
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
        console.error(`Error: ${result.error}`);
      } else {
        // Display prettier tool usage information without results
        if (result.result && result.result.toolResults && result.result.toolResults.length > 0) {
          console.log('\n🔧 Tools Used:');
          result.result.toolResults.forEach((toolResult: ToolResultEntry, index: number) => {
            // Format tool call prettily without showing results
            console.log(`  ${index + 1}. ${toolResult.toolId}(${JSON.stringify(toolResult.args, null, 0).replace(/[{}]/g, '')})`); 
          });
          console.log(''); // Empty line for spacing
        }
        
        // Display the response to the user
        if (result.response) {
          console.log(result.response);
          
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
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
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
  .option('-m, --model <model>', 'Model to use', 'claude-3-7-sonnet-20250219')
  .option('-e, --e2bSandboxId <e2bSandboxId>', 'E2B sandbox ID to use, if not provided, the agent will run locally')
  .action(startChat);

// Default command (when no command is specified)
program
  .option('-d, --debug', 'Enable debug logging')
  .option('-m, --model <model>', 'Model to use', 'claude-3-7-sonnet-20250219')
  .option('-e, --e2bSandboxId <e2bSandboxId>', 'E2B sandbox ID to use, if not provided, the agent will run locally')
  .action(startChat);

// Parse command line arguments
program.parse();