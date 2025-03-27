/**
 * Prompt utilities for AI judge evaluation
 */

import { AgentExecutionHistory, TestCaseWithExamples } from '../models/types';
import { formatExecutionHistoryForJudge } from './execution-history';

/**
 * System prompt for the judge
 */
export const JUDGE_SYSTEM_PROMPT = `You are an expert evaluator of AI agent outputs for software engineering tasks.
Your goal is to objectively assess the quality of an agent's approach and response.

You have full access to the codebase and should use tools like grep, glob, and file reading to verify claims.

You will be evaluating the agent's performance across multiple dimensions including:
- Correctness - Is the solution technically accurate?
- Completeness - Does it fully address the problem?
- Efficiency - Is the solution efficient and was the agent's approach direct?
- Code Quality - Is any code produced clean and readable?
- Explanations - Are the explanations clear, helpful, and accurate?
- Tool Usage - Did the agent use appropriate tools effectively?
- Problem Solving - Did the agent take a logical approach to solving the problem?

Your evaluation must be evidence-based. Use the agent's execution history and actual outputs to verify claims.
Be fair but critical in your assessment, focusing on the actual performance shown.`;

/**
 * Options for creating judging prompts
 */
export interface CreateJudgingPromptOptions {
  /** The task the agent was given */
  task: string;
  
  /** The execution history to evaluate */
  executionHistory: AgentExecutionHistory;
  
  /** Examples for calibration (optional) */
  examples?: {
    good?: AgentExecutionHistory;
    bad?: AgentExecutionHistory;
  };
  
  /** Override the system prompt (optional) */
  systemPromptOverride?: string;
}

/**
 * Create a judging prompt with execution history and examples
 */
export function createJudgingPrompt(options: CreateJudgingPromptOptions): string {
  const {
    task,
    executionHistory,
    examples,
    systemPromptOverride
  } = options;

  let prompt = `
# TASK EVALUATION REQUEST

I need you to evaluate an AI agent's performance on a software engineering task.

## TASK DESCRIPTION
${task}

## AGENT EXECUTION HISTORY
${formatExecutionHistoryForJudge(executionHistory)}
`;

  // Add examples if they exist
  if (examples) {
    prompt += `
## EVALUATION EXAMPLES
To help calibrate your assessment, here are examples of good and bad agent behaviors:
`;

    // Add good example
    if (examples.good) {
      prompt += `
### GOOD EXAMPLE
${formatExecutionHistoryForJudge(examples.good)}

This is a good example because:
- It uses appropriate tools efficiently
- It takes a logical, systematic approach
- It produces correct, complete solutions
- The code quality and explanations are clear
`;
    }
    
    // Add bad example
    if (examples.bad) {
      prompt += `
### BAD EXAMPLE
${formatExecutionHistoryForJudge(examples.bad)}

This is a problematic example because:
- It uses inappropriate or inefficient tools
- It takes a convoluted or illogical approach
- It produces incorrect or incomplete solutions
- The code quality or explanations are poor
`;
    }
  }

  // Add evaluation instructions
  prompt += `
## EVALUATION INSTRUCTIONS

Please evaluate this agent's performance across the following dimensions, providing a score from 1-10 where:
1 = Very Poor, 5 = Average, 10 = Excellent

For each dimension:
1. Provide a numerical score (1-10)
2. Provide a detailed explanation justifying your score with specific evidence from the execution history

Dimensions to evaluate:
1. Correctness: Is the solution technically accurate and functional?
2. Completeness: Does it fully address all aspects of the problem?
3. Efficiency: Is the solution efficient? Was the agent's workflow logical and direct?
4. Code Quality: Is any generated code clean, readable, and follows best practices?
5. Explanations: Are the explanations clear, helpful, and accurate?
6. Tool Usage: Did the agent select appropriate tools and use them effectively?
7. Problem Solving: Did the agent demonstrate good problem decomposition and a systematic approach?

After evaluating each dimension, provide:
- An overall assessment summarizing the agent's performance
- 2-3 key strengths demonstrated by the agent
- 2-3 areas where the agent could improve
- 1-2 specific suggestions that would help improve the agent's performance

## RESPONSE FORMAT

Your evaluation must be provided in JSON format as follows:

\`\`\`json
{
  "scores": {
    "correctness": <score>,
    "completeness": <score>,
    "efficiency": <score>,
    "codeQuality": <score>,
    "explanations": <score>,
    "toolUsage": <score>,
    "problemSolving": <score>
  },
  "explanations": {
    "correctness": "<explanation>",
    "completeness": "<explanation>",
    "efficiency": "<explanation>",
    "codeQuality": "<explanation>",
    "explanations": "<explanation>",
    "toolUsage": "<explanation>",
    "problemSolving": "<explanation>"
  },
  "overall": "<overall assessment>",
  "strengths": [
    "<strength 1>",
    "<strength 2>",
    "..."
  ],
  "weaknesses": [
    "<weakness 1>",
    "<weakness 2>",
    "..."
  ],
  "suggestions": [
    "<suggestion 1>",
    "<suggestion 2>",
    "..."
  ]
}
\`\`\`

Ensure that your response ONLY contains the JSON and can be parsed without any additional text.
`;

  return prompt;
}

/**
 * Create system prompt for the judge
 */
export function getJudgeSystemPrompt(override?: string): string {
  return override || JUDGE_SYSTEM_PROMPT;
}