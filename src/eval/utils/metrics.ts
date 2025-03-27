/**
 * Utilities for calculating and saving metrics from test runs
 */

import fs from 'fs';
import path from 'path';
import { MetricsData, PromptComparisonResult, TestCase, SystemPromptConfig, TestRunWithHistory } from '../models/types';
import { AgentExecutionHistory } from '../models/types';
import { loadExampleByCategory } from '../models/evaluation-examples';

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

/**
 * Load test cases from a configuration file
 * 
 * @param configFilePath Path to the configuration file
 * @returns Array of test cases
 */
export function loadTestCases(configFilePath: string): TestCase[] {
  try {
    const configData = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    
    if (!configData.tests || !Array.isArray(configData.tests)) {
      console.warn('No tests array found in configuration file');
      return [];
    }
    
    return configData.tests.map((testConfig: any) => {
      // Create a test case from the configuration
      const testCase: TestCase = {
        id: testConfig.id,
        name: testConfig.name,
        instructions: testConfig.instructions,
        type: testConfig.type || 'exploration',
      };
      
      // Load examples if available
      if (testConfig.useExamples && testConfig.id) {
        const examples = loadExampleByCategory(testConfig.id);
        if (examples) {
          // Add the examples to the test case if found
          (testCase as any).examples = {
            good: examples.good,
            bad: examples.bad
          };
        }
      }
      
      return testCase;
    });
  } catch (error) {
    console.error(`Error loading test cases from ${configFilePath}:`, error);
    return [];
  }
}

/**
 * Generate a markdown report from evaluation results
 * 
 * @param runs Evaluation runs
 * @param outputPath Path to write the report
 * @param options Report generation options
 * @returns Path to the generated report
 */
