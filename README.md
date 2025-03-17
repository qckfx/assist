<div id="toc" align="center">
  <ul style="list-style: none">
    <a href="https://github.com/qckfx/agent">
      <h1>qckfx agent</h1>
      <p>A powerful software engineering AI assistant for your terminal</p>
    </a>
  </ul>
</div>

<p align="center">
  Chat with an AI that can read files, search your codebase, and execute bash commands.<br>
  Compatible with workflows similar to Anthropic's Claude Code.
</p>

<p align="center">
  <a href="https://github.com/qckfx/agent/blob/main/LICENSE">
    <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  </a>
  <a href="https://discord.gg/DbTkJm43s5">
    <img alt="Discord Community" src="https://img.shields.io/discord/1351120157392769055?color=7289DA&label=discord&logo=discord&logoColor=white" />
  </a>
  <a href="https://www.npmjs.com/package/qckfx">
    <img alt="npm package" src="https://img.shields.io/npm/v/qckfx.svg?style=flat" />
  </a>
  <a href="https://qckfx.com">
    <img alt="qckfx platform" src="https://img.shields.io/badge/platform-qckfx.com-purple" />
  </a>
</p>

<p align="center">
  <a href="https://discord.gg/DbTkJm43s5">
    <img src="https://img.shields.io/badge/join-discord-7289DA?style=for-the-badge&logo=discord&logoColor=white" alt="Join our Discord server" />
  </a>
</p>

---

## Quick Start

```bash
ANTHROPIC_API_KEY=your_key_here npx qckfx
```

## Core Features

1. **File Operations**: Read, edit, and create files in your codebase
2. **Code Search**: Find code with glob patterns and grep-like searches
3. **Bash Command Execution**: Run terminal commands with proper permission handling
4. **Interactive Chat**: Have multi-turn conversations with context preservation
5. **Claude Integration**: Powered by Anthropic's Claude models with tool calling

## Architecture

qckfx agent combines an intelligent LLM with a modular set of tools that interact with your development environment:

```
qckfx agent
├── Core
│   ├── AgentRunner (orchestrates the entire process)
│   ├── ToolRegistry (manages available tools)
│   ├── PermissionManager (handles permission requests)
│   └── ModelClient (interacts with the LLM)
├── Providers
│   ├── AnthropicProvider (for Claude models)
│   └── (other providers)
├── Tools
│   ├── BashTool
│   ├── GlobTool
│   ├── GrepTool
│   ├── LSTool
│   ├── FileReadTool
│   ├── FileEditTool
│   └── FileWriteTool
└── Utils
    ├── Logger
    ├── Error Handling
    └── Token Management 
```

## Installation

```bash
# Install globally
npm install -g qckfx

# Or run directly with npx
npx qckfx
```

## Usage Examples

### Basic Terminal Usage

Just run the command and start chatting:

```bash
# With global installation
ANTHROPIC_API_KEY=your_key_here qckfx

# Or with npx
ANTHROPIC_API_KEY=your_key_here npx qckfx
```

This will start an interactive session where you can chat with Claude. The agent can use a variety of tools to assist you with software development tasks.

Example conversation:
```
🤖 qckfx agent 🤖
Type your queries and the AI will respond.
Type "exit" or "quit" to end the conversation.

You: What files are in the current directory?

AI: Here are the files and directories in the current directory:
1. README.md
2. docs (directory)
3. node_modules (directory)
4. package-lock.json
5. package.json
6. src (directory)

You: Find all the React components that use useEffect

AI: Searching for React components that use useEffect...
[Lists all matching files]

You: Explain how the permission system works in this codebase

AI: [Provides detailed explanation after analyzing relevant files]

You: exit

Goodbye! 👋
```

### Advanced Use Cases

The agent excels at complex software development tasks:

- **Debugging**: "Why is this function returning undefined when I pass an empty array?"
- **Code Generation**: "Write a utility function that validates email addresses"
- **Refactoring**: "Help me convert this class component to a functional component"
- **Exploration**: "Explain how the routing works in this codebase"
- **Testing**: "Generate unit tests for this API endpoint"

## Hosted Solution

Visit [qckfx.com](https://qckfx.com) for a hosted version of qckfx, designed specifically for fixing GitHub issues asynchronously and fully-autonomously.

## License

MIT
