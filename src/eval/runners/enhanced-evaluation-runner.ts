/**
 * Enhanced evaluation runner with AI judge capabilities
 * 
 * This module extends the basic evaluation runner to:
 * 1. Run agent executions with execution history collection
 * 2. Enable AI judging of the executions
 * 3. Store all execution and judgment data for later analysis
 * 4. Support parallel execution using the sandbox pool
 * 5. Generate detailed statistics of agent performance
 */

import { AnthropicProvider } from '../../providers/AnthropicProvider';
import { SandboxPool } from '../utils/sandbox-pool';
import { TestCase, TestRunWithHistory } from '../models/types';
import { runTestCaseWithHistory } from './test-runner';
import { runJudge, compareWithJudge } from './judge-runner';
import { 
  StorageService,
  NodeFileSystem
} from '../utils/storage';
import { createLogger, LogLevel } from '../../utils/logger';
import { ModelProvider, ProcessQueryOptions } from './judge-runner';
import path from 'path';
import fs from 'fs';

// Create a logger specifically for the enhanced evaluation runner
const logger = createLogger({
  level: LogLevel.INFO,
  prefix: 'EnhancedEval'
});

/**
 * Adapter class to make AnthropicProvider compatible with the ModelProvider interface
 * required by the judge runner.
 */
class AnthropicProviderAdapter implements ModelProvider {
  private provider: AnthropicProvider;

  constructor(provider: AnthropicProvider) {
    this.provider = provider;
  }

  async processQuery(prompt: string, options: ProcessQueryOptions = {}) {
    try {
      // Adapt the provider to the ModelProvider interface
      const response = await this.provider({
        messages: [
          { role: 'user', content: [{ type: 'text', text: prompt }] }
        ],
        systemMessage: options.systemPrompt,
        responseType: 'tool_use'
      });

      // Extract the text content from the response
      let responseText = '';
      if (response.content && response.content.length > 0) {
        for (const block of response.content) {
          if (block.type === 'text' && block.text) {
            responseText += block.text;
          }
        }
      }

      return { response: responseText };
    } catch (error) {
      logger.error('Error in AnthropicProviderAdapter', error);
      return { response: null };
    }
  }
}

/**
 * Options for the enhanced evaluation runner
 */
export interface EnhancedEvaluationOptions {
  /**
   * Whether to run the AI judge on test executions
   */
  enableJudge?: boolean;
  
  /**
   * Number of runs per test case
   */
  runsPerTest?: number;
  
  /**
   * Maximum number of parallel executions
   */
  concurrency?: number;
  
  /**
   * Directory to store evaluation results
   */
  outputDir?: string;
  
  /**
   * Whether to compare different runs using the judge
   */
  compareRuns?: boolean;
  
  /**
   * Custom system prompt for the judge
   */
  judgeSystemPrompt?: string;
  
  /**
   * Whether to use good/bad examples for calibrating the judge
   */
  useExamples?: boolean;

  /**
   * Storage service for persisting evaluation data
   * Will create a default one if not provided
   */
  storageService?: StorageService;
}

/**
 * Evaluation run result containing all the execution data
 */
export interface EnhancedEvaluationResult {
  /**
   * All test runs from the evaluation
   */
  runs: TestRunWithHistory[];
  
  /**
   * Unique ID for this evaluation run
   */
  runId: string;
  
  /**
   * Directory where evaluation data is stored
   */
  outputDir: string;
}

/**
 * Enhanced evaluation runner that supports AI judge evaluations.
 * 
 * @param testCases - Array of test cases to run
 * @param modelProvider - Provider for model API access
 * @param options - Evaluation options
 * @returns Evaluation results including all runs and output location
 */
