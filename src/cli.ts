#!/usr/bin/env node
/**
 * Command Line Interface for the Agent
 */

import { program } from 'commander';
import { createAgent, createAnthropicProvider, createLogger, LogLevel, LogCategory, startServer, createServerConfig } from './index';
import dotenv from 'dotenv';
import { SessionState, ToolResultEntry } from './types';
import chalk from 'chalk';
import prompts from 'prompts';
import path from 'path';
import fs from 'fs';
import { loadTestCases, generateReport } from './eval/utils/metrics';
import { runEnhancedEvaluation } from './eval/runners/enhanced-evaluation-runner';
import { testCases, getQuickTestCases } from './eval/models/test-cases';
import { runJudge, JudgeOptions } from './eval/runners/judge-runner';
import { loadExampleByCategory } from './eval/models/evaluation-examples';
import { AgentExecutionHistory, TestRunWithHistory } from './eval/models/types';

// Load environment variables from .env file
dotenv.config();

// Get API key from environment
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Helper functions for formatting tool calls

// Define a minimal spinner interface
interface Spinner {
  start: () => void;
  succeed: (text?: string) => void;
  fail: (text?: string) => void;
}

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
const startChat = async (options: { 
  debug?: boolean, 
  model?: string, 
  e2bSandboxId?: string, 
  quiet?: boolean,
  web?: boolean,
  port?: number,
  dev?: boolean
}) => {
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

  // Create server config from CLI options
  const serverConfig = createServerConfig({
    web: options.web,
    port: options.port,
    development: options.dev || process.env.NODE_ENV === 'development',
  });

  // Start the server if enabled
  let server: { close: () => Promise<void>; url: string } | null = null;
  if (serverConfig.enabled) {
    try {
      server = await startServer(serverConfig);
      cliLogger.info(`Web UI available at ${server.url}`, LogCategory.SYSTEM);
    } catch (error) {
      // Log detailed error in development mode, more concise in production
      if (process.env.NODE_ENV === 'development') {
        cliLogger.error(`Failed to start web UI server: ${error instanceof Error ? error.message : String(error)}`, LogCategory.SYSTEM);
        if (error instanceof Error && 'cause' in error && error.cause) {
          cliLogger.debug('Caused by:', error.cause, LogCategory.SYSTEM);
        }
      } else {
        cliLogger.error('Failed to start web UI server. Run with NODE_ENV=development for details.', LogCategory.SYSTEM);
      }
    }
  }

  // Set up graceful shutdown handling
  let isShuttingDown = false;
  const handleShutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    cliLogger.info('Shutting down...', LogCategory.SYSTEM);
    
    // Close the server if it was started
    if (server) {
      try {
        cliLogger.debug('Closing web server...', LogCategory.SYSTEM);
        await server.close();
        cliLogger.debug('Web server closed', LogCategory.SYSTEM);
      } catch (error) {
        cliLogger.error('Error shutting down web UI server:', error, LogCategory.SYSTEM);
      }
    }

    process.exit(0);
  };

  // Handle termination signals
  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);
  
  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    cliLogger.error('Uncaught exception:', error, LogCategory.SYSTEM);
    
    // Close the server if it was started
    if (server) {
      try {
        await server.close();
      } catch (closeError) {
        cliLogger.error(`Error shutting down web UI server: ${closeError instanceof Error ? closeError.message : String(closeError)}`, LogCategory.SYSTEM);
      }
    }
    
    process.exit(1);
  });
  
  // Create the model provider
  const modelProvider = createAnthropicProvider({
    apiKey: ANTHROPIC_API_KEY,
    model: options.model
  });
  
  // We already created the logger above
  
  // Create the agent with a prompts-based permission handler
  const agent = createAgent({
    modelProvider,
    environment: { type: options.e2bSandboxId ? 'e2b' : 'local', sandboxId: options.e2bSandboxId || '' },
    logger: cliLogger,
    permissionUIHandler: {
      async requestPermission(toolId: string, args: Record<string, unknown>): Promise<boolean> {
        cliLogger.info(`Tool ${toolId} wants to execute with args:`, LogCategory.PERMISSIONS, args);
        
        // Use prompts for permission handling too
        const response = await prompts({
          type: 'confirm',
          name: 'granted',
          message: 'Do you approve this action?',
          initial: false
        });
        
        return response.granted === true;
      }
    }
  });
  
  // We'll keep track of the session state
  let conversationActive = true;
  let sessionState: SessionState = {
    conversationHistory: [],
  };
  
  cliLogger.info('Agent ready. Type your query (or "exit" to quit, "/help" for help):', LogCategory.USER_INTERACTION);
  
  while (conversationActive) {
    cliLogger.debug('--------- NEW TURN: Waiting for user input... ---------', LogCategory.USER_INTERACTION);
    
    // Use prompts for interactive input - onCancel is an option, not a prompt property
    const response = await prompts({
      type: 'text',
      name: 'query',
      message: chalk.blue('🧑'),
    }, {
      onCancel: () => {
        cliLogger.info('Cancelled by user', LogCategory.USER_INTERACTION);
        conversationActive = false;
        return false;
      }
    });
    
    // Check if we got a response
    if (!response.query) {
      if (conversationActive) {
        cliLogger.info('Empty input received, exiting...', LogCategory.USER_INTERACTION);
      }
      conversationActive = false;
      continue;
    }
    
    const query = response.query;
    cliLogger.debug(`Processing input: "${query}"`, LogCategory.USER_INTERACTION);
    
    // Handle special commands
    if (query.toLowerCase() === 'exit') {
      cliLogger.info('Exiting...', LogCategory.SYSTEM);
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
      cliLogger.info('  --web             Enable web UI (default: true)', LogCategory.USER_INTERACTION);
      cliLogger.info('  --no-web          Disable web UI', LogCategory.USER_INTERACTION);
      cliLogger.info('  --port <port>     Port for web UI (default: 3000)', LogCategory.USER_INTERACTION);
      cliLogger.info('  --dev             Run in development mode with additional logging', LogCategory.USER_INTERACTION);
      cliLogger.info('\nEvaluation Commands:', LogCategory.USER_INTERACTION);
      cliLogger.info('  qckfx eval run    Run evaluation test cases', LogCategory.USER_INTERACTION);
      cliLogger.info('  qckfx eval list   List available test cases', LogCategory.USER_INTERACTION);
      cliLogger.info('  qckfx eval judge  Run AI judge on execution histories', LogCategory.USER_INTERACTION);
      cliLogger.info('  qckfx eval report Generate reports from evaluation results', LogCategory.USER_INTERACTION);
      cliLogger.info('\nWeb UI Development:', LogCategory.USER_INTERACTION);
      cliLogger.info('  npm run dev:ui     Start the Vite development server for UI development', LogCategory.USER_INTERACTION);
      cliLogger.info('  npm run dev        Start both backend and frontend in development mode', LogCategory.USER_INTERACTION);
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
      
      // Show spinner during processing
      let spinner: Spinner = { 
        start: () => {}, 
        succeed: () => {}, 
        fail: () => {} 
      };
      let result;
      
      try {
        // Dynamically import ora
        const ora = (await import('ora')).default;
        spinner = ora({
          text: 'Thinking...',
          color: 'blue',
        }).start();
        
        // Process the query
        result = await agent.processQuery(query, sessionState);
        spinner.succeed('Response ready');
      } catch (error) {
        // Make sure spinner is stopped on error
        spinner.fail('Processing failed');
        throw error;
      }
      
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
          // Add a visual marker for the assistant's response
          const assistantLabel = chalk.green('🤖 ');
          cliLogger.info(`${assistantLabel}${result.response}`, LogCategory.USER_INTERACTION);
          
          // Add the assistant's response to the conversation history
          sessionState.conversationHistory.push({
            role: "assistant",
            content: [
              { type: "text", text: result.response, citations: null }
            ]
          });
          
          // Update the session state with other values from the result
          sessionState = {
            ...result.sessionState,
            conversationHistory: sessionState.conversationHistory, // Keep our updated conversation history
          };
        }
      }
    } catch (error) {
      cliLogger.error(`Error: ${error instanceof Error ? error.message : String(error)}`, error, LogCategory.SYSTEM);
    }
  }
  
  // Gracefully shut down
  await handleShutdown();
};

