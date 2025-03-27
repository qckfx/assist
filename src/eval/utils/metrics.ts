/**
 * Utilities for calculating and saving metrics from test runs
 */

import fs from 'fs';
import path from 'path';
import { 
  MetricsData, 
  PromptComparisonResult, 
  TestCase, 
  SystemPromptConfig, 
  TestRunWithHistory,
  AgentExecutionHistory,
  JudgmentResult
} from '../models/types';
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
export function generateComparisonMarkdownReport(
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
 * Options for report generation
 */
interface ReportOptions {
  /**
   * Whether to include judgment results in the report
   */
  includeJudgment?: boolean;
  
  /**
   * Whether to include execution history details
   */
  includeHistory?: boolean;
  
  /**
   * Format for the report output
   */
  format?: 'markdown' | 'json';
  
  /**
   * Title for the report
   */
  title?: string;
}

/**
 * Generate a Markdown summary table for judgment results
 */
function generateJudgmentSummaryTable(judgments: JudgmentResult[]): string {
  if (judgments.length === 0) {
    return 'No judgment results available.';
  }
  
  // Get all unique dimensions from all judgments
  const allDimensions = new Set<string>();
  judgments.forEach(judgment => {
    Object.keys(judgment.scores).forEach(dimension => {
      allDimensions.add(dimension);
    });
  });
  
  const dimensions = Array.from(allDimensions);
  
  // Create table header
  let table = '| Run | ' + dimensions.join(' | ') + ' | Overall |\n';
  table += '|-----|' + dimensions.map(() => '-----').join('|') + '|-------|\n';
  
  // Add rows for each judgment
  judgments.forEach((judgment, index) => {
    const row = [`Run ${index + 1}`];
    
    dimensions.forEach(dimension => {
      const score = judgment.scores[dimension as keyof typeof judgment.scores] !== undefined
        ? judgment.scores[dimension as keyof typeof judgment.scores]
        : 'N/A';
      row.push(score.toString());
    });
    
    // Add overall assessment
    row.push(judgment.overall?.substring(0, 50) + '...');
    
    table += `| ${row.join(' | ')} |\n`;
  });
  
  return table;
}

/**
 * Generate a detailed report section for a judgment result
 */
function generateJudgmentDetailSection(judgment: JudgmentResult, runIndex: number): string {
  let section = `#### Run ${runIndex + 1} Judgment\n\n`;
  
  // Add scores table
  section += '##### Scores\n\n';
  section += '| Dimension | Score | Explanation |\n';
  section += '|-----------|-------|-------------|\n';
  
  Object.entries(judgment.scores).forEach(([dimension, score]) => {
    const explanation = judgment.explanations?.[dimension] || 'No explanation provided';
    section += `| ${dimension} | ${score}/10 | ${explanation.substring(0, 100)}... |\n`;
  });
  
  // Add overall assessment
  section += '\n##### Overall Assessment\n\n';
  section += judgment.overall || 'No overall assessment provided';
  
  // Add strengths and weaknesses if available
  if (judgment.strengths && judgment.strengths.length > 0) {
    section += '\n\n##### Strengths\n\n';
    section += judgment.strengths.map(s => `- ${s}`).join('\n');
  }
  
  if (judgment.weaknesses && judgment.weaknesses.length > 0) {
    section += '\n\n##### Weaknesses\n\n';
    section += judgment.weaknesses.map(w => `- ${w}`).join('\n');
  }
  
  // Add suggestions if available
  if (judgment.suggestions && judgment.suggestions.length > 0) {
    section += '\n\n##### Suggestions for Improvement\n\n';
    section += judgment.suggestions.map(s => `- ${s}`).join('\n');
  }
  
  return section;
}

/**
 * Generate a report from test results
 * 
 * @param runs Evaluation runs
 * @param outputPath Path to write the report
 * @param options Report generation options
 * @returns Path to the generated report
 */
export async function generateReport(
  runs: TestRunWithHistory[],
  outputPath: string,
  options: ReportOptions = {}
): Promise<string> {
  const {
    includeJudgment = true,
    includeHistory = false,
    format = 'markdown',
    title = 'Evaluation Report',
  } = options;
  
  // Ensure the output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Group runs by test case
  const runsByTest: Record<string, TestRunWithHistory[]> = {};
  for (const run of runs) {
    const testName = run.testCase.name;
    if (!runsByTest[testName]) {
      runsByTest[testName] = [];
    }
    runsByTest[testName].push(run);
  }
  
  // Generate report based on format
  let report = '';
  
  if (format === 'markdown') {
    // Markdown report
    report = generateMarkdownReport(
      runsByTest, 
      runs, 
      includeJudgment,
      includeHistory,
      title
    );
  } else {
    // JSON report
    report = generateJsonReport(
      runsByTest, 
      runs, 
      includeJudgment,
      includeHistory,
      title
    );
  }
  
  // Write the report to the output file
  fs.writeFileSync(outputPath, report);
  return outputPath;
}

/**
 * Generate a markdown report for test runs
 */
function generateMarkdownReport(
  runsByTest: Record<string, TestRunWithHistory[]>,
  allRuns: TestRunWithHistory[],
  includeJudgment: boolean,
  includeHistory: boolean,
  title: string
): string {
  
  let markdown = `# ${title}\n\n`;
  markdown += `Generated: ${new Date().toLocaleString()}\n\n`;
  
  // Summary section
  markdown += `## Summary\n\n`;
  markdown += `- Total test cases: ${Object.keys(runsByTest).length}\n`;
  markdown += `- Total runs: ${allRuns.length}\n`;
  
  // Judgment summary if applicable
  if (includeJudgment) {
    const runsWithJudgment = allRuns.filter(run => run.judgment);
    markdown += `- Runs with judgment: ${runsWithJudgment.length}/${allRuns.length}\n`;
    
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
              const score = run.judgment.scores[dimension as keyof typeof run.judgment.scores];
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
  
  // Test case summary table
  markdown += `\n### Test Case Summary\n\n`;
  markdown += `| Test Case | Runs | Success Rate | Avg Duration (s) | Avg Tool Calls |\n`;
  markdown += `|-----------|------|-------------|-----------------|---------------|\n`;
  
  Object.entries(runsByTest).forEach(([testName, runs]) => {
    const successfulRuns = runs.filter(run => run.metrics.success).length;
    const successRate = (successfulRuns / runs.length) * 100;
    const avgDuration = runs.reduce((sum, run) => sum + run.metrics.duration, 0) / runs.length;
    const avgToolCalls = runs.reduce((sum, run) => sum + run.metrics.toolCalls, 0) / runs.length;
    
    markdown += `| ${testName} | ${runs.length} | ${successRate.toFixed(1)}% | ${avgDuration.toFixed(2)} | ${avgToolCalls.toFixed(1)} |\n`;
  });
  
  // Detailed test case sections
  markdown += `\n## Test Case Details\n\n`;
  
  Object.entries(runsByTest).forEach(([testName, testRuns], index) => {
    markdown += `### ${index + 1}. ${testName}\n\n`;
    
    const testCase = testRuns[0].testCase;
    markdown += `**Task:** ${testCase.instructions}\n\n`;
    
    // Add judgment summary if available and requested
    if (includeJudgment) {
      const runsWithJudgment = testRuns.filter(run => run.judgment);
      if (runsWithJudgment.length > 0) {
        markdown += `#### Judgment Summary\n\n`;
        markdown += generateJudgmentSummaryTable(runsWithJudgment.map(run => run.judgment!));
        markdown += '\n\n';
      }
    }
    
    // Metrics for each run
    markdown += `#### Run Metrics\n\n`;
    markdown += '| Run | Duration (s) | Tool Calls | Token Usage | Success |\n';
    markdown += '|-----|--------------|------------|-------------|--------|\n';
    
    testRuns.forEach((run, i) => {
      const duration = run.metrics.duration;
      const toolCalls = run.metrics.toolCalls;
      const tokenUsage = run.metrics.tokenUsage?.total || 'N/A';
      const success = run.metrics.success ? '✅' : '❌';
      
      markdown += `| ${i + 1} | ${duration.toFixed(2)} | ${toolCalls} | ${tokenUsage} | ${success} |\n`;
    });
    
    // Add detailed judgment results if available and requested
    if (includeJudgment) {
      const runsWithJudgment = testRuns.filter(run => run.judgment);
      if (runsWithJudgment.length > 0) {
        markdown += '\n#### Judgment Details\n\n';
        
        runsWithJudgment.forEach((run, i) => {
          if (run.judgment) {
            markdown += generateJudgmentDetailSection(run.judgment, i);
            markdown += '\n\n';
          }
        });
      }
    }
    
    // Add execution history if requested
    if (includeHistory) {
      markdown += '\n#### Execution History\n\n';
      
      testRuns.forEach((run, i) => {
        if (run.executionHistory) {
          markdown += `##### Run ${i + 1}\n\n`;
          
          // Add tool calls table
          markdown += '| # | Tool | Arguments | Result |\n';
          markdown += '|---|------|-----------|--------|\n';
          
          run.executionHistory.toolCalls.forEach((toolCall, toolIndex) => {
            const args = JSON.stringify(toolCall.args).substring(0, 50) + (JSON.stringify(toolCall.args).length > 50 ? '...' : '');
            const result = toolCall.result?.substring(0, 50) + (toolCall.result && toolCall.result.length > 50 ? '...' : '');
            
            markdown += `| ${toolIndex + 1} | ${toolCall.tool} | ${args} | ${result} |\n`;
          });
          
          markdown += '\n';
        }
      });
    }
    
    markdown += `---\n\n`;
  });
  
  return markdown;
}

/**
 * Generate a JSON report for test runs
 */
function generateJsonReport(
  runsByTest: Record<string, TestRunWithHistory[]>,
  allRuns: TestRunWithHistory[],
  includeJudgment: boolean,
  includeHistory: boolean,
  title: string
): string {
  
  // Calculate summary statistics
  const runsWithJudgment = allRuns.filter(run => run.judgment);
  
  // Build the JSON structure
  const reportData = {
    title,
    generated: new Date().toISOString(),
    summary: {
      testCases: Object.keys(runsByTest).length,
      totalRuns: allRuns.length,
      runsWithJudgment: runsWithJudgment.length
    },
    testCases: Object.entries(runsByTest).map(([testName, runs]) => {
      // Calculate statistics for this test case
      const successfulRuns = runs.filter(run => run.metrics.success).length;
      const successRate = (successfulRuns / runs.length) * 100;
      const avgDuration = runs.reduce((sum, run) => sum + run.metrics.duration, 0) / runs.length;
      const avgToolCalls = runs.reduce((sum, run) => sum + run.metrics.toolCalls, 0) / runs.length;
      
      // Build the test case entry
      const testCase = {
        name: testName,
        task: runs[0].testCase.instructions,
        stats: {
          runs: runs.length,
          successRate: successRate,
          avgDuration: avgDuration,
          avgToolCalls: avgToolCalls
        },
        runs: runs.map(run => {
          const result: any = {
            metrics: run.metrics
          };
          
          // Add judgment if requested and available
          if (includeJudgment && run.judgment) {
            result.judgment = run.judgment;
          }
          
          // Add execution history if requested
          if (includeHistory && run.executionHistory) {
            result.executionHistory = run.executionHistory;
          }
          
          return result;
        })
      };
      
      return testCase;
    })
  };
  
  // Return the JSON string with pretty formatting
  return JSON.stringify(reportData, null, 2);
}

/**
 * Load a report from a file
 * @param reportPath Path to the report file
 * @returns The loaded report data
 */
export function loadReport(reportPath: string): any {
  try {
    // Determine format based on extension
    const ext = path.extname(reportPath).toLowerCase();
    const isJson = ext === '.json';
    
    if (!fs.existsSync(reportPath)) {
      throw new Error(`Report file not found: ${reportPath}`);
    }
    
    const content = fs.readFileSync(reportPath, 'utf8');
    
    if (isJson) {
      return JSON.parse(content);
    } else {
      // For markdown, just return the raw content
      return { content, format: 'markdown' };
    }
  } catch (error) {
    throw new Error(`Error loading report: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Compare two reports and generate a comparison report
 * @param reportPath1 Path to the first report
 * @param reportPath2 Path to the second report
 * @param outputPath Path to write the comparison report
 * @returns Path to the generated comparison report
 */
export async function compareReports(
  reportPath1: string,
  reportPath2: string,
  outputPath: string
): Promise<string> {
  try {
    // Load both reports
    const report1 = loadReport(reportPath1);
    const report2 = loadReport(reportPath2);
    
    // Check if both reports are in the same format
    const isJson1 = reportPath1.toLowerCase().endsWith('.json');
    const isJson2 = reportPath2.toLowerCase().endsWith('.json');
    
    if (isJson1 !== isJson2) {
      throw new Error('Cannot compare reports in different formats');
    }
    
    // For JSON reports, generate a detailed comparison
    if (isJson1 && isJson2) {
      return generateJsonComparison(report1, report2, reportPath1, reportPath2, outputPath);
    } else {
      // For markdown reports, generate a simple comparison
      return generateMarkdownComparison(report1, report2, reportPath1, reportPath2, outputPath);
    }
  } catch (error) {
    throw new Error(`Error comparing reports: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate a comparison between two JSON reports
 */
function generateJsonComparison(
  report1: any,
  report2: any,
  reportPath1: string,
  reportPath2: string,
  outputPath: string
): string {
  // Ensure the output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  let markdown = `# Report Comparison\n\n`;
  markdown += `Generated: ${new Date().toLocaleString()}\n\n`;
  
  // Add report info
  markdown += `## Reports Compared\n\n`;
  markdown += `- Report 1: ${path.basename(reportPath1)}\n`;
  markdown += `- Report 2: ${path.basename(reportPath2)}\n\n`;
  
  // Add summary comparison
  markdown += `## Summary Comparison\n\n`;
  markdown += `| Metric | Report 1 | Report 2 | Difference |\n`;
  markdown += `|--------|----------|----------|------------|\n`;
  
  // Compare the number of test cases
  const testCases1 = report1.summary?.testCases || 0;
  const testCases2 = report2.summary?.testCases || 0;
  markdown += `| Test Cases | ${testCases1} | ${testCases2} | ${testCases2 - testCases1} |\n`;
  
  // Compare the total runs
  const totalRuns1 = report1.summary?.totalRuns || 0;
  const totalRuns2 = report2.summary?.totalRuns || 0;
  markdown += `| Total Runs | ${totalRuns1} | ${totalRuns2} | ${totalRuns2 - totalRuns1} |\n`;
  
  // If both reports have judgment data, compare them
  if (report1.summary?.runsWithJudgment !== undefined && report2.summary?.runsWithJudgment !== undefined) {
    const runsWithJudgment1 = report1.summary.runsWithJudgment;
    const runsWithJudgment2 = report2.summary.runsWithJudgment;
    markdown += `| Runs with Judgment | ${runsWithJudgment1} | ${runsWithJudgment2} | ${runsWithJudgment2 - runsWithJudgment1} |\n`;
  }
  
  // Write the comparison to the output file
  fs.writeFileSync(outputPath, markdown);
  return outputPath;
}

/**
 * Generate a comparison between two markdown reports
 */
function generateMarkdownComparison(
  report1: any,
  report2: any,
  reportPath1: string,
  reportPath2: string,
  outputPath: string
): string {
  // Ensure the output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  let markdown = `# Report Comparison\n\n`;
  markdown += `Generated: ${new Date().toLocaleString()}\n\n`;
  
  // Add report info
  markdown += `## Reports Compared\n\n`;
  markdown += `- Report 1: ${path.basename(reportPath1)}\n`;
  markdown += `- Report 2: ${path.basename(reportPath2)}\n\n`;
  
  // Add simple comparison note
  markdown += `## Note\n\n`;
  markdown += `This is a simple comparison of two markdown reports. For a more detailed comparison, `;
  markdown += `convert the reports to JSON format.\n\n`;
  
  // Write the comparison to the output file
  fs.writeFileSync(outputPath, markdown);
  return outputPath;
}