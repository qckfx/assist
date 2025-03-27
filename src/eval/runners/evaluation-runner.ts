/**
 * Evaluation runner for comparing system prompt performance
 * 
 * This module orchestrates the entire evaluation process:
 * 1. Initialize sandbox environment (if needed)
 * 2. Run test cases with different system prompts
 * 3. Compare and analyze results
 * 4. Generate reports
 */

import path from 'path';
import fs from 'fs';
import { LogLevel, LogCategory, createLogger } from '../../utils/logger';
import { EvaluationConfig, MetricsData, PromptComparisonResult, TestCase } from '../models/types';
import { runTestCase } from './test-runner';
import { initializeSandbox, cleanupSandbox, resetSandbox } from '../utils/sandbox';
import { calculateDifference, saveMetricsToJson, generateComparisonMarkdownReport as generateMarkdownReport, averageMetrics } from '../utils/metrics';
import { originalPrompt, newPrompt } from '../prompts/defaults';
import { testCases, getQuickTestCases } from '../models/test-cases';

/**
 * Run the evaluation process
 */
export async function runEvaluation(config: Partial<EvaluationConfig> = {}): Promise<{
  metricsPath: string;
  reportPath: string;
}> {
  // Initialize with default configuration
  const evaluationConfig: EvaluationConfig = {
    outputDir: config.outputDir || path.join(process.cwd(), 'evaluation-results'),
    originalPrompt: config.originalPrompt || originalPrompt,
    newPrompt: config.newPrompt || newPrompt,
    testCases: config.testCases || (config.quickMode ? getQuickTestCases() : testCases),
    quickMode: config.quickMode || false,
    // Default to 3 runs for full mode, 1 run for quick mode
    runsPerTest: config.runsPerTest !== undefined 
      ? config.runsPerTest 
      : (config.quickMode ? 1 : 3)
  };

  // Create the output directory if it doesn't exist
  if (!fs.existsSync(evaluationConfig.outputDir)) {
    fs.mkdirSync(evaluationConfig.outputDir, { recursive: true });
  }

  // Create a logger for the evaluation
  const logger = createLogger({ 
    level: LogLevel.INFO,
    prefix: 'Evaluation'
  });

  logger.info('Starting system prompt evaluation', LogCategory.SYSTEM);
  logger.info(`Output directory: ${evaluationConfig.outputDir}`, LogCategory.SYSTEM);
  logger.info(`Testing ${evaluationConfig.testCases.length} cases with ${evaluationConfig.runsPerTest} runs per test`, LogCategory.SYSTEM);
  logger.info(`Comparing: "${evaluationConfig.originalPrompt.name}" vs "${evaluationConfig.newPrompt.name}"`, LogCategory.SYSTEM);

  let sandboxId: string | undefined;
  let allMetrics: MetricsData[] = [];
  let comparisons: PromptComparisonResult[] = [];

  try {
    // Initialize sandbox for secure evaluation
    logger.info('Initializing sandbox environment...', LogCategory.SYSTEM);
    const { sandboxId: newSandboxId, executionAdapter: initialExecutionAdapter } = await initializeSandbox(logger);
    sandboxId = newSandboxId;
    let executionAdapter = initialExecutionAdapter;

    // Process each test case with both prompts
    for (const testCase of evaluationConfig.testCases) {
      logger.info(`Processing test case: ${testCase.name}`, LogCategory.SYSTEM);
      
      // Run multiple times with original prompt and average the results
      logger.info(`Running with original prompt: ${evaluationConfig.originalPrompt.name} (${evaluationConfig.runsPerTest} runs)`, LogCategory.SYSTEM);
      const originalPromptResults: MetricsData[] = [];
      
      for (let run = 1; run <= evaluationConfig.runsPerTest; run++) {
        logger.info(`Original prompt - Run ${run}/${evaluationConfig.runsPerTest}`, LogCategory.SYSTEM);
        const runMetrics = await runTestCase(testCase, evaluationConfig.originalPrompt, executionAdapter);
        originalPromptResults.push(runMetrics);
        allMetrics.push(runMetrics);
        
        // Reset sandbox between runs
        if (run < evaluationConfig.runsPerTest) {
          logger.info(`Resetting sandbox for next run...`, LogCategory.SYSTEM);
          executionAdapter = await resetSandbox(sandboxId, logger);
        }
      }
      
      // Reset the sandbox to ensure a clean environment between prompts
      logger.info(`Resetting sandbox for new prompt tests...`, LogCategory.SYSTEM);
      executionAdapter = await resetSandbox(sandboxId, logger);
      
      // Run multiple times with new prompt and average the results
      logger.info(`Running with new prompt: ${evaluationConfig.newPrompt.name} (${evaluationConfig.runsPerTest} runs)`, LogCategory.SYSTEM);
      const newPromptResults: MetricsData[] = [];
      
      for (let run = 1; run <= evaluationConfig.runsPerTest; run++) {
        logger.info(`New prompt - Run ${run}/${evaluationConfig.runsPerTest}`, LogCategory.SYSTEM);
        const runMetrics = await runTestCase(testCase, evaluationConfig.newPrompt, executionAdapter);
        newPromptResults.push(runMetrics);
        allMetrics.push(runMetrics);
        
        // Reset sandbox between runs
        if (run < evaluationConfig.runsPerTest) {
          logger.info(`Resetting sandbox for next run...`, LogCategory.SYSTEM);
          executionAdapter = await resetSandbox(sandboxId, logger);
        }
      }
      
      // Calculate average metrics
      const originalPromptMetrics = averageMetrics(originalPromptResults, testCase.name, evaluationConfig.originalPrompt.name);
      const newPromptMetrics = averageMetrics(newPromptResults, testCase.name, evaluationConfig.newPrompt.name);
      
      // Calculate difference between averages
      const comparisonResult = calculateDifference(originalPromptMetrics, newPromptMetrics, testCase);
      comparisons.push(comparisonResult);
      
      // Log immediate results
      const { difference } = comparisonResult;
      logger.info(`Results for ${testCase.name}:`, LogCategory.SYSTEM);
      logger.info(`- Success: ${originalPromptMetrics.success} → ${newPromptMetrics.success} (${difference.successDifference})`, LogCategory.SYSTEM);
      logger.info(`- Duration: ${difference.duration.toFixed(2)}s (${difference.durationPercentage > 0 ? '+' : ''}${difference.durationPercentage.toFixed(2)}%)`, LogCategory.SYSTEM);
      logger.info(`- Token usage: ${difference.tokenUsage.total} (${difference.tokenUsage.totalPercentage > 0 ? '+' : ''}${difference.tokenUsage.totalPercentage.toFixed(2)}%)`, LogCategory.SYSTEM);
      
      // Reset the sandbox again if we have more test cases
      if (evaluationConfig.testCases.indexOf(testCase) < evaluationConfig.testCases.length - 1) {
        logger.info(`Resetting sandbox for next test case...`, LogCategory.SYSTEM);
        executionAdapter = await resetSandbox(sandboxId, logger);
      }
    }
    
    // Save metrics to JSON
    const metricsPath = saveMetricsToJson(allMetrics, evaluationConfig.outputDir);
    logger.info(`Metrics saved to ${metricsPath}`, LogCategory.SYSTEM);
    
    // Generate markdown report
    const reportPath = generateMarkdownReport(
      comparisons,
      evaluationConfig.originalPrompt,
      evaluationConfig.newPrompt,
      evaluationConfig.outputDir
    );
    logger.info(`Report generated at ${reportPath}`, LogCategory.SYSTEM);

    return { metricsPath, reportPath };
  } finally {
    // Clean up sandbox if we created one
    if (sandboxId) {
      try {
        logger.info('Cleaning up sandbox environment...', LogCategory.SYSTEM);
        await cleanupSandbox(sandboxId, logger);
      } catch (error) {
        logger.error('Error cleaning up sandbox', error, LogCategory.SYSTEM);
      }
    }
  }
}

// CLI entry point
if (require.main === module) {
  // Parse command line arguments
  const argv = process.argv.slice(2);
  const args = {
    outputDir: argv.find((arg, i) => arg === '--output-dir' && i < argv.length - 1) 
      ? argv[argv.indexOf('--output-dir') + 1] 
      : undefined,
    quickMode: argv.includes('--quick'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
  
  if (args.help) {
    console.log(`
Usage: node evaluation-runner.js [options]

Options:
  --output-dir <path>   Directory to save evaluation results (default: ./evaluation-results)
  --quick               Run a smaller subset of tests (one per category)
  --help, -h            Show this help message
`);
    process.exit(0);
  }
  
  // Run the evaluation
  runEvaluation({
    outputDir: args.outputDir,
    quickMode: args.quickMode,
  }).catch(error => {
    console.error('Evaluation failed:', error);
    process.exit(1);
  });
}

// Export for programmatic usage
export default runEvaluation;