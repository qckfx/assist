# Evaluation Examples

This directory contains example agent execution histories that demonstrate "good" and "bad" agent behavior. These examples are used to calibrate the AI judge, providing reference points to help it understand what constitutes high-quality versus low-quality agent performance.

## Usage

Examples are organized by category and can be referenced in test cases to help the judge understand the expected behaviors for specific types of tasks.

Each example includes:
- A task description
- An execution history showcasing tool usage
- Annotations explaining why the example is considered good or bad

## Contributing Examples

When adding new examples:

1. Create a new JSON file with a descriptive name
2. Include both good and bad examples for the same task
3. Add comments (in the `metadata.notes` field) explaining why the example is good or bad
4. Ensure the examples are realistic and representative of actual agent behavior
5. Validate the JSON structure matches the `AgentExecutionHistory` type

## Example Structure

Each example file should follow this structure:

```json
{
  "good": {
    "metadata": {
      "notes": "Description of why this is a good example",
      "task": "The task that was given to the agent"
    },
    "toolCalls": [
      // Array of tool calls demonstrating good behavior
    ]
  },
  "bad": {
    "metadata": {
      "notes": "Description of why this is a bad example",
      "task": "The task that was given to the agent"
    },
    "toolCalls": [
      // Array of tool calls demonstrating problematic behavior
    ]
  }
}
```