export async function runEnhancedEvaluation(
  testCases: TestCase[],
  modelProvider: AnthropicProvider,
  options: EnhancedEvaluationOptions = {}
): Promise<EnhancedEvaluationResult> {
  // Create an adapter for the model provider to match the ModelProvider interface
  const modelProviderAdapter = new AnthropicProviderAdapter(modelProvider);
  // Default options
  const {
    enableJudge = false,
    runsPerTest = 1,
    concurrency = 1,
    compareRuns = false,
    judgeSystemPrompt,
    useExamples = false,
    storageService = new StorageService(new NodeFileSystem())
  } = options;
  
  // Generate a unique run ID for this evaluation
  const runId = `evaluation-${new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-')}`;
  const outputDir = storageService.getEvaluationStorageDir({ runId });
  
  // Log evaluation configuration
  logger.info(`Starting enhanced evaluation with ID: ${runId}`);
  logger.info(`Output directory: ${outputDir}`);
  logger.info(`Test cases: ${testCases.length}`);
  logger.info(`Runs per test: ${runsPerTest}`);
  logger.info(`Concurrency: ${concurrency}`);
  logger.info(`Judge enabled: ${enableJudge}`);
  
  // Create sandbox pool for parallel execution
  const sandboxPool = new SandboxPool(concurrency);
  await sandboxPool.waitForInitialization();
  
  const allRuns: TestRunWithHistory[] = [];
  
  try {
    // Create a flat list of all test runs to execute
    const testRuns: { testCase: TestCase; runIndex: number }[] = [];
    for (const testCase of testCases) {
      for (let i = 0; i < runsPerTest; i++) {
        testRuns.push({ testCase, runIndex: i });
      }
    }
    
    // Execute all test runs using the sandbox pool
    const runPromises = testRuns.map(({ testCase, runIndex }) => 
      sandboxPool.withExecutionAdapter(async (sandbox) => {
        const testName = testCase.name;
        logger.info(`Running test "${testName}" (run ${runIndex + 1}/${runsPerTest})`);
        
        try {
          // Run the test case and collect execution history
          const run = await runTestCaseWithHistory(testCase, sandbox, modelProvider);
          
          // Store the execution history
          const executionId = storageService.storeExecutionHistory(run.executionHistory, {
            runId,
            testName,
          });
          
          // Run the judge if enabled
          if (enableJudge) {
            try {
              // Prepare examples for the judge if enabled and available
              const testCaseWithExamples = testCase as any; // Cast to any to access potential examples
              const examples = useExamples && testCaseWithExamples.examples ? {
                good: testCaseWithExamples.examples.good?.executionHistory,
                bad: testCaseWithExamples.examples.bad?.executionHistory,
              } : undefined;
              
              // Run the AI judge
              const judgment = await runJudge(
                run.executionHistory,
                testCase.instructions,
                modelProviderAdapter,
                {
                  examples,
                  systemPromptOverride: judgeSystemPrompt,
                }
              );
              
              if (judgment) {
                // Store the judgment result
                const judgmentId = storageService.storeJudgmentResult(judgment, executionId, {
                  runId,
                  testName,
                });
                
                return {
                  ...run,
                  executionId,
                  judgment,
                  judgmentId,
                };
              }
            } catch (error) {
              logger.error(`Failed to run judge for test "${testName}"`, error);
            }
          }
          
          return {
            ...run,
            executionId,
          };
        } catch (error) {
          logger.error(`Failed to run test "${testName}"`, error);
          throw error;
        }
      })
    );
    
    // Wait for all test runs to complete
    const results = await Promise.allSettled(runPromises);
    
    // Process the results, separating successful and failed runs
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allRuns.push(result.value);
      } else {
        logger.error(
          `Test run failed: ${testRuns[index].testCase.name} (run ${testRuns[index].runIndex + 1})`,
          result.reason
        );
      }
    });
    
    // Group runs by test case for easier processing
    const runsByTest: Record<string, TestRunWithHistory[]> = {};
    for (const run of allRuns) {
      const testName = run.testCase.name;
      if (!runsByTest[testName]) {
        runsByTest[testName] = [];
      }
      runsByTest[testName].push(run);
    }
    
    // Compare runs if enabled and multiple runs exist
    if (enableJudge && compareRuns) {
      await runComparisons(runsByTest, modelProviderAdapter, {
        runId,
        judgeSystemPrompt,
        storageService
      });
    }
    
    // Write detailed summary file
    const summary = {
      runId,
      timestamp: new Date().toISOString(),
      testCases: testCases.map(t => t.name),
      totalRuns: allRuns.length,
      configuration: {
        enableJudge,
        compareRuns,
        runsPerTest,
        concurrency
      },
      testResults: Object.entries(runsByTest).map(([testName, runs]) => ({
        testName,
        runs: runs.length,
        successRate: runs.filter(r => r.metrics.success).length / runs.length,
        averageDuration: runs.reduce((acc, r) => acc + r.metrics.duration, 0) / runs.length,
        averageToolCalls: runs.reduce((acc, r) => acc + r.metrics.toolCalls, 0) / runs.length,
        executionIds: runs.map(r => r.executionId),
        judgmentIds: runs.map(r => r.judgmentId).filter(Boolean),
      })),
      // Include judgment statistics if available
      judgmentStats: enableJudge ? {
        totalJudgments: allRuns.filter(run => run.judgment).length,
        averageScores: calculateAverageScores(allRuns.filter(run => run.judgment)),
        commonStrengths: findCommonItems(allRuns
          .filter(run => run.judgment && run.judgment.strengths)
          .flatMap(run => {
            // TypeScript needs help understanding this is safe
            if (run.judgment && run.judgment.strengths) {
              return run.judgment.strengths;
            }
            return [];
          })),
        commonWeaknesses: findCommonItems(allRuns
          .filter(run => run.judgment && run.judgment.weaknesses)
          .flatMap(run => {
            // TypeScript needs help understanding this is safe
            if (run.judgment && run.judgment.weaknesses) {
              return run.judgment.weaknesses;
            }
            return [];
          })),
      } : undefined,
    };
    
    // Write summary to disk using a file system implementation for consistency
    const fileSystem = new NodeFileSystem();
    fileSystem.writeFileSync(
      path.join(outputDir, 'summary.json'),
      JSON.stringify(summary, null, 2),
      { encoding: 'utf8' }
    );
    
    return {
      runs: allRuns,
      runId,
      outputDir,
    };
  } finally {
    // Ensure sandbox pool is properly shut down
    await sandboxPool.shutdown();
  }
}

