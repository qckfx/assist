/**
 * Judge runner for evaluating agent performance using AI judging
 */

import { createAnthropicProvider } from '../../providers/AnthropicProvider';
import { JudgmentResult, AgentExecutionHistory } from '../models/types';
import { createJudgingPrompt, getJudgeSystemPrompt } from '../utils/judge-prompts';
import { createLogger, LogLevel } from '../../utils/logger';

// Create a logger for the judge runner
const logger = createLogger({
  level: LogLevel.INFO,
  prefix: 'JudgeRunner'
});

/**
 * Parse the judgment output from the LLM.
 * The output should be a JSON string with scores and explanations.
 */
export function parseJudgmentOutput(output: string): JudgmentResult | null {
  try {
    // Look for JSON block in the output using regex
    const jsonMatch = output.match(/```json\n([\s\S]*?)\n```/) || 
                      output.match(/{[\s\S]*}/);
    
    if (!jsonMatch) {
      logger.error('Failed to find JSON in judge output');
      return null;
    }
    
    // Parse the JSON content
    const jsonContent = jsonMatch[1] || jsonMatch[0];
    const result = JSON.parse(jsonContent.trim());
    
    // Validate the structure
    if (!result.scores || !result.explanations) {
      logger.error('Invalid judgment result structure', result);
      return null;
    }
    
    return result as JudgmentResult;
  } catch (error) {
    logger.error('Failed to parse judgment output', error);
    return null;
  }
}

/**
 * Run the AI judge to evaluate an agent's execution history.
 */
export async function runJudge(
  executionHistory: AgentExecutionHistory,
  task: string,
  modelProvider: any,
  options: {
    examples?: {
      good?: AgentExecutionHistory;
      bad?: AgentExecutionHistory;
    };
    systemPromptOverride?: string;
  } = {}
): Promise<JudgmentResult | null> {
  try {
    // Create the judging prompt with the execution history
    const prompt = createJudgingPrompt({
      task,
      executionHistory,
      examples: options.examples,
      systemPromptOverride: options.systemPromptOverride,
    });
    
    // Run the judge model
    logger.info('Running AI judge evaluation');
    const result = await modelProvider.processQuery(prompt, {
      temperature: 0.2,  // Low temperature for more consistent judgments
      maxTokens: 2000,   // Ensure enough tokens for detailed analysis
    });
    
    if (!result.response) {
      logger.error('No response from judge model');
      return null;
    }
    
    // Parse the judgment output
    const judgmentResult = parseJudgmentOutput(result.response);
    
    if (!judgmentResult) {
      logger.error('Failed to parse judgment result');
      return null;
    }
    
    return judgmentResult;
  } catch (error) {
    logger.error('Error running judge', error);
    return null;
  }
}

/**
 * Compare two execution histories using the AI judge.
 */
export async function compareWithJudge(
  executionA: { history: AgentExecutionHistory; task: string },
  executionB: { history: AgentExecutionHistory; task: string },
  modelProvider: any,
  options: {
    systemPromptOverride?: string;
  } = {}
): Promise<{
  judgmentA: JudgmentResult | null;
  judgmentB: JudgmentResult | null;
  comparison: string | null;
}> {
  // Run the judge on both executions
  const judgmentA = await runJudge(
    executionA.history, 
    executionA.task, 
    modelProvider,
    options
  );
  
  const judgmentB = await runJudge(
    executionB.history, 
    executionB.task, 
    modelProvider,
    options
  );
  
  // If either judgment failed, return what we have
  if (!judgmentA || !judgmentB) {
    return {
      judgmentA,
      judgmentB,
      comparison: null,
    };
  }
  
  // Create a comparison prompt
  const comparisonPrompt = `
I need you to compare two different AI agent executions that have been judged.

EXECUTION A JUDGMENT:
${JSON.stringify(judgmentA, null, 2)}

EXECUTION B JUDGMENT:
${JSON.stringify(judgmentB, null, 2)}

Compare these two executions and explain which one performed better overall and why.
Include specific comparisons across each dimension scored (correctness, completeness, etc.).
Clearly state which execution is superior and by how much.

Format your response as a markdown report with clear section headings.
`;

  // Run the comparison
  try {
    logger.info('Running judgment comparison');
    const comparisonResult = await modelProvider.processQuery(comparisonPrompt, {
      temperature: 0.2,
      maxTokens: 2000,
    });
    
    return {
      judgmentA,
      judgmentB,
      comparison: comparisonResult.response || null,
    };
  } catch (error) {
    logger.error('Error comparing judgments', error);
    return {
      judgmentA,
      judgmentB,
      comparison: null,
    };
  }
}