export async function generateReport(
  runs: TestRunWithHistory[],
  outputPath: string,
  options: { includeJudgment?: boolean } = {}
): Promise<string> {
  const { includeJudgment = false } = options;
  
  // Ensure the output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  let markdown = `# Evaluation Report\n\n`;
  markdown += `Generated: ${new Date().toLocaleString()}\n\n`;
  
  // Group runs by test case
  const runsByTest: Record<string, TestRunWithHistory[]> = {};
  for (const run of runs) {
    const testName = run.testCase.name;
    if (!runsByTest[testName]) {
      runsByTest[testName] = [];
    }
    runsByTest[testName].push(run);
  }
  
  markdown += `## Summary\n\n`;
  markdown += `- Total test cases: ${Object.keys(runsByTest).length}\n`;
  markdown += `- Total runs: ${runs.length}\n`;
  
  if (includeJudgment) {
    const runsWithJudgment = runs.filter(run => run.judgment);
    markdown += `- Runs with judgment: ${runsWithJudgment.length}/${runs.length}\n`;
    
    if (runsWithJudgment.length > 0) {
      markdown += `\n### Average Judgment Scores\n\n`;
      
      // Calculate average scores across all judgments
      const dimensions = Object.keys(runsWithJudgment[0].judgment?.scores || {});
      if (dimensions.length > 0) {
        markdown += `| Dimension | Average Score |\n`;
        markdown += `|-----------|---------------|\n`;
        
        dimensions.forEach(dimension => {
          let sum = 0;
          let count = 0;
          
          runsWithJudgment.forEach(run => {
            if (run.judgment?.scores) {
              const score = (run.judgment.scores as any)[dimension];
              if (typeof score === 'number') {
                sum += score;
                count++;
              }
            }
          });
          
          const average = count > 0 ? (sum / count).toFixed(2) : 'N/A';
          markdown += `| ${dimension} | ${average} |\n`;
        });
      }
      
      // Collect common strengths and weaknesses
      const strengths = runsWithJudgment
        .filter(run => run.judgment?.strengths)
        .flatMap(run => run.judgment?.strengths || []);
        
      const weaknesses = runsWithJudgment
        .filter(run => run.judgment?.weaknesses)
        .flatMap(run => run.judgment?.weaknesses || []);
      
      // Count occurrences
      const strengthCounts: Record<string, number> = {};
      const weaknessCounts: Record<string, number> = {};
      
      strengths.forEach(s => {
        strengthCounts[s] = (strengthCounts[s] || 0) + 1;
      });
      
      weaknesses.forEach(w => {
        weaknessCounts[w] = (weaknessCounts[w] || 0) + 1;
      });
      
      // Sort by frequency
      const sortedStrengths = Object.entries(strengthCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Top 5
        
      const sortedWeaknesses = Object.entries(weaknessCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Top 5
      
      if (sortedStrengths.length > 0) {
        markdown += `\n### Common Strengths\n\n`;
        sortedStrengths.forEach(([strength, count]) => {
          markdown += `- ${strength} (${count} occurrences)\n`;
        });
      }
      
      if (sortedWeaknesses.length > 0) {
        markdown += `\n### Common Weaknesses\n\n`;
        sortedWeaknesses.forEach(([weakness, count]) => {
          markdown += `- ${weakness} (${count} occurrences)\n`;
        });
      }
    }
  }
  
  markdown += `\n## Test Case Results\n\n`;
  
  // Generate details for each test case
  Object.entries(runsByTest).forEach(([testName, testRuns], index) => {
    markdown += `### ${index + 1}. ${testName}\n\n`;
    
    const testCase = testRuns[0].testCase;
    markdown += `**Task:** ${testCase.instructions}\n\n`;
    
    // Calculate success rate
    const successfulRuns = testRuns.filter(run => run.metrics.success).length;
    const successRate = (successfulRuns / testRuns.length) * 100;
    
    // Calculate averages
    const avgDuration = testRuns.reduce((sum, run) => sum + run.metrics.duration, 0) / testRuns.length;
    const avgToolCalls = testRuns.reduce((sum, run) => sum + run.metrics.toolCalls, 0) / testRuns.length;
    
    markdown += `**Results Summary:**\n\n`;
    markdown += `- Runs: ${testRuns.length}\n`;
    markdown += `- Success Rate: ${successRate.toFixed(1)}% (${successfulRuns}/${testRuns.length})\n`;
    markdown += `- Average Duration: ${avgDuration.toFixed(2)}s\n`;
    markdown += `- Average Tool Calls: ${Math.round(avgToolCalls)}\n`;
    
    if (includeJudgment) {
      const runsWithJudgment = testRuns.filter(run => run.judgment);
      if (runsWithJudgment.length > 0) {
        markdown += `\n**Judgment Summary:**\n\n`;
        
        // Calculate average scores for this test
        const dimensions = Object.keys(runsWithJudgment[0].judgment?.scores || {});
        if (dimensions.length > 0) {
          markdown += `| Dimension | Average Score |\n`;
          markdown += `|-----------|---------------|\n`;
          
          dimensions.forEach(dimension => {
            let sum = 0;
            let count = 0;
            
            runsWithJudgment.forEach(run => {
              if (run.judgment?.scores) {
                const score = (run.judgment.scores as any)[dimension];
                if (typeof score === 'number') {
                  sum += score;
                  count++;
                }
              }
            });
            
            const average = count > 0 ? (sum / count).toFixed(2) : 'N/A';
            markdown += `| ${dimension} | ${average} |\n`;
          });
        }
        
        // Include a sample judgment explanation
        if (runsWithJudgment[0].judgment?.overall) {
          markdown += `\n**Sample Overall Assessment:**\n\n`;
          markdown += `> ${runsWithJudgment[0].judgment.overall}\n`;
        }
      }
    }
    
    markdown += `\n**Individual Runs:**\n\n`;
    
    testRuns.forEach((run, runIndex) => {
      markdown += `#### Run ${runIndex + 1}\n\n`;
      markdown += `- Success: ${run.metrics.success ? '✅' : '❌'}\n`;
      markdown += `- Duration: ${run.metrics.duration.toFixed(2)}s\n`;
      markdown += `- Tool Calls: ${run.metrics.toolCalls}\n`;
      
      if (run.metrics.notes) {
        markdown += `- Notes: ${run.metrics.notes}\n`;
      }
      
      if (includeJudgment && run.judgment) {
        markdown += `\n**Judgment:**\n\n`;
        
        if (run.judgment.scores) {
          markdown += `*Scores:*\n\n`;
          Object.entries(run.judgment.scores).forEach(([dimension, score]) => {
            markdown += `- ${dimension}: ${score}/10\n`;
          });
        }
        
        if (run.judgment.strengths && run.judgment.strengths.length > 0) {
          markdown += `\n*Strengths:*\n\n`;
          run.judgment.strengths.forEach(strength => {
            markdown += `- ${strength}\n`;
          });
        }
        
        if (run.judgment.weaknesses && run.judgment.weaknesses.length > 0) {
          markdown += `\n*Weaknesses:*\n\n`;
          run.judgment.weaknesses.forEach(weakness => {
            markdown += `- ${weakness}\n`;
          });
        }
      }
      
      markdown += `\n`;
    });
    
    markdown += `---\n\n`;
  });
  
  fs.writeFileSync(outputPath, markdown);
  return outputPath;
}