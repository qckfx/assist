/**
 * Judge command for evaluation CLI
 */

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { AgentExecutionHistory, TestRunWithHistory } from '../models/types';
import { createAnthropicProvider } from '../../providers/AnthropicProvider';
import { runJudge, JudgeOptions } from '../runners/judge-runner';
import { loadExampleByCategory } from '../models/evaluation-examples';
import { generateReport } from '../utils/metrics';
import { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages.mjs';
/**
 * Sets up the judge command
 * @param evalCommand The parent eval command
 */
export function setupJudgeCommand(evalCommand: Command): void {
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
        const judgeOptions: JudgeOptions = {};
        
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
                // Map the user prompt to a proper session state
                const userMessage: MessageParam = { 
                  role: "user", 
                  content: [
                    { type: "text", text: prompt }
                  ]
                };

                const result = await modelProvider({
                  systemMessage: "You are a judge evaluating an AI agent's performance. Provide detailed feedback on strengths and weaknesses.",
                  temperature: 0.1, // Lower temperature for more consistent judging
                  sessionState: {
                    conversationHistory: [userMessage]
                  }
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
}