#!/usr/bin/env node
/**
 * CLI entry point for prompt evaluation system
 */

import runEvaluation from './runners/evaluation-runner';
import { originalPrompt, newPrompt } from './prompts/defaults';
import { testCases, getQuickTestCases } from './models/test-cases';
import path from 'path';

// Parse command line arguments
const argv = process.argv.slice(2);
const args = {
  outputDir: argv.find((arg, i) => arg === '--output-dir' && i < argv.length - 1)
    ? argv[argv.indexOf('--output-dir') + 1]
    : path.join(process.cwd(), 'evaluation-results'),
  quickMode: argv.includes('--quick'),
  help: argv.includes('--help') || argv.includes('-h'),
  listTests: argv.includes('--list-tests'),
  runsPerTest: argv.find((arg, i) => arg === '--runs' && i < argv.length - 1)
    ? parseInt(argv[argv.indexOf('--runs') + 1], 10)
    : undefined,
};

// Display help
if (args.help) {
  console.log(`
Prompt Evaluation System
========================

Evaluates and compares system prompt performance for the qckfx agent.
All tests run in an isolated E2B sandbox environment for security.

Usage: 
  npx ts-node src/eval/index.ts [options]

Options:
  --output-dir <path>   Directory to save evaluation results (default: ./evaluation-results)
  --quick               Run a smaller subset of tests (one per category)
  --runs <number>       Number of times to run each test for averaging results (default: 3 for full mode, 1 for quick mode)
  --list-tests          List available test cases without running them
  --help, -h            Show this help message

Examples:
  # Run all tests with default settings
  npx ts-node src/eval/index.ts
  
  # Run a quick evaluation (subset of tests)
  npx ts-node src/eval/index.ts --quick
  
  # Specify custom output directory
  npx ts-node src/eval/index.ts --output-dir ./my-results
`);
  process.exit(0);
}

// List available test cases
if (args.listTests) {
  console.log('Available test cases:');
  console.log('====================');
  testCases.forEach(testCase => {
    console.log(`ID: ${testCase.id}`);
    console.log(`Name: ${testCase.name}`);
    console.log(`Type: ${testCase.type}`);
    console.log(`Instructions: ${testCase.instructions}`);
    console.log('--------------------');
  });
  process.exit(0);
}

// Run the evaluation
console.log(`Starting prompt evaluation...`);
console.log(`Output directory: ${args.outputDir}`);
console.log(`Mode: ${args.quickMode ? 'Quick (subset of tests)' : 'Full (all tests)'}`);  

// Default: 3 runs for full mode, 1 run for quick mode unless explicitly specified
const runsPerTest = args.runsPerTest !== undefined ? args.runsPerTest : (args.quickMode ? 1 : 3);

console.log(`Runs per test: ${runsPerTest}`);
console.log(`Environment: Sandbox (isolated)`);
console.log(`Comparing: "${originalPrompt.name}" vs "${newPrompt.name}"`);
console.log('====================================');

runEvaluation({
  outputDir: args.outputDir,
  quickMode: args.quickMode,
  originalPrompt,
  newPrompt,
  testCases: args.quickMode ? getQuickTestCases() : testCases,
  runsPerTest
}).then(({ metricsPath, reportPath }) => {
  console.log('====================================');
  console.log('Evaluation completed successfully!');
  console.log(`Metrics saved to: ${metricsPath}`);
  console.log(`Report generated at: ${reportPath}`);
}).catch(error => {
  console.error('Evaluation failed:', error);
  process.exit(1);
});