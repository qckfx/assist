/**
 * Utilities for calculating and saving metrics from test runs
 */

import fs from 'fs';
import path from 'path';
import { MetricsData, PromptComparisonResult, TestCase, SystemPromptConfig } from '../models/types';

/**
 * Calculate the differences between original and new prompt metrics
 * 
 * @param originalMetrics Metrics from the original prompt
 * @param newMetrics Metrics from the new prompt
 * @param testCase The test case that was run
 * @returns Comparison result with calculated differences
 */
export function calculateDifference(
  originalMetrics: MetricsData,
  newMetrics: MetricsData,
  testCase: TestCase
): PromptComparisonResult {
  const durationDiff = newMetrics.duration - originalMetrics.duration;
  const durationPercentage = originalMetrics.duration === 0 
    ? 0 
    : (durationDiff / originalMetrics.duration) * 100;
  
  const toolCallsDiff = newMetrics.toolCalls - originalMetrics.toolCalls;
  const toolCallsPercentage = originalMetrics.toolCalls === 0 
    ? 0 
    : (toolCallsDiff / originalMetrics.toolCalls) * 100;
  
  const inputTokenDiff = newMetrics.tokenUsage.input - originalMetrics.tokenUsage.input;
  const inputTokenPercentage = originalMetrics.tokenUsage.input === 0 
    ? 0 
    : (inputTokenDiff / originalMetrics.tokenUsage.input) * 100;
  
  const outputTokenDiff = newMetrics.tokenUsage.output - originalMetrics.tokenUsage.output;
  const outputTokenPercentage = originalMetrics.tokenUsage.output === 0 
    ? 0 
    : (outputTokenDiff / originalMetrics.tokenUsage.output) * 100;
  
  const totalTokenDiff = newMetrics.tokenUsage.total - originalMetrics.tokenUsage.total;
  const totalTokenPercentage = originalMetrics.tokenUsage.total === 0 
    ? 0
    : (totalTokenDiff / originalMetrics.tokenUsage.total) * 100;
  
  let successDifference = "No change";
  if (originalMetrics.success !== newMetrics.success) {
    successDifference = newMetrics.success ? "Improved (success)" : "Degraded (failure)";
  }

  return {
    testCase,
    originalPromptMetrics: originalMetrics,
    newPromptMetrics: newMetrics,
    difference: {
      duration: durationDiff,
      durationPercentage,
      toolCalls: toolCallsDiff,
      toolCallsPercentage,
      tokenUsage: {
        input: inputTokenDiff,
        output: outputTokenDiff,
        total: totalTokenDiff,
        inputPercentage: inputTokenPercentage,
        outputPercentage: outputTokenPercentage,
        totalPercentage: totalTokenPercentage,
      },
      successDifference,
    }
  };
}

/**
 * Save metrics data to a JSON file
 * 
 * @param metrics Metrics data to save
 * @param outputDir Directory to save the file in
 * @returns Path to the saved file
 */
export function saveMetricsToJson(metrics: MetricsData[], outputDir: string): string {
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const filename = `metrics-${timestamp}.json`;
  const outputPath = path.join(outputDir, filename);
  
  // Ensure the output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(metrics, null, 2));
  return outputPath;
}

/**
 * Generate a markdown report from comparison results
 * 
 * @param comparisons Comparison results to include in the report
 * @param originalPrompt Original prompt configuration
 * @param newPrompt New prompt configuration
 * @param outputDir Directory to save the report in
 * @returns Path to the generated report
 */
