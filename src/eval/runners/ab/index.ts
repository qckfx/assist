/**
 * A/B testing evaluation module
 * 
 * Provides functionality to compare two different agent configurations
 * against the same test cases.
 */

export { runABEvaluation } from './runner';
export { compareConfigurations } from './comparison';
export { generateABReport } from './reporting';
export { createModelProvider, createJudgeModelProvider } from './model-provider';

// Re-export types
export type { 
  AgentConfiguration, 
  ABEvaluationOptions, 
  ABEvaluationResult, 
  ConfigurationComparison 
} from '../../models/ab-types';