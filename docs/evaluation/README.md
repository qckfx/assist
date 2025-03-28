# qckfx Agent Evaluation System

This directory contains documentation and examples related to the agent evaluation system used in qckfx.

## Overview

The evaluation system provides a framework for conducting A/B tests comparing different agent configurations. It allows for quantitative and qualitative assessment of how different prompts, models, or parameter settings affect agent performance across a standardized set of tasks.

## Current Status

**Important Note:** The evaluation system is in an early stage of development and is still evolving. The AI judge component, while useful, does not always produce consistent or reliable assessments. Users are strongly encouraged to:

1. Read the execution histories of test runs to form their own judgments
2. Consider the judge's evaluations as one data point rather than a definitive assessment
3. Pay attention to objective metrics like success rates, execution time, and token usage

## How Evaluations Work

1. **Test Cases**: A set of standardized tasks representing common use cases
2. **Configurations**: Different agent setups to be compared (e.g., baseline vs. experimental prompt)
3. **Execution**: Each configuration runs multiple times on each test case
4. **Metrics Collection**: The system gathers quantitative data such as:
   - Success/failure rate
   - Execution time
   - Tool usage counts
   - Token consumption
5. **AI Judge**: After execution, an AI judge reviews the agent's performance against predefined criteria
6. **Report Generation**: A comprehensive report comparing the configurations is produced

## Execution Histories

For each test run, the system creates an execution history that captures:

- The task given to the agent
- All tool calls made by the agent
- The agent's final response
- Metadata about the configuration and test case

These histories are valuable for understanding exactly how the agent approached the task and where it may have encountered issues. An example history file is included in this directory (`example-history.json`).

### Sample History Format

```json
{
  "metadata": {
    "task": "The task description",
    "runInfo": {
      "testId": "test-id",
      "testName": "Test Name",
      "runId": "unique-run-id"
    },
    "configInfo": {
      "configId": "config-id",
      "configName": "Configuration Name",
      "modelName": "model-name",
      "promptName": "Prompt Name"
    }
  },
  "toolCalls": [
    {
      "tool": "tool-name",
      "args": { "arg1": "value1" },
      "result": "tool-result",
      "startTime": "timestamp",
      "endTime": "timestamp"
    }
  ],
  "response": "The agent's final response to the task"
}
```

## Report Structure

The evaluation system generates a detailed markdown report comparing the configurations. A sample report is included in this directory (`example-report.md`). The report typically includes:

1. **Configuration Summaries**: Details about each configuration being tested
2. **Overall Metrics**: Success rates, execution times, token usage, etc.
3. **Judge Evaluations**: Scores across various dimensions (correctness, efficiency, etc.)
4. **Strengths & Weaknesses**: AI-generated analysis of each configuration's performance
5. **Per-Test Results**: Detailed breakdown of performance on each test case

## Running Your Own Evaluations

To run evaluations:

```bash
# Quick evaluation (subset of tests, higher concurrency)
npm run eval:quick

# Custom evaluation with specific configuration
npm run eval:custom <path-to-config>

# List available test cases
npm run eval:list
```

## Future Improvements

The evaluation system is actively being developed, with plans to:

1. Improve judge consistency and reliability
2. Add more quantitative metrics
3. Expand the test case library
4. Support more complex evaluation scenarios
5. Integrate with continuous integration workflows

## Contributing

Contributions to the evaluation system are welcome! Consider:

1. Adding new test cases that represent important agent use cases
2. Improving the judge prompts to provide more consistent assessments
3. Adding new quantitative metrics that provide valuable insights
4. Enhancing the reporting system with visualizations or additional analyses

For more information, please consult the main project documentation.