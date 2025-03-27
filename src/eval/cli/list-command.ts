/**
 * List command for evaluation CLI
 */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { loadTestCases } from '../utils/metrics';
import { testCases } from '../models/test-cases';

/**
 * Sets up the list command
 * @param evalCommand The parent eval command
 */
export function setupListCommand(evalCommand: Command): void {
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
}