/**
 * Calculate average scores across all judgment results
 * @param runs Runs with judgment results
 * @returns Object with average scores for each dimension
 */
function calculateAverageScores(runs: TestRunWithHistory[]): Record<string, number> {
  if (runs.length === 0 || !runs[0].judgment) {
    return {};
  }

  const dimensions = Object.keys(runs[0].judgment.scores);
  const result: Record<string, number> = {};

  dimensions.forEach(dimension => {
    const sum = runs.reduce((acc, run) => {
      // Use type assertion to handle the index access
      if (run.judgment && run.judgment.scores) {
        const score = run.judgment.scores[dimension as keyof typeof run.judgment.scores];
        return acc + (typeof score === 'number' ? score : 0);
      }
      return acc;
    }, 0);
    result[dimension] = parseFloat((sum / runs.length).toFixed(2));
  });

  return result;
}

/**
 * Find common items in an array of strings
 * @param items Array of string items
 * @returns Array of items sorted by frequency
 */
function findCommonItems(items: string[]): { item: string; count: number }[] {
  if (items.length === 0) return [];

  // Count occurrences
  const counts: Record<string, number> = {};
  items.forEach(item => {
    counts[item] = (counts[item] || 0) + 1;
  });

  // Convert to array and sort by frequency
  return Object.entries(counts)
    .map(([item, count]) => ({ item, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Run comparisons between different test runs
 * Extracted as a separate function for clarity
 */
async function runComparisons(
  runsByTest: Record<string, TestRunWithHistory[]>,
  modelProvider: ModelProvider,
  options: {
    runId: string;
    judgeSystemPrompt?: string;
    storageService: StorageService;
  }
): Promise<void> {
  const { runId, judgeSystemPrompt, storageService } = options;
  
  // Process each test case
  for (const testName in runsByTest) {
    const runs = runsByTest[testName];
    
    // Only compare if we have multiple runs
    if (runs.length > 1) {
      logger.info(`Running comparisons for test "${testName}" with ${runs.length} runs`);
      
      // Compare each pair of runs
      for (let i = 0; i < runs.length; i++) {
        for (let j = i + 1; j < runs.length; j++) {
          const runA = runs[i];
          const runB = runs[j];
          
          // Skip if either run doesn't have judgment
          if (!runA.judgment || !runB.judgment || !runA.executionId || !runB.executionId) {
            logger.warn(`Skipping comparison between runs ${i} and ${j} (missing judgment or execution ID)`);
            continue;
          }
          
          try {
            // Run the comparison
            logger.info(`Comparing run ${i+1} vs run ${j+1}`);
            const comparisonResult = await compareWithJudge(
              {
                history: runA.executionHistory,
                task: runA.testCase.instructions,
              },
              {
                history: runB.executionHistory,
                task: runB.testCase.instructions,
              },
              modelProvider,
              {
                systemPromptOverride: judgeSystemPrompt,
              }
            );
            
            // Store the comparison if we got one
            if (comparisonResult.comparison) {
              storageService.storeComparisonResult(
                comparisonResult.comparison,
                runA.executionId,
                runB.executionId,
                { runId, testName }
              );
              
              logger.info(`Stored comparison between runs ${i+1} and ${j+1}`);
            } else {
              logger.warn(`Comparison between runs ${i+1} and ${j+1} resulted in no output`);
            }
          } catch (error) {
            logger.error(
              `Failed to compare runs ${i+1} and ${j+1} for test "${testName}"`,
              error
            );
          }
        }
      }
    } else {
      logger.info(`Skipping comparisons for test "${testName}" (only ${runs.length} run)`);
    }
  }
}

// Export for programmatic use
export default runEnhancedEvaluation;