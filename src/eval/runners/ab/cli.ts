/**
 * CLI command for A/B testing
 */

import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { ABEvaluationOptions } from '../../models/ab-types';
import { runABEvaluation } from './runner';
import { testCases, getQuickTestCases } from '../../models/test-cases';

/**
 * Setup command for A/B testing
 * 
 * @param program Commander program instance to add the command to
 */
export function setupABCommand(program: Command): void {
  // Add a command that runs the A/B evaluation with the provided config or uses the default config
  program
    .command('eval')
    .description('Run A/B testing evaluation')
    .option('-c, --config <path>', 'Path to a custom A/B test configuration file')
    .option('-o, --output <dir>', 'Directory to save results (default: ./evaluation-results)')
    .option('-r, --runs <number>', 'Number of runs per test case (default: 3)')
    .option('--concurrency <number>', 'Number of concurrent test executions (default: 2)')
    .option('--quick', 'Use a smaller subset of test cases for quicker evaluation')
    .option('--no-judge', 'Disable AI judge evaluation')
    .action(async (options) => {
      try {
        let config;
        
        // Load either the provided config or the default one
        if (options.config) {
          console.log(chalk.blue(`Loading custom configuration from ${options.config}`));
          
          if (!fs.existsSync(options.config)) {
            console.error(chalk.red(`Configuration file not found: ${options.config}`));
            process.exit(1);
          }
          
          config = JSON.parse(fs.readFileSync(options.config, 'utf8'));
        } else {
          // Use the default config
          const defaultConfigPath = path.join(__dirname, '../../examples/ab-config-example.json');
          console.log(chalk.blue(`Loading default configuration from ${defaultConfigPath}`));
          
          if (!fs.existsSync(defaultConfigPath)) {
            console.error(chalk.red(`Default configuration file not found. Please provide a custom config with --config.`));
            process.exit(1);
          }
          
          config = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8'));
        }
        
        // Validate the configuration
        if (!config.configA || !config.configB) {
          console.error(chalk.red('Invalid configuration: must include configA and configB configurations'));
          process.exit(1);
        }
        
        // Handle the case where test cases might be in the config or use default ones
        let evaluationTestCases = config.testCases;
        if (!evaluationTestCases || evaluationTestCases.length === 0) {
          // Use all test cases or quick mode if requested
          evaluationTestCases = options.quick ? getQuickTestCases() : testCases;
          console.log(chalk.yellow(`No test cases in config, using ${options.quick ? 'quick' : 'all'} built-in test cases`));
        }
        
        // Set default values
        const abOptions: ABEvaluationOptions = {
          configA: config.configA,
          configB: config.configB,
          testCases: evaluationTestCases,
          runsPerTest: options.runs ? parseInt(options.runs, 10) : 3,
          enableJudge: options.judge !== false,
          concurrency: options.concurrency ? parseInt(options.concurrency, 10) : 2,
          outputDir: options.output || path.join(process.cwd(), 'evaluation-results')
        };
        
        console.log(chalk.blue(`Starting A/B evaluation with ${abOptions.testCases.length} test cases`));
        console.log(chalk.blue(`Comparing: ${config.configA.name} vs ${config.configB.name}`));
        console.log(chalk.blue(`Runs per test: ${abOptions.runsPerTest}`));
        console.log(chalk.blue(`Concurrency: ${abOptions.concurrency}`));
        console.log(chalk.blue(`Judge enabled: ${abOptions.enableJudge}`));
        
        // Run the evaluation
        const result = await runABEvaluation(abOptions);
        
        console.log(chalk.green(`A/B evaluation completed successfully!`));
        console.log(chalk.green(`Total runs: ${result.runs.length}`));
        console.log(chalk.green(`Report: ${path.join(result.outputDir, 'ab-report.md')}`));
        
        // Display summary if judging was enabled
        if (abOptions.enableJudge && result.averageJudgment) {
          console.log(chalk.yellow('\nJudgment Summary:'));
          
          // Display average scores for both configurations
          const configAName = config.configA.name;
          const configBName = config.configB.name;
          
          console.log(chalk.cyan(`\n${configAName} average scores:`));
          for (const [dimension, score] of Object.entries(result.averageJudgment[config.configA.id])) {
            if (dimension === 'overall') continue;
            console.log(`  ${dimension}: ${(score as number).toFixed(2)}`);
          }
          
          console.log(chalk.cyan(`\n${configBName} average scores:`));
          for (const [dimension, score] of Object.entries(result.averageJudgment[config.configB.id])) {
            if (dimension === 'overall') continue;
            console.log(`  ${dimension}: ${(score as number).toFixed(2)}`);
          }
          
          // Display comparison result if available
          if (result.comparison) {
            console.log(chalk.green('\nComparison Result:'));
            console.log(`  Winner: ${result.comparison.winner === 'A' ? configAName : (result.comparison.winner === 'B' ? configBName : 'Tie')}`);
            
            if (result.comparison.overallImprovement) {
              const improvement = result.comparison.overallImprovement;
              console.log(`  Overall Improvement: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%`);
            }
          }
        }
      } catch (error) {
        console.error(chalk.red('A/B evaluation failed:'), error);
        process.exit(1);
      }
    });
}