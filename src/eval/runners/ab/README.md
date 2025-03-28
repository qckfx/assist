# A/B Testing Framework for qckfx

This directory contains the A/B testing evaluation framework for qckfx, allowing systematic comparison of different agent prompts and configurations.

## Key Components

- **runner.ts**: Core A/B testing implementation with parallel test execution
- **agent-factory.ts**: Creates model clients with PromptManager integration
- **model-provider.ts**: Utilities for creating model providers
- **comparison.ts**: Implements comparison logic between configurations
- **reporting.ts**: Generates Markdown reports of evaluation results

## PromptManager Integration

The framework now leverages the PromptManager component to streamline prompt handling:

1. Agent configurations define system prompts and parameters
2. `agent-factory.ts` creates PromptManager instances from these configurations
3. Model clients are configured with these PromptManager instances
4. Tests run with consistent prompt handling and temperature settings

## Example Usage

Create a JSON configuration file like:

```json
{
  "configA": {
    "id": "baseline",
    "name": "Baseline Agent",
    "systemPrompt": "You are a helpful AI assistant...",
    "model": "claude-3-7-sonnet-20250219",
    "parameters": {
      "temperature": 0.2
    }
  },
  "configB": {
    "id": "experimental",
    "name": "Experimental Agent",
    "systemPrompt": "You are a precise, efficient AI assistant...",
    "model": "claude-3-7-sonnet-20250219",
    "parameters": {
      "temperature": 0.2
    }
  },
  "testCases": [
    {
      "id": "explore-1",
      "name": "Find Permission Manager",
      "instructions": "Find the implementation of the permission manager system"
    }
  ]
}
```

Then run the evaluation with:

```typescript
import { runABEvaluation } from './runners/ab/runner';
import abConfig from './path/to/config.json';

// Run the evaluation
const results = await runABEvaluation({
  configA: abConfig.configA,
  configB: abConfig.configB,
  testCases: abConfig.testCases,
  runsPerTest: 3,
  concurrency: 2
});

// Results contain metrics, reports, and execution histories
console.log(`Evaluation results stored in ${results.outputDir}`);
```

## Benefits of PromptManager Integration

- **Centralized Prompt Handling**: System prompts are managed consistently
- **Temperature Control**: Temperature is configurable per agent configuration
- **Error Context**: Tool errors are automatically integrated into prompts
- **Extensibility**: Future prompt improvements can be tested easily