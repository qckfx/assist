/**
 * Report generation functions for A/B testing
 */

import fs from 'fs';
import path from 'path';
import { ABTestRunWithHistory, ConfigurationComparison } from '../../models/ab-types';

/**
 * Generate a comprehensive A/B testing report
 * 
 * @param data Comparison data to include in the report
 * @param outputPath File path to write the report to
 * @returns Path to the generated report
 */
export async function generateABReport(
  data: {
    configA: {
      id: string;
      name: string;
      runs: ABTestRunWithHistory[];
      averageMetrics: any;
      averageJudgment?: any;
    };
    configB: {
      id: string;
      name: string;
      runs: ABTestRunWithHistory[];
      averageMetrics: any;
      averageJudgment?: any;
    };
    runsByTest: Record<string, Record<string, ABTestRunWithHistory[]>>;
    comparison?: ConfigurationComparison;
  },
  outputPath: string
): Promise<string> {
  const { configA, configB, runsByTest, comparison } = data;
  
  // Ensure the output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Start building the report
  let markdown = `# A/B Testing Evaluation Report\n\n`;
  markdown += `Generated: ${new Date().toLocaleString()}\n\n`;
  
  // Add configuration information
  markdown += `## Configurations Compared\n\n`;
  markdown += `### Configuration A: ${configA.name}\n\n`;
  markdown += formatConfigDetails(configA);
  markdown += `\n### Configuration B: ${configB.name}\n\n`;
  markdown += formatConfigDetails(configB);
  markdown += `\n`;
  
  // Add overall summary
  markdown += `## Overall Results\n\n`;
  
  // Success rates
  markdown += `### Success Rates\n\n`;
  markdown += `| Configuration | Success Rate | Avg Duration (s) | Avg Tool Calls | Avg Token Usage |\n`;
  markdown += `|---------------|--------------|------------------|----------------|----------------|\n`;
  markdown += `| ${configA.name} | ${(configA.averageMetrics.success * 100).toFixed(1)}% | ${configA.averageMetrics.duration.toFixed(2)} | ${configA.averageMetrics.toolCalls.toFixed(1)} | ${configA.averageMetrics.tokenUsage.total.toFixed(0)} |\n`;
  markdown += `| ${configB.name} | ${(configB.averageMetrics.success * 100).toFixed(1)}% | ${configB.averageMetrics.duration.toFixed(2)} | ${configB.averageMetrics.toolCalls.toFixed(1)} | ${configB.averageMetrics.tokenUsage.total.toFixed(0)} |\n\n`;
  
  // Add judgment scores if available
  if (configA.averageJudgment && configB.averageJudgment) {
    markdown += `### AI Judge Evaluation\n\n`;
    markdown += `| Dimension | ${configA.name} | ${configB.name} | Difference |\n`;
    markdown += `|-----------|------------|------------|------------|\n`;
    
    // Get all dimensions from both judgments
    const dimensions = Array.from(
      new Set([
        ...Object.keys(configA.averageJudgment),
        ...Object.keys(configB.averageJudgment)
      ])
    ).filter(d => d !== 'overall');
    
    // Add a row for each dimension
    for (const dimension of dimensions) {
      const scoreA = configA.averageJudgment[dimension] || 'N/A';
      const scoreB = configB.averageJudgment[dimension] || 'N/A';
      const difference = typeof scoreA === 'number' && typeof scoreB === 'number' 
        ? scoreB - scoreA 
        : 'N/A';
      
      const diffText = typeof difference === 'number'
        ? `${difference > 0 ? '+' : ''}${difference.toFixed(2)}`
        : difference;
      
      markdown += `| ${dimension} | ${typeof scoreA === 'number' ? scoreA.toFixed(2) : scoreA} | ${typeof scoreB === 'number' ? scoreB.toFixed(2) : scoreB} | ${diffText} |\n`;
    }
    
    // Add overall scores
    const overallA = configA.averageJudgment.overall || 'N/A';
    const overallB = configB.averageJudgment.overall || 'N/A';
    const overallDiff = typeof overallA === 'number' && typeof overallB === 'number'
      ? overallB - overallA
      : 'N/A';
    
    const overallDiffText = typeof overallDiff === 'number'
      ? `${overallDiff > 0 ? '+' : ''}${overallDiff.toFixed(2)}`
      : overallDiff;
    
    markdown += `| **Overall** | **${typeof overallA === 'number' ? overallA.toFixed(2) : overallA}** | **${typeof overallB === 'number' ? overallB.toFixed(2) : overallB}** | **${overallDiffText}** |\n\n`;
  }
  
  // Add comparison results if available
  if (comparison) {
    markdown += `### Configuration Comparison\n\n`;
    markdown += `**Winner: ${comparison.winner === 'A' ? configA.name : (comparison.winner === 'B' ? configB.name : 'Tie')}**\n\n`;
    
    if (comparison.analysis) {
      markdown += `**Analysis:**\n\n${comparison.analysis}\n\n`;
    }
    
    if (comparison.significantDimensions && comparison.significantDimensions.length > 0) {
      markdown += `**Most Significant Differences:**\n\n`;
      markdown += `| Dimension | Difference | % Change |\n`;
      markdown += `|-----------|------------|----------|\n`;
      
      for (const dim of comparison.significantDimensions) {
        markdown += `| ${dim.name} | ${dim.difference > 0 ? '+' : ''}${dim.difference.toFixed(2)} | ${dim.percentageChange > 0 ? '+' : ''}${dim.percentageChange.toFixed(1)}% |\n`;
      }
      markdown += '\n';
    }
  }
  
  // Add per-test case details
  markdown += `## Test Case Details\n\n`;
  
  let testIndex = 1;
  for (const testName in runsByTest) {
    const testData = runsByTest[testName];
    const runsA = testData[configA.id] || [];
    const runsB = testData[configB.id] || [];
    
    markdown += `### ${testIndex}. ${testName}\n\n`;
    testIndex++;
    
    if (runsA.length > 0) {
      const testCase = runsA[0].testCase;
      markdown += `**Task:** ${testCase.instructions}\n\n`;
    }
    
    // Add success rate for this test
    const successRateA = runsA.length > 0 ? runsA.filter(r => r.metrics.success).length / runsA.length : 0;
    const successRateB = runsB.length > 0 ? runsB.filter(r => r.metrics.success).length / runsB.length : 0;
    
    markdown += `**Success Rate:**\n\n`;
    markdown += `- ${configA.name}: ${(successRateA * 100).toFixed(1)}%\n`;
    markdown += `- ${configB.name}: ${(successRateB * 100).toFixed(1)}%\n\n`;
    
    // Add judgment results if available
    const judgedRunsA = runsA.filter(r => r.judgment);
    const judgedRunsB = runsB.filter(r => r.judgment);
    
    if (judgedRunsA.length > 0 && judgedRunsB.length > 0) {
      markdown += `**Judgment Results:**\n\n`;
      
      // Calculate average scores for this test
      const avgScoresA = calculateAverageScores(judgedRunsA);
      const avgScoresB = calculateAverageScores(judgedRunsB);
      
      // Get all dimensions
      const dimensions = new Set<string>();
      
      for (const run of judgedRunsA) {
        if (run.judgment && run.judgment.scores) {
          Object.keys(run.judgment.scores).forEach(dim => dimensions.add(dim));
        }
      }
      
      for (const run of judgedRunsB) {
        if (run.judgment && run.judgment.scores) {
          Object.keys(run.judgment.scores).forEach(dim => dimensions.add(dim));
        }
      }
      
      // Create a comparison table
      markdown += `| Dimension | ${configA.name} | ${configB.name} | Difference |\n`;
      markdown += `|-----------|------------|------------|------------|\n`;
      
      for (const dimension of dimensions) {
        const scoreA = avgScoresA[dimension] || 0;
        const scoreB = avgScoresB[dimension] || 0;
        const difference = scoreB - scoreA;
        
        markdown += `| ${dimension} | ${scoreA.toFixed(2)} | ${scoreB.toFixed(2)} | ${difference > 0 ? '+' : ''}${difference.toFixed(2)} |\n`;
      }
      
      markdown += '\n';
      
      // Add common strengths/weaknesses
      const strengthsA = getCommonItems(judgedRunsA, 'strengths');
      const strengthsB = getCommonItems(judgedRunsB, 'strengths');
      const weaknessesA = getCommonItems(judgedRunsA, 'weaknesses');
      const weaknessesB = getCommonItems(judgedRunsB, 'weaknesses');
      
      if (strengthsA.length > 0 || strengthsB.length > 0) {
        markdown += `**Common Strengths:**\n\n`;
        markdown += `- ${configA.name}: ${strengthsA.join(', ') || 'None identified'}\n`;
        markdown += `- ${configB.name}: ${strengthsB.join(', ') || 'None identified'}\n\n`;
      }
      
      if (weaknessesA.length > 0 || weaknessesB.length > 0) {
        markdown += `**Common Weaknesses:**\n\n`;
        markdown += `- ${configA.name}: ${weaknessesA.join(', ') || 'None identified'}\n`;
        markdown += `- ${configB.name}: ${weaknessesB.join(', ') || 'None identified'}\n\n`;
      }
    }
    
    // Add separator between test cases
    markdown += `---\n\n`;
  }
  
  // Write the report to the output file
  fs.writeFileSync(outputPath, markdown);
  return outputPath;
}