export function generateMarkdownReport(
  comparisons: PromptComparisonResult[],
  originalPrompt: SystemPromptConfig,
  newPrompt: SystemPromptConfig,
  outputDir: string
): string {
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const filename = `comparison-report-${timestamp}.md`;
  const outputPath = path.join(outputDir, filename);
  
  // Ensure the output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  let markdown = `# Prompt Comparison Report\n\n`;
  markdown += `Generated: ${new Date().toLocaleString()}\n\n`;
  
  markdown += `## Prompts Compared\n\n`;
  markdown += `### Original Prompt: ${originalPrompt.name}\n\`\`\`\n${originalPrompt.systemPrompt}\n\`\`\`\n\n`;
  markdown += `### New Prompt: ${newPrompt.name}\n\`\`\`\n${newPrompt.systemPrompt}\n\`\`\`\n\n`;
  
  markdown += `## Overall Results\n\n`;
  
  // Calculate average metrics
  const totalComparisons = comparisons.length;
  
  if (totalComparisons === 0) {
    markdown += `No test cases were executed for comparison.\n\n`;
  } else {
    const avgDurationDiff = comparisons.reduce((sum, c) => sum + c.difference.durationPercentage, 0) / totalComparisons;
    const avgToolCallsDiff = comparisons.reduce((sum, c) => sum + c.difference.toolCallsPercentage, 0) / totalComparisons;
    const avgTokenDiff = comparisons.reduce((sum, c) => sum + c.difference.tokenUsage.totalPercentage, 0) / totalComparisons;
    
    const successfulOriginal = comparisons.filter(c => c.originalPromptMetrics.success).length;
    const successfulNew = comparisons.filter(c => c.newPromptMetrics.success).length;
    const successRateOriginal = (successfulOriginal / totalComparisons) * 100;
    const successRateNew = (successfulNew / totalComparisons) * 100;
    
    markdown += `| Metric | Original Prompt | New Prompt | Difference |\n`;
    markdown += `| ------ | --------------- | ---------- | ---------- |\n`;
    markdown += `| Success Rate | ${successRateOriginal.toFixed(2)}% | ${successRateNew.toFixed(2)}% | ${(successRateNew - successRateOriginal).toFixed(2)}% |\n`;
    markdown += `| Avg Duration | - | - | ${avgDurationDiff > 0 ? '+' : ''}${avgDurationDiff.toFixed(2)}% |\n`;
    markdown += `| Avg Tool Calls | - | - | ${avgToolCallsDiff > 0 ? '+' : ''}${avgToolCallsDiff.toFixed(2)}% |\n`;
    markdown += `| Avg Token Usage | - | - | ${avgTokenDiff > 0 ? '+' : ''}${avgTokenDiff.toFixed(2)}% |\n\n`;
  }
  
  markdown += `## Test Case Results\n\n`;
  
  comparisons.forEach((comparison, index) => {
    const { testCase, originalPromptMetrics, newPromptMetrics, difference } = comparison;
    
    markdown += `### ${index + 1}. ${testCase.name}\n\n`;
    markdown += `**Task:** ${testCase.instructions}\n\n`;
    
    markdown += `**Results:**\n\n`;
    markdown += `| Metric | Original Prompt | New Prompt | Difference |\n`;
    markdown += `| ------ | --------------- | ---------- | ---------- |\n`;
    markdown += `| Success | ${originalPromptMetrics.success ? '✅' : '❌'} | ${newPromptMetrics.success ? '✅' : '❌'} | ${difference.successDifference} |\n`;
    markdown += `| Duration | ${originalPromptMetrics.duration.toFixed(2)}s | ${newPromptMetrics.duration.toFixed(2)}s | ${difference.duration > 0 ? '+' : ''}${difference.duration.toFixed(2)}s (${difference.durationPercentage > 0 ? '+' : ''}${difference.durationPercentage.toFixed(2)}%) |\n`;
    markdown += `| Tool Calls | ${originalPromptMetrics.toolCalls} | ${newPromptMetrics.toolCalls} | ${difference.toolCalls > 0 ? '+' : ''}${difference.toolCalls} (${difference.toolCallsPercentage > 0 ? '+' : ''}${difference.toolCallsPercentage.toFixed(2)}%) |\n`;
    markdown += `| Input Tokens | ${originalPromptMetrics.tokenUsage.input} | ${newPromptMetrics.tokenUsage.input} | ${difference.tokenUsage.input > 0 ? '+' : ''}${difference.tokenUsage.input} (${difference.tokenUsage.inputPercentage > 0 ? '+' : ''}${difference.tokenUsage.inputPercentage.toFixed(2)}%) |\n`;
    markdown += `| Output Tokens | ${originalPromptMetrics.tokenUsage.output} | ${newPromptMetrics.tokenUsage.output} | ${difference.tokenUsage.output > 0 ? '+' : ''}${difference.tokenUsage.output} (${difference.tokenUsage.outputPercentage > 0 ? '+' : ''}${difference.tokenUsage.outputPercentage.toFixed(2)}%) |\n`;
    markdown += `| Total Tokens | ${originalPromptMetrics.tokenUsage.total} | ${newPromptMetrics.tokenUsage.total} | ${difference.tokenUsage.total > 0 ? '+' : ''}${difference.tokenUsage.total} (${difference.tokenUsage.totalPercentage > 0 ? '+' : ''}${difference.tokenUsage.totalPercentage.toFixed(2)}%) |\n\n`;

    if (originalPromptMetrics.notes || newPromptMetrics.notes) {
      markdown += `**Notes:**\n\n`;
      if (originalPromptMetrics.notes) {
        markdown += `- Original Prompt: ${originalPromptMetrics.notes}\n`;
      }
      if (newPromptMetrics.notes) {
        markdown += `- New Prompt: ${newPromptMetrics.notes}\n`;
      }
      markdown += `\n`;
    }
  });
  
  fs.writeFileSync(outputPath, markdown);
  return outputPath;
}

