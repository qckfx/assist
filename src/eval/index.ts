#!/usr/bin/env node
/**
 * CLI entry point for the A/B testing evaluation system
 * 
 * This system allows comparing two different agent configurations (A/B testing)
 * with AI judge evaluation to determine which performs better.
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import { Command } from 'commander';
import { testCases } from './models/test-cases';
import { setupABCommand } from './runners/ab/cli';

// Create a command line interface
const program = new Command();

program
  .name('agent-eval')
  .description('AI Agent A/B Testing Evaluation System')
  .version('1.0.0');

// Setup list tests command
program
  .command('list')
  .description('List available test cases without running them')
  .action(() => {
    console.log('Available test cases:');
    console.log('====================');
    testCases.forEach(testCase => {
      console.log(`ID: ${testCase.id}`);
      console.log(`Name: ${testCase.name}`);
      console.log(`Type: ${testCase.type}`);
      console.log(`Instructions: ${testCase.instructions.substring(0, 100)}...`);
      console.log('--------------------');
    });
  });

// Add the A/B testing command
setupABCommand(program);

// Set up default command to run the evaluation directly
program.parse(process.argv.length > 2 ? process.argv : [...process.argv, 'eval']);

// Export the main functionality for programmatic use
export { runABEvaluation } from './runners/ab';
export * from './models/types';
export * from './models/ab-types';