/**
 * Format configuration details for the report
 */
function formatConfigDetails(config: any): string {
  let details = '';
  
  // Add configuration parameters
  if (config.metadata) {
    details += `**Description:** ${config.metadata.description || 'N/A'}\n\n`;
  }
  
  details += `**Model:** ${config.id.includes('model-') ? config.id.replace('model-', '') : config.id}\n\n`;
  
  if (config.averageMetrics) {
    details += `**Metrics Summary:**\n`;
    details += `- Success Rate: ${(config.averageMetrics.success * 100).toFixed(1)}%\n`;
    details += `- Average Duration: ${config.averageMetrics.duration.toFixed(2)}s\n`;
    details += `- Average Tool Calls: ${config.averageMetrics.toolCalls.toFixed(1)}\n`;
    details += `- Average Token Usage: ${config.averageMetrics.tokenUsage.total.toFixed(0)}\n`;
  }
  
  return details;
}

/**
 * Calculate average scores across judgment results
 */
function calculateAverageScores(runs: ABTestRunWithHistory[]): Record<string, number> {
  if (runs.length === 0) return {};
  
  const dimensions = new Set<string>();
  const scores: Record<string, number[]> = {};
  
  // Collect all scores
  for (const run of runs) {
    if (run.judgment && run.judgment.scores) {
      Object.entries(run.judgment.scores).forEach(([dimension, score]) => {
        dimensions.add(dimension);
        
        if (!scores[dimension]) {
          scores[dimension] = [];
        }
        
        if (typeof score === 'number') {
          scores[dimension].push(score);
        }
      });
    }
  }
  
  // Calculate averages
  const result: Record<string, number> = {};
  for (const dimension of dimensions) {
    const dimensionScores = scores[dimension] || [];
    if (dimensionScores.length > 0) {
      result[dimension] = dimensionScores.reduce((sum, score) => sum + score, 0) / dimensionScores.length;
    }
  }
  
  return result;
}

/**
 * Get common items from judgment results
 */
function getCommonItems(runs: ABTestRunWithHistory[], property: 'strengths' | 'weaknesses' | 'suggestions'): string[] {
  const items = runs
    .filter(r => r.judgment && r.judgment[property] && Array.isArray(r.judgment[property]))
    .flatMap(r => {
      if (r.judgment && r.judgment[property]) {
        return r.judgment[property] as string[];
      }
      return [];
    });
  
  const counts: Record<string, number> = {};
  items.forEach(item => {
    counts[item] = (counts[item] || 0) + 1;
  });
  
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([item, count]) => `${item} (${count})`);
}