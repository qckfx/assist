/**
 * Type definitions for the evaluation system
 */

import type { AnthropicConfig } from '../../types/anthropic';

/**
 * Represents a test case for evaluating the agent
 */
export interface TestCase {
  /** Unique identifier for the test case */
  id: string;
  
  /** Human-readable name of the test case */
  name: string;
  
  /** The instructions to send to the agent */
  instructions: string;
  
  /** The type of test case */
  type: 'exploration' | 'debugging' | 'implementation' | 'analysis';
  
  /** Optional function to determine if the test was successful */
  successCriteria?: (result: any) => boolean;
  
  /** Optional function to generate notes about the test run */
  notes?: (result: any) => string;
}

/**
 * Represents a system prompt configuration for testing
 */
export interface SystemPromptConfig extends AnthropicConfig {
  /** Name of the prompt configuration */
  name: string;
  
  /** The actual system prompt text */
  systemPrompt: string;
}

/**
 * Metrics data collected from a test run
 */
export interface MetricsData {
  /** The name of the test case */
  testCase: string;
  
  /** The name of the prompt used */
  promptName: string;
  
  /** Duration of the test in seconds */
  duration: number;
  
  /** Number of tool calls made during the test */
  toolCalls: number;
  
  /** Token usage metrics */
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  
  /** Whether the test was successful */
  success: boolean;
  
  /** Additional notes from the test run */
  notes?: string;
}

/**
 * Comparison between two prompt configurations on a test case
 */
export interface PromptComparisonResult {
  /** The test case that was run */
  testCase: TestCase;
  
  /** Metrics from the original prompt */
  originalPromptMetrics: MetricsData;
  
  /** Metrics from the new prompt */
  newPromptMetrics: MetricsData;
  
  /** Differences between the metrics */
  difference: {
    duration: number;
    durationPercentage: number;
    toolCalls: number;
    toolCallsPercentage: number;
    tokenUsage: {
      input: number;
      output: number;
      total: number;
      inputPercentage: number;
      outputPercentage: number;
      totalPercentage: number;
    };
    successDifference: string;
  };
}

/**
 * Configuration for the evaluation runner
 */
export interface EvaluationConfig {
  /** Directory to save evaluation results */
  outputDir: string;
  
  /** Original prompt configuration to test */
  originalPrompt: SystemPromptConfig;
  
  /** New prompt configuration to test */
  newPrompt: SystemPromptConfig;
  
  /** List of test cases to run */
  testCases: TestCase[];
  
  /** Whether to use quick mode (subset of test cases) */
  quickMode?: boolean;

  /** Number of times to run each test case (for averaging results) */
  runsPerTest: number;
}