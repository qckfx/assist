# System Prompt Evaluation Framework

This directory contains a framework for evaluating and comparing system prompts used in the qckfx agent. The evaluation system runs test cases against different prompt configurations and generates reports on their comparative performance.

## Architecture

The evaluation system follows a clean architecture with proper separation of concerns:

- **models/**: Type definitions and data models
  - `types.ts`: Core type definitions for the evaluation system
  - `test-cases.ts`: Test case definitions and utility functions

- **prompts/**: System prompt configurations
  - `defaults.ts`: Default prompt configurations for testing

- **runners/**: Test execution logic
  - `test-runner.ts`: Executes individual test cases
  - `evaluation-runner.ts`: Orchestrates the entire evaluation process

- **utils/**: Utility functions
  - `metrics.ts`: Metrics calculation and reporting utilities
  - `sandbox.ts`: Sandbox management with proper error handling

## Usage

### Basic Usage

Run the evaluation system with default settings:

```bash
npx ts-node src/eval/index.ts
```

### Options

- `--output-dir <path>`: Directory to save evaluation results (default: `./evaluation-results`)
- `--quick`: Run a smaller subset of tests (one per category)
- `--list-tests`: List available test cases without running them
- `--help`, `-h`: Show help message

Note: All tests run in an isolated E2B sandbox environment for security.

### Examples

Run a quick evaluation (subset of tests):
```bash
npx ts-node src/eval/index.ts --quick
```

Specify custom output directory:
```bash
npx ts-node src/eval/index.ts --output-dir ./my-results
```

## Adding Test Cases

To add new test cases, edit `models/test-cases.ts`. Each test case should include:

- `id`: Unique identifier
- `name`: Human-readable name
- `instructions`: The instructions to send to the agent
- `type`: Test case type (exploration, debugging, implementation, analysis)
- `successCriteria` (optional): Function to determine if the test was successful
- `notes` (optional): Function to generate notes about the test run

## Modifying Prompts

System prompts are defined in `prompts/defaults.ts`. You can:

1. Modify the existing `originalPrompt` or `newPrompt`
2. Create a new prompt configuration
3. Edit the CLI to use custom prompt configurations

## Output

The evaluation system generates two types of output:

1. **Metrics JSON**: Raw metrics data in JSON format
2. **Markdown Report**: Formatted comparison report in Markdown

Both files are saved to the specified output directory with timestamps in their filenames.

## Environment Variables

- `ANTHROPIC_API_KEY`: Required for API calls to Anthropic
- `E2B_API_KEY`: Required for sandbox execution