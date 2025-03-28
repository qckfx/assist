/**
 * qckfx Agent Evaluation Tool
 * 
 * A streamlined evaluation framework for comparing agent configurations.
 */

import 'dotenv/config';
import { setupEvalCLI } from './cli';

// If this file is executed directly, run the CLI
if (require.main === module) {
  const program = setupEvalCLI();
  program.parse(process.argv);
}

// Exports for programmatic usage
export { runABEvaluation } from './runners/ab-runner';
export { runJudge } from './runners/judge';
export { testCases, getQuickTestCases } from './models/test-cases';
export * from './models/ab-types';
export * from './models/types';