/**
 * Calculate average metrics from multiple test runs
 * 
 * @param metricsArray Array of metrics from multiple runs of the same test
 * @param testCaseName Name of the test case
 * @param promptName Name of the prompt
 * @returns Averaged metrics
 */
export function averageMetrics(
  metricsArray: MetricsData[], 
  testCaseName: string,
  promptName: string
): MetricsData {
  if (metricsArray.length === 0) {
    throw new Error('Cannot average empty metrics array');
  }
  
  if (metricsArray.length === 1) {
    return metricsArray[0]; // No need to average a single result
  }
  
  // Count successful runs
  const successCount = metricsArray.filter(m => m.success).length;
  const successRate = successCount / metricsArray.length;
  
  // Calculate averages for numeric metrics
  const avgDuration = metricsArray.reduce((sum, m) => sum + m.duration, 0) / metricsArray.length;
  const avgToolCalls = metricsArray.reduce((sum, m) => sum + m.toolCalls, 0) / metricsArray.length;
  
  const avgInputTokens = metricsArray.reduce((sum, m) => sum + m.tokenUsage.input, 0) / metricsArray.length;
  const avgOutputTokens = metricsArray.reduce((sum, m) => sum + m.tokenUsage.output, 0) / metricsArray.length;
  const avgTotalTokens = metricsArray.reduce((sum, m) => sum + m.tokenUsage.total, 0) / metricsArray.length;
  
  // Compile notes from all runs
  const notes = metricsArray
    .map((m, i) => m.notes ? `Run ${i+1}: ${m.notes}` : null)
    .filter(Boolean)
    .join('\n');
  
  return {
    testCase: testCaseName,
    promptName: `${promptName} (avg of ${metricsArray.length} runs)`,
    duration: avgDuration,
    toolCalls: Math.round(avgToolCalls),
    tokenUsage: {
      input: Math.round(avgInputTokens),
      output: Math.round(avgOutputTokens),
      total: Math.round(avgTotalTokens)
    },
    success: successRate >= 0.5, // Consider success if at least half the runs succeeded
    notes: notes.length > 0 ? 
      `Success rate: ${(successRate * 100).toFixed(1)}% (${successCount}/${metricsArray.length} runs)\n${notes}` : 
      `Success rate: ${(successRate * 100).toFixed(1)}% (${successCount}/${metricsArray.length} runs)`
  };
}