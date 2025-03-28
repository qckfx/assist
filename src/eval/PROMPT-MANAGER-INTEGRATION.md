# PromptManager Integration with the A/B Testing Framework

## Overview

This document describes how the PromptManager component has been integrated with the A/B testing evaluation framework. This integration provides a centralized approach to managing system prompts and temperature settings for agent configurations.

## Implementation Details

The integration consists of the following components:

1. **agent-factory.ts**: A new file that acts as a factory for creating model providers and ModelClient instances with PromptManager integration
2. **runner.ts updates**: Modified to use the provider factory for A/B testing
3. **custom-test.ts**: An example showing how to use the agent factory for custom tests

## Two-Tier Integration

We've implemented a two-tier approach:

1. **Provider-level integration**: The `createProviderFromConfig` function creates standard AnthropicProviders for the A/B testing framework using the agent configuration's system prompt and model
   
2. **Client-level integration**: The `createAgentFromConfig` function creates ModelClient instances with PromptManager integration for custom tests and manual usage

This approach ensures compatibility with the existing A/B testing framework while also providing the benefits of PromptManager for custom tests.

## Key Benefits

- **Consistent Prompt Handling**: All system prompts are managed through a consistent interface
- **Temperature Control**: Temperature settings are consistently applied from the agent configuration
- **Error Context Enhancement**: The PromptManager automatically adds error context to prompts when tools fail
- **Centralized Configuration**: Agent configurations define all parameters in one place
- **Improved Testing**: Makes it easier to A/B test different prompt variations with the same codebase

## How It Works

1. The `AgentConfiguration` type in `ab-types.ts` defines:
   - `systemPrompt`: The base system prompt text
   - `parameters.temperature`: Optional temperature setting
   - `model`: The model to use

2. For A/B Testing:
   - The `createProviderFromConfig` function creates a standard AnthropicProvider
   - The A/B testing runner uses this provider directly to maintain compatibility with existing code

3. For Custom Tests:
   - The `createAgentFromConfig` function creates a ModelClient with PromptManager
   - Custom tests can use this function to get the full benefits of PromptManager

## Example Usage

```typescript
// Define an agent configuration
const config = {
  id: 'experimental',
  name: 'Experimental Agent',
  systemPrompt: 'You are a precise, efficient AI assistant...',
  model: 'claude-3-7-sonnet-20250219',
  parameters: {
    temperature: 0.1
  }
};

// Create a model client with PromptManager integration
const modelClient = createAgentFromConfig(config);

// Use the model client as normal
const runner = createAgentRunner({
  modelClient,
  // other parameters...
});
```

## Future Enhancements

1. Add support for dynamic prompt templates
2. Implement prompt versioning for tracking changes
3. Add more sophisticated temperature control based on task type
4. Integrate with a prompt management database or repository