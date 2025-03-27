/**
 * Evaluation CLI module
 * 
 * This module sets up the evaluation commands for the CLI interface
 */

import { Command } from 'commander';
import { setupRunCommand } from './run-command';
import { setupListCommand } from './list-command';
import { setupJudgeCommand } from './judge-command';
import { setupReportCommand } from './report-command';

/**
 * Sets up the evaluation commands for the CLI
 * @param program The Commander program instance
 * @returns The evaluation command
 */
export function setupEvaluationCommands(program: Command): Command {
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

  // Setup individual commands
  setupRunCommand(evalCommand);
  setupListCommand(evalCommand);
  setupJudgeCommand(evalCommand);
  setupReportCommand(evalCommand);

  return evalCommand;
}