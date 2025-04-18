/**
 * Agent Framework - Main entry point
 * 
 * This framework provides a modular, composition-based approach to building AI agents.
 * It follows a tool-based architecture where each capability is a separate module
 * that can be composed together.
 */

// Core components
import { createAgentRunner } from './core/AgentRunner';
import { createToolRegistry } from './core/ToolRegistry';
import { createPermissionManager } from './core/PermissionManager';
import { createModelClient } from './core/ModelClient';
import { 
  createDefaultPromptManager, 
  createPromptManager,
  PromptManager 
} from './core/PromptManager';

// Providers
import { createAnthropicProvider } from './providers/AnthropicProvider';

// Tools
import { createTool } from './tools/createTool';
import { createBashTool } from './tools/BashTool';
import { createGlobTool } from './tools/GlobTool';
import { createGrepTool } from './tools/GrepTool';
import { createLSTool } from './tools/LSTool';
import { createFileReadTool } from './tools/FileReadTool';
import { createFileEditTool } from './tools/FileEditTool';
import { createFileWriteTool } from './tools/FileWriteTool';
import { createThinkTool } from './tools/ThinkTool';
import { createBatchTool } from './tools/BatchTool';

// Utils
import { createLogger, LogLevel, LogCategory } from './utils/logger';
import { createErrorHandler, createError } from './utils/ErrorHandler';
import { LocalExecutionAdapter } from './utils/LocalExecutionAdapter';
import { E2BExecutionAdapter } from './utils/E2BExecutionAdapter';
import { DockerContainerManager } from './utils/DockerContainerManager';
import { DockerExecutionAdapter } from './utils/DockerExecutionAdapter';

// Types
import { Agent, AgentConfig, RepositoryEnvironment } from './types/main';
import { Tool } from './types/tool';
import { ErrorType } from './types/error';
import { ModelProvider } from './types/model';
import { createContextWindow } from './types/contextWindow';

/**
 * Creates a complete agent with default tools
 * @param config - Agent configuration
 * @returns The configured agent
 */
const createAgent = (config: AgentConfig): Agent => {
  if (!config.modelProvider) {
    throw new Error('Agent requires a modelProvider function');
  }
  
  // Create core components
  const logger = config.logger || createLogger({ level: LogLevel.INFO });
  
  // Create tool registry first
  const toolRegistry = createToolRegistry();
  
  const permissionManager = createPermissionManager(
    toolRegistry,
    {
      uiHandler: config.permissionUIHandler
    }
  );
  
  const modelClient = createModelClient({
    modelProvider: config.modelProvider as ModelProvider,
    promptManager: config.promptManager
  });
  
  // Create and register default tools
  const tools: Tool[] = [
    createBashTool(),
    createGlobTool(),
    createGrepTool(),
    createLSTool(),
    createFileReadTool(),
    createFileEditTool(),
    createFileWriteTool(),
    createThinkTool(),
    createBatchTool()
  ];
  
  tools.forEach(tool => toolRegistry.registerTool(tool));
  
  // Create the agent runner
  const agentRunner = async () => {
    let executionAdapter;
    
    console.log(`🌕🌕🌕Creating agent runner with environment type ${config.environment.type}`);
    // Select the appropriate execution adapter based on environment type
    switch (config.environment.type) {
      case 'local':
        executionAdapter = new LocalExecutionAdapter();
        break;
      case 'docker': {
        // Create container manager and adapter
        const containerManager = new DockerContainerManager({ logger });
        executionAdapter = new DockerExecutionAdapter(containerManager, { logger });
        break;
      }
      case 'e2b':
        executionAdapter = await E2BExecutionAdapter.create(config.environment.sandboxId);
        break;
      default:
        executionAdapter = new LocalExecutionAdapter();
    }
    
    return createAgentRunner({
      modelClient,
      toolRegistry,
      permissionManager,
      logger,
      executionAdapter,
      promptManager: config.promptManager
    });
  };
  
  // Create state manager
  
  // Return the complete agent interface
  return {
    // Core components
    agentRunner,
    toolRegistry,
    permissionManager,
    modelClient,
    environment: config.environment,
    logger,
    
    // Helper methods
    async processQuery(query, sessionState = { contextWindow: createContextWindow(), agentServiceConfig: { defaultModel: '', permissionMode: 'interactive', allowedTools: [], cachingEnabled: true } }) {
      const runner = await agentRunner();
      return runner.processQuery(query, sessionState);
    },
    
    async runConversation(initialQuery) {
      const runner = await agentRunner();
      return runner.runConversation(initialQuery);
    },
    
    registerTool(tool) {
      toolRegistry.registerTool(tool);
    }
  };
};

// Export everything
export {
  // Factory function
  createAgent,
  
  // Core components
  createAgentRunner,
  createToolRegistry,
  createPermissionManager,
  createModelClient,
  createDefaultPromptManager,
  createPromptManager,
  PromptManager,
  
  // Providers
  createAnthropicProvider,
  
  // Tools
  createTool,
  createBashTool,
  createGlobTool,
  createGrepTool,
  createLSTool,
  createFileReadTool,
  createFileEditTool,
  createFileWriteTool,
  createThinkTool,
  createBatchTool,
  
  // Utils
  createLogger,
  LogLevel,
  LogCategory,
  createErrorHandler,
  createError,
  ErrorType,
  RepositoryEnvironment
};

// Server exports
export { startServer } from './server';
export { createServerConfig, getServerUrl } from './server/config';
export type { ServerConfig } from './server/config';