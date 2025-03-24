# Tool Visualization

## Overview

qckfx now provides real-time visualization of tool executions in the terminal UI. This feature allows you to see which tools are currently running, what parameters they're using, and their execution status.

## Features

- **Real-time Tool Status**: See which tools are currently running and their status (running, completed, error)
- **Parameter Visualization**: View a concise summary of tool parameters
- **Execution Timing**: See how long tools have been running or how long they took to complete
- **Error Reporting**: Get clear error information when tools fail
- **Expandable Details**: Click on parameter summaries to see full details

## Using Tool Visualizations

Tool visualizations appear automatically in the terminal when tools are being executed. They have the following components:

- **Tool Name**: Shows the name of the tool being executed
- **Status Badge**: Indicates whether the tool is running, completed, or encountered an error
- **Parameters**: Shows a concise summary of the tool's parameters
- **Execution Time**: Shows how long the tool is taking or took to execute
- **Progress Indicator**: Animated indicator for running tools

When a tool completes, it will change to show the completion status. Recent tool executions are also shown when no tools are currently running.

## Custom Configuration

You can customize the tool visualization behavior using the following settings:

- **Show/Hide Tools**: You can toggle tool visualizations on or off using the `showToolVisualizations` prop on the Terminal component
- **Compact Mode**: Use the compact mode for a more condensed view in space-constrained environments
- **Max Visible Tools**: Control how many tools are shown at once to prevent UI clutter

## Accessibility

Tool visualizations include proper ARIA attributes for screen readers:

- Each tool has an appropriate role and aria-label
- Status changes are announced to screen readers
- Colors have been chosen to ensure sufficient contrast

## Examples

### Running Tool

The running tool visualization shows a blue indicator with an animated pulse effect:

```
┌─────────────────────────────────────────┐
│ GlobTool                                │
│ Searching for files: **/*.ts            │
│ 10:45:22                                │
│                                      ●  │
└─────────────────────────────────────────┘
```

### Completed Tool

The completed tool visualization shows a green indicator with a checkmark:

```
┌─────────────────────────────────────────┐
│ BashTool                        1.25s   │
│ Running command: ls -la                 │
│ 10:45:20                                │
│                                      ✓  │
└─────────────────────────────────────────┘
```

### Error Tool

The error tool visualization shows a red indicator with an error message:

```
┌─────────────────────────────────────────┐
│ FileReadTool                    0.50s   │
│ Reading file: /path/to/file.txt         │
│ File not found                          │
│ 10:45:21                                │
│                                      ✗  │
└─────────────────────────────────────────┘
```

## Keyboard Interaction

- Click on the parameter summary to expand and see full details
- The tool visualization automatically focuses on the most relevant information, with older tools being hidden when there are too many

## Related Settings

- In terminal settings, you can adjust theme options that affect tool visualization appearance
- The terminal's `showToolVisualizations` prop can be used to toggle all tool visualizations on or off