// Setup command line interface
program
  .name('qckfx')
  .description('AI Agent CLI with evaluation capabilities')
  .version('0.1.0')
  .addHelpText('after', `
Examples:
  # Start a chat session with the AI agent
  qckfx

  # Run evaluation with default settings
  qckfx eval run
  
  # List available test cases
  qckfx eval list
  
  # Run quick evaluation (subset of tests)
  qckfx eval run --quick
  
  # Generate a report from evaluation results
  qckfx eval report ./evaluation-results
  
Documentation:
  For more information, see the documentation or run 'qckfx <command> --help'
`);

// Chat command 
program
  .command('chat')
  .description('Start a conversation with the agent')
  .option('-d, --debug', 'Enable debug logging')
  .option('-q, --quiet', 'Minimal output, show only errors and results')
  .option('-m, --model <model>', 'Model to use', 'claude-3-7-sonnet-20250219')
  .option('-e, --e2bSandboxId <e2bSandboxId>', 'E2B sandbox ID to use, if not provided, the agent will run locally')
  .option('--web', 'Enable web UI (default: true)')
  .option('--no-web', 'Disable web UI')
  .option('--port <port>', 'Port for web UI', (value) => parseInt(value, 10))
  .option('--dev', 'Run in development mode with additional logging and features')
  .action(startChat);

