/**
 * Run command for evaluation CLI
 */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { createAnthropicProvider } from '../../providers/AnthropicProvider';
import { loadTestCases } from '../utils/metrics';
import { runEnhancedEvaluation } from '../runners/enhanced-evaluation-runner';
import { testCases, getQuickTestCases } from '../models/test-cases';

/**
 * Sets up the run command
 * @param evalCommand The parent eval command
 */
export function setupRunCommand(evalCommand: Command): void {
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
}