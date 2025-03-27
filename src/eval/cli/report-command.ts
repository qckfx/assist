/**
 * Report command for evaluation CLI
 */

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { AgentExecutionHistory, TestRunWithHistory } from '../models/types';
import { generateReport } from '../utils/metrics';

/**
 * Sets up the report command
 * @param evalCommand The parent eval command
 */
export function setupReportCommand(evalCommand: Command): void {
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
                if (item.testCase && item.executionHistory) {
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
}