// Default command (when no command is specified)
program
  .option('-d, --debug', 'Enable debug logging')
  .option('-q, --quiet', 'Minimal output, show only errors and results')
  .option('-m, --model <model>', 'Model to use', 'claude-3-7-sonnet-20250219')
  .option('-e, --e2bSandboxId <e2bSandboxId>', 'E2B sandbox ID to use, if not provided, the agent will run locally')
  .option('--web', 'Enable web UI (default: true)')
  .option('--no-web', 'Disable web UI')
  .option('--port <port>', 'Port for web UI', (value) => parseInt(value, 10))
  .option('--dev', 'Run in development mode with additional logging and features')
  .action(startChat);

// Setup evaluation commands
function setupEvaluationCommands() {
  const evalCommand = program
    .command('eval')
    .description('Evaluation tools for the agent')
    .addHelpText('after', `
Evaluation System Commands:

  run     Run evaluation tests with AI judge capabilities
  list    List available test cases
  judge   Run AI judge on existing execution histories
  report  Generate reports from evaluation results

Examples:
  # Run all tests with default settings
  qckfx eval run
  
  # Run a quick evaluation (subset of tests)
  qckfx eval run --quick
  
  # Run with custom test configuration
  qckfx eval run --config ./my-tests.json
  
  # List all available test cases
  qckfx eval list
  
  # Generate a report from evaluation results
  qckfx eval report ./evaluation-results
`);

  // Run command
  evalCommand
    .command('run')
    .description('Run evaluation test cases')
    .option('-o, --output <directory>', 'Directory to save evaluation results', path.join(process.cwd(), 'evaluation-results'))
    .option('-q, --quick', 'Run a smaller subset of tests (one per category)')
    .option('-r, --runs <number>', 'Number of runs per test case', (value) => parseInt(value, 10))
    .option('-c, --concurrency <number>', 'Number of parallel test executions', (value) => parseInt(value, 10), 2)
    .option('--no-judge', 'Disable AI judge evaluation')
    .option('--no-compare', 'Disable comparison between multiple runs')
    .option('--config <path>', 'Path to test configuration file')
    .action(async (options) => {
      console.log(chalk.blue('Starting agent evaluation...'));
      console.log(chalk.blue('======================================'));
      
      // Set up Anthropic provider
      const modelProvider = createAnthropicProvider({
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: 'claude-3-7-sonnet-20250219'
      });
      
      // Default: 3 runs for full mode, 1 run for quick mode unless explicitly specified
      const runsPerTest = options.runs !== undefined ? options.runs : (options.quick ? 1 : 3);
      
      // Determine which test cases to run
      let selectedTests = options.quick ? getQuickTestCases() : testCases;
      
      // If config file is provided, load test cases from there
      if (options.config) {
        const configPath = path.resolve(options.config);
        console.log(chalk.blue(`Loading test cases from ${configPath}`));
        const configTests = loadTestCases(configPath);
        
        if (configTests.length > 0) {
          selectedTests = configTests;
          console.log(chalk.blue(`Loaded ${configTests.length} test cases from configuration`));
        } else {
          console.warn(chalk.yellow('No test cases found in configuration file, using default tests'));
        }
      }
      
      // Log evaluation settings
      console.log(chalk.blue(`Output directory: ${options.output}`));
      console.log(chalk.blue(`Mode: ${options.quick ? 'Quick (subset of tests)' : 'Full (all tests)'}`));
      console.log(chalk.blue(`Runs per test: ${runsPerTest}`));
      console.log(chalk.blue(`Concurrency: ${options.concurrency}`));
      console.log(chalk.blue(`AI Judge: ${options.judge ? 'Enabled' : 'Disabled'}`));
      console.log(chalk.blue(`Run comparison: ${(options.judge && options.compare && runsPerTest > 1) ? 'Enabled' : 'Disabled'}`));
      console.log(chalk.blue(`Test cases: ${selectedTests.length}`));
      console.log(chalk.blue('======================================'));
      
      try {
        // Run the evaluation
        const results = await runEnhancedEvaluation(selectedTests, modelProvider, {
          enableJudge: options.judge,
          runsPerTest: runsPerTest,
          concurrency: options.concurrency,
          outputDir: options.output,
          compareRuns: options.judge && options.compare && runsPerTest > 1
        });
        
        console.log(chalk.green('======================================'));
        console.log(chalk.green('Evaluation completed successfully!'));
        console.log(chalk.green(`Total runs: ${results.runs.length}`));
        console.log(chalk.green(`Output directory: ${results.outputDir}`));
        
        // Log judgment statistics if enabled
        if (options.judge) {
          const runsWithJudgment = results.runs.filter(run => run.judgment);
          console.log(chalk.green(`Runs with judgment: ${runsWithJudgment.length}/${results.runs.length}`));
          
          // Calculate average scores if available
          if (runsWithJudgment.length > 0 && runsWithJudgment[0].judgment) {
            console.log(chalk.green('Average scores:'));
            
            const firstJudgment = runsWithJudgment[0].judgment;
            if (firstJudgment && firstJudgment.scores) {
              const dimensions = Object.keys(firstJudgment.scores);
              
              dimensions.forEach(dimension => {
                const sum = runsWithJudgment.reduce((acc, run) => {
                  if (run.judgment && run.judgment.scores) {
                    // Safe access with type guard
                    const score = run.judgment.scores[dimension as keyof typeof run.judgment.scores];
                    return acc + (typeof score === 'number' ? score : 0);
                  }
                  return acc;
                }, 0);
                
                const avgScore = (sum / runsWithJudgment.length).toFixed(2);
                console.log(chalk.green(`- ${dimension}: ${avgScore}`));
              });
            }
          }
        }
        
        console.log(chalk.green('======================================'));
      } catch (error) {
        console.error(chalk.red('Evaluation failed:'), error);
        process.exit(1);
      }
    });

  // List command
  evalCommand
    .command('list')
    .description('List available test cases')
    .option('--config <path>', 'Path to test configuration file')
    .action((options) => {
      let testsToList = testCases;
      
      // If config file is provided, load test cases from there
      if (options.config) {
        const configPath = path.resolve(options.config);
        console.log(chalk.blue(`Loading test cases from ${configPath}`));
        const configTests = loadTestCases(configPath);
        
        if (configTests.length > 0) {
          testsToList = configTests;
          console.log(chalk.blue(`Loaded ${configTests.length} test cases from configuration`));
        } else {
          console.warn(chalk.yellow('No test cases found in configuration file, using default tests'));
        }
      }
      
      console.log(chalk.blue('Available test cases:'));
      console.log(chalk.blue('===================='));
      
      testsToList.forEach((testCase, index) => {
        console.log(chalk.green(`${index + 1}. ${testCase.name} (${testCase.id})`));
        console.log(`   Type: ${testCase.type}`);
        console.log(`   Instructions: ${testCase.instructions.substring(0, 100)}${testCase.instructions.length > 100 ? '...' : ''}`);
        console.log('--------------------');
      });
    });

  // Judge command
  evalCommand
    .command('judge')
    .description('Run AI judge on existing evaluation results')
    .argument('<historyPath>', 'Path to the execution history file or directory')
    .option('-o, --output <file>', 'Path to save judgment report')
    .option('--examples', 'Use examples for calibration')
    .option('--category <category>', 'Category for example calibration (file-search, bug-fixing, api-integration)')
    .action(async (historyPath, options) => {
      try {
        const resolvedPath = path.resolve(historyPath);
        console.log(chalk.blue(`Loading execution history from ${resolvedPath}`));
        
        // Set up Anthropic provider
        const modelProvider = createAnthropicProvider({
          apiKey: process.env.ANTHROPIC_API_KEY || '',
          model: 'claude-3-7-sonnet-20250219'
        });
        
        // Check if the path exists
        if (!fs.existsSync(resolvedPath)) {
          console.error(chalk.red(`Path does not exist: ${resolvedPath}`));
          process.exit(1);
        }
        
        // Determine if it's a file or directory
        const isDirectory = fs.lstatSync(resolvedPath).isDirectory();
        const historyFiles: string[] = [];
        
        if (isDirectory) {
          // Get all .json files in the directory
          const files = fs.readdirSync(resolvedPath);
          historyFiles.push(...files
            .filter(file => file.endsWith('.json'))
            .map(file => path.join(resolvedPath, file))
          );
          
          console.log(chalk.blue(`Found ${historyFiles.length} history files in directory`));
        } else {
          // Just use the single file
          historyFiles.push(resolvedPath);
        }
        
        // Ensure we have at least one history file
        if (historyFiles.length === 0) {
          console.error(chalk.red('No history files found'));
          process.exit(1);
        }
        
        console.log(chalk.blue('Running AI judge evaluation...'));
        
        // Set up examples if requested
        let judgeOptions: JudgeOptions = {};
        
        if (options.examples) {
          const category = options.category || 'file-search';
          console.log(chalk.blue(`Loading examples for category: ${category}`));
          
          const examples = loadExampleByCategory(category);
          if (examples) {
            judgeOptions.examples = examples;
            console.log(chalk.blue('Examples loaded successfully'));
          } else {
            console.warn(chalk.yellow(`No examples found for category: ${category}`));
          }
        }
        
        // Process each history file
        const judgmentResults: TestRunWithHistory[] = [];
        
        for (const [index, historyFile] of historyFiles.entries()) {
          console.log(chalk.blue(`Processing file ${index + 1}/${historyFiles.length}: ${path.basename(historyFile)}`));
          
          try {
            // Read and parse the history file
            const historyContent = fs.readFileSync(historyFile, 'utf8');
            const historyData = JSON.parse(historyContent);
            
            // Extract execution history and task
            if (!historyData.metadata || !historyData.metadata.task) {
              console.warn(chalk.yellow(`File ${historyFile} has no task information, skipping`));
              continue;
            }
            
            const executionHistory: AgentExecutionHistory = {
              metadata: historyData.metadata,
              toolCalls: historyData.toolCalls || []
            };
            
            const task = historyData.metadata.task;
            
            // Run the judge
            console.log(chalk.blue('Sending to AI judge for evaluation...'));
            // Create a compatible adapter for the model provider
            const judgeModelProvider = {
              processQuery: async (prompt: string, options: any) => {
                // Map to AnthropicProvider format
                // We need to adapt the AnthropicProvider (which expects ModelProviderRequest)
                // to the judge's ModelProvider interface (which expects a simple prompt string)
                const result = await modelProvider({
                  messages: [
                    { 
                      role: "user", 
                      content: [
                        { type: "text", text: prompt }
                      ]
                    }
                  ],
                  systemMessage: "You are a judge evaluating an AI agent's performance. Provide detailed feedback on strengths and weaknesses."
                });
                
                // Find the text content in the response
                let responseText = "";
                if (result.content && result.content.length > 0) {
                  const textContent = result.content.find(c => c.type === "text");
                  if (textContent && textContent.text) {
                    responseText = textContent.text;
                  }
                }
                
                return { response: responseText };
              }
            };
            
            const judgment = await runJudge(
              executionHistory,
              task,
              judgeModelProvider,
              judgeOptions
            );
            
            if (!judgment) {
              console.warn(chalk.yellow(`Judgment failed for ${historyFile}`));
              continue;
            }
            
            // Create a test run result with the judgment
            judgmentResults.push({
              testCase: {
                id: historyData.metadata.id || 'unknown',
                name: historyData.metadata.name || path.basename(historyFile, '.json'),
                instructions: task,
                type: historyData.metadata.type || 'unknown'
              },
              executionHistory, // Use the correct property name from the interface
              metrics: {
                testCase: path.basename(historyFile, '.json'),
                promptName: 'N/A',
                duration: 0, // We don't have this information from the history file
                toolCalls: executionHistory.toolCalls.length,
                tokenUsage: {
                  input: 0, // These are not available in the history file
                  output: 0,
                  total: 0
                },
                success: historyData.metadata.success === true, // If available
                notes: historyData.metadata.notes || ''
              },
              judgment
            });
            
            console.log(chalk.green(`Judgment complete for ${path.basename(historyFile)}`));
            
            // Output a quick summary of the judgment
            console.log(chalk.blue('Judgment summary:'));
            console.log(`Overall assessment: ${judgment.overall.substring(0, 100)}...`);
            console.log('Scores:');
            Object.entries(judgment.scores).forEach(([dimension, score]) => {
              console.log(`- ${dimension}: ${score}/10`);
            });
            
            // Wait a short time to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
            
          } catch (error) {
            console.error(chalk.red(`Error processing file ${historyFile}:`), error);
          }
        }
        
        // Generate a report if we have any judgments
        if (judgmentResults.length > 0) {
          // Create output directory if it doesn't exist
          const outputDir = path.dirname(options.output || path.join(process.cwd(), 'evaluation-results', `judgment-report-${Date.now()}.md`));
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
          
          // Generate the report
          const outputPath = options.output || path.join(process.cwd(), 'evaluation-results', `judgment-report-${Date.now()}.md`);
          const reportPath = await generateReport(judgmentResults, outputPath, { includeJudgment: true });
          
          console.log(chalk.green(`Judgment report saved to: ${reportPath}`));
        } else {
          console.warn(chalk.yellow('No successful judgments to include in report'));
        }
      } catch (error) {
        console.error(chalk.red('Judgment failed:'), error);
        process.exit(1);
      }
    });

  // Report command
  evalCommand
    .command('report')
    .description('Generate report from evaluation results')
    .argument('<resultsDir>', 'Directory containing evaluation results')
    .option('-o, --output <file>', 'Path to save the report')
    .option('--include-judgment', 'Include judgment data in the report', true)
    .action(async (resultsDir, options) => {
      try {
        const resolvedPath = path.resolve(resultsDir);
        console.log(chalk.blue(`Generating report from results in ${resolvedPath}`));
        
        // Check if the directory exists
        if (!fs.existsSync(resolvedPath)) {
          console.error(chalk.red(`Results directory does not exist: ${resolvedPath}`));
          process.exit(1);
        }
        
        // Check if it's a directory
        if (!fs.lstatSync(resolvedPath).isDirectory()) {
          console.error(chalk.red(`${resolvedPath} is not a directory`));
          process.exit(1);
        }
        
        // Find all result files in the directory (both JSON and history files)
        const files = fs.readdirSync(resolvedPath);
        const resultFiles = files.filter(file => 
          (file.endsWith('.json') && file.includes('result')) || 
          (file.endsWith('.json') && file.includes('history'))
        );
        
        if (resultFiles.length === 0) {
          console.error(chalk.red('No result files found in the directory'));
          process.exit(1);
        }
        
        console.log(chalk.blue(`Found ${resultFiles.length} result files to process`));
        
        // Load all test runs from the files
        const testRuns: TestRunWithHistory[] = [];
        
        for (const file of resultFiles) {
          const filePath = path.join(resolvedPath, file);
          try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const fileData = JSON.parse(fileContent);
            
            // Handle different file formats
            if (file.includes('result') && Array.isArray(fileData)) {
              // This is likely a results file with multiple runs
              console.log(chalk.blue(`Processing results file: ${file}`));
              
              // Each item should be a TestRunWithHistory or convertible to one
              for (const item of fileData) {
                if (item.testCase && item.execution) {
                  testRuns.push(item as TestRunWithHistory);
                } else {
                  console.warn(chalk.yellow(`Skipping invalid result entry in ${file}`));
                }
              }
            } else if (fileData.metadata && fileData.metadata.task) {
              // This is likely a single execution history file
              console.log(chalk.blue(`Processing history file: ${file}`));
              
              const executionHistory: AgentExecutionHistory = {
                metadata: fileData.metadata,
                toolCalls: fileData.toolCalls || []
              };
              
              // Create a test run from this history
              testRuns.push({
                testCase: {
                  id: fileData.metadata.id || 'unknown',
                  name: fileData.metadata.name || path.basename(file, '.json'),
                  instructions: fileData.metadata.task,
                  type: fileData.metadata.type || 'unknown'
                },
                executionHistory, // Use the correct property name from the interface
                metrics: {
                  testCase: path.basename(file, '.json'),
                  promptName: 'N/A',
                  duration: 0, // We don't have this from the history file
                  toolCalls: executionHistory.toolCalls.length,
                  tokenUsage: {
                    input: 0,
                    output: 0,
                    total: 0
                  },
                  success: fileData.metadata.success === true, // If available
                  notes: fileData.metadata.notes || ''
                },
                judgment: fileData.judgment || null // Include judgment if available
              });
            } else {
              console.warn(chalk.yellow(`File ${file} has an unknown format, skipping`));
            }
          } catch (error) {
            console.error(chalk.red(`Error processing ${file}:`), error);
          }
        }
        
        if (testRuns.length === 0) {
          console.error(chalk.red('No valid test runs found in the results directory'));
          process.exit(1);
        }
        
        console.log(chalk.blue(`Loaded ${testRuns.length} test runs for the report`));
        
        // Generate the report
        // Create output directory if it doesn't exist
        const outputDir = path.dirname(options.output || path.join(resolvedPath, `evaluation-report-${Date.now()}.md`));
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const outputPath = options.output || path.join(resolvedPath, `evaluation-report-${Date.now()}.md`);
        const reportPath = await generateReport(testRuns, outputPath, { 
          includeJudgment: options.includeJudgment 
        });
        
        console.log(chalk.green(`Report successfully generated and saved to: ${reportPath}`));
      } catch (error) {
        console.error(chalk.red('Report generation failed:'), error);
        process.exit(1);
      }
    });

  return evalCommand;
}

// Setup evaluation commands
setupEvaluationCommands();

// Parse command line arguments
program.parse();