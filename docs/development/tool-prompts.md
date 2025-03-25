# Tool Prompts Guide

This document provides guidelines for creating effective tool descriptions in the qckfx agent. Well-crafted tool descriptions help the AI model make better decisions about which tools to use and how to use them correctly.

## Tool Description Format

All tool descriptions should follow this consistent format to ensure clarity and effectiveness:

```
- [Capability bullet 1]
- [Capability bullet 2]
- [Capability bullet 3]
- [Additional capability bullets as needed]
- Use this tool when [primary use case]
- For [alternative use case], use [alternative tool] instead

Usage notes:
- [Usage note 1]
- [Usage note 2]
- [Important restrictions or requirements]
- [Common patterns and best practices]
- [Warning about potential pitfalls]
```

## Key Components

1. **Capability Bullets**: Start with 3-5 bullet points that clearly describe what the tool does.
2. **Use Case Guidance**: Explicitly state when to use this tool and when to use alternatives.
3. **Usage Notes**: Provide specific guidance on tool usage, limitations, and best practices.
4. **Warnings**: Include important cautions about potential issues or misuse.

## Parameter Documentation

Each parameter should be documented with:

1. **Purpose**: What the parameter controls or affects
2. **Format**: Expected format or type
3. **Examples**: Clear examples of valid values
4. **Defaults**: Default value if parameter is optional
5. **Warnings**: Any cautions about parameter usage

Example parameter description:
```typescript
pattern: {
  type: "string",
  description: "The glob pattern to match files. Examples: '**/*.js', 'src/**/*.json', '*.md'"
}
```

## Tool Categories and Their Special Considerations

### File Operation Tools

- Clearly distinguish between reading, writing, and editing operations
- Emphasize permission requirements
- Include warnings about destructive operations
- Reference related tools for different file operations

### Search Tools

- Clarify the difference between name-based searches (GlobTool) and content-based searches (GrepTool)
- Provide examples of search patterns
- Explain result limitations and filtering options

### Execution Tools

- Emphasize security considerations
- Provide clear examples of intended usage
- Suggest specialized tools as alternatives to general commands

## Examples

### Good Example (GlobTool)

```
- Fast file pattern matching tool that works across the codebase
- Searches for files based on name patterns (not content)
- Supports powerful glob patterns for flexible matching
- Provides options to filter results by type and attributes
- Use this tool when you need to find files by name patterns
- For searching file contents, use GrepTool instead

Usage notes:
- Glob patterns use wildcards to match filenames
- Common patterns: '**/*.js' (all JS files), 'src/**/*.ts' (all TS files in src)
- Use the dot option to include hidden files (starting with '.')
- Use nodir to exclude directories from results
- Results are limited by maxResults to prevent overwhelming output
- For complex multi-step file searches, consider using multiple tool calls
```

### Good Example (FileEditTool)

```
- Modifies existing files by replacing specific content
- Ensures precise targeting of text to be replaced
- Preserves file structure and formatting
- Maintains file encodings during edits
- Use this tool for targeted edits to existing files
- For creating new files, use FileWriteTool instead

Usage notes:
- First use FileReadTool to understand the file's contents
- The searchCode MUST match exactly once in the file
- IMPORTANT: Include sufficient context in searchCode to ensure uniqueness
- Make sure replaceCode maintains correct syntax and indentation
- WARNING: The edit will fail if searchCode is found multiple times
- WARNING: The edit will fail if searchCode isn't found exactly as provided
```

## Implementation

When creating a new tool, define the description following this structure:

```typescript
createTool({
  id: 'tool_id',
  name: 'ToolName',
  description: '- First capability\n- Second capability\n- Third capability\n- Use this tool when...\n- For alternative case, use AlternativeTool instead\n\nUsage notes:\n- First usage note\n- Second usage note\n- IMPORTANT: Critical guidance\n- WARNING: Potential pitfall',
  // ...other tool properties
});
```