#!/usr/bin/env node
/**
 * CLI entry point for the evaluation system
 */

import { createAnthropicProvider } from '../providers/AnthropicProvider';
import { runEnhancedEvaluation } from './runners/enhanced-evaluation-runner';
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
  disableJudge: argv.includes('--no-judge'),
  disableCompare: argv.includes('--no-compare'),
  concurrency: argv.find((arg, i) => arg === '--concurrency' && i < argv.length - 1)
    ? parseInt(argv[argv.indexOf('--concurrency') + 1], 10)
    : 2, // Default concurrency
};

// Display help
if (args.help) {
  console.log(`
AI Agent Evaluation System
=========================

Evaluates agent performance using execution history collection and AI judge.
All tests run in an isolated E2B sandbox environment for security.

Usage: 
  npx ts-node src/eval/index.ts [options]

Options:
  --output-dir <path>    Directory to save evaluation results (default: ./evaluation-results)
  --quick                Run a smaller subset of tests (one per category)
  --runs <number>        Number of runs per test case (default: 3 for full mode, 1 for quick mode)
  --concurrency <number> Number of parallel test executions (default: 2)
  --no-judge             Disable AI judge evaluation (enabled by default)
  --no-compare           Disable comparison between multiple runs (enabled by default)
  --list-tests           List available test cases without running them
  --help, -h             Show this help message

Examples:
  # Run all tests with default settings (AI judge enabled)
  npx ts-node src/eval/index.ts
  
  # Run a quick evaluation (subset of tests)
  npx ts-node src/eval/index.ts --quick
  
  # Run with higher concurrency
  npx ts-node src/eval/index.ts --concurrency 4
  
  # Run execution histories only without AI judge
  npx ts-node src/eval/index.ts --no-judge
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
    console.log(`Instructions: ${testCase.instructions.substring(0, 100)}...`);
    console.log('--------------------');
  });
  process.exit(0);
}

// Set up Anthropic provider
const modelProvider = createAnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  model: 'claude-3-7-sonnet-20250219'
});

// Default: 3 runs for full mode, 1 run for quick mode unless explicitly specified
const runsPerTest = args.runsPerTest !== undefined ? args.runsPerTest : (args.quickMode ? 1 : 3);

// Run the evaluation
console.log(`Starting agent evaluation...`);
console.log(`Output directory: ${args.outputDir}`);
console.log(`Mode: ${args.quickMode ? 'Quick (subset of tests)' : 'Full (all tests)'}`);
console.log(`Runs per test: ${runsPerTest}`);
console.log(`Concurrency: ${args.concurrency}`);
console.log(`AI Judge: ${args.disableJudge ? 'Disabled' : 'Enabled'}`);
console.log(`Run comparison: ${(!args.disableJudge && !args.disableCompare && runsPerTest > 1) ? 'Enabled' : 'Disabled'}`);
console.log(`Environment: Sandbox (isolated)`);
console.log('====================================');

// Get the appropriate test cases
const selectedTests = args.quickMode ? getQuickTestCases() : testCases;

runEnhancedEvaluation(selectedTests, modelProvider, {
  enableJudge: !args.disableJudge,
  runsPerTest: runsPerTest,
  concurrency: args.concurrency,
  outputDir: args.outputDir,
  compareRuns: !args.disableJudge && !args.disableCompare && runsPerTest > 1
}).then((results) => {
  console.log('====================================');
  console.log('Evaluation completed successfully!');
  console.log(`Total runs: ${results.runs.length}`);
  console.log(`Output directory: ${results.outputDir}`);
  
  // Log judgment statistics if enabled
  if (!args.disableJudge) {
    const runsWithJudgment = results.runs.filter(run => run.judgment);
    console.log(`Runs with judgment: ${runsWithJudgment.length}/${results.runs.length}`);
    
    // Calculate average scores if available
    if (runsWithJudgment.length > 0 && runsWithJudgment[0].judgment) {
      const averageScores: Record<string, string> = {};
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
          
          averageScores[dimension] = (sum / runsWithJudgment.length).toFixed(2);
        });
        
        console.log('Average scores:');
        Object.entries(averageScores).forEach(([dimension, score]) => {
          console.log(`- ${dimension}: ${score}`);
        });
      }
    }
  }
  
  console.log('====================================');
}).catch(error => {
  console.error('Evaluation failed:', error);
  process.exit(1);
});