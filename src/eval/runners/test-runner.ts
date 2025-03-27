/**
 * Runs individual test cases for prompt evaluation
 */

import { createAgentRunner } from '../../core/AgentRunner';
import { createModelClient } from '../../core/ModelClient';
import { createToolRegistry } from '../../core/ToolRegistry';
import { createPermissionManager } from '../../core/PermissionManager';
import { createAnthropicProvider } from '../../providers/AnthropicProvider';
import { LogLevel, LogCategory, createLogger } from '../../utils/logger';
import { TestCase, MetricsData, SystemPromptConfig } from '../models/types';
import { E2BExecutionAdapter } from '../../utils/E2BExecutionAdapter';
import { createBashTool } from '../../tools/BashTool';
import { createGlobTool } from '../../tools/GlobTool';
import { createGrepTool } from '../../tools/GrepTool';
import { createLSTool } from '../../tools/LSTool';
import { createFileReadTool } from '../../tools/FileReadTool';
import { createFileEditTool } from '../../tools/FileEditTool';
import { createFileWriteTool } from '../../tools/FileWriteTool';

/**
 * Run a single test case with the given system prompt
 * 
 * @param testCase The test case to run
 * @param systemPrompt The system prompt configuration to use
 * @param executionAdapter E2B execution adapter for sandbox execution
 * @returns Metrics data from the test run
 */
export async function runTestCase(
  testCase: TestCase,
  systemPrompt: SystemPromptConfig,
  executionAdapter: E2BExecutionAdapter
): Promise<MetricsData> {
  console.log(`Running test case: ${testCase.name} with prompt: ${systemPrompt.name}`);
  
  // Create a logger for this test run
  const logger = createLogger({ 
    level: LogLevel.INFO,
    prefix: `Test ${testCase.id}`
  });
  
  // Set the base path for sandbox environment
  const basePath = '/home/user';
  
  // Add debug logging about the execution adapter
  console.log('Debug - Execution adapter:', {
    type: typeof executionAdapter,
    methods: Object.getOwnPropertyNames(Object.getPrototypeOf(executionAdapter)),
    properties: Object.getOwnPropertyNames(executionAdapter)
  });
  
  // Initialize the provider with the specified system prompt
  const provider = createAnthropicProvider({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: systemPrompt.model || 'claude-3-7-sonnet-20250219',
    logger
  });
  
  const modelClient = createModelClient({
    modelProvider: provider
  });
  
  // Initialize the tool registry
  const toolRegistry = createToolRegistry();
  
  // Register default tools for the sandbox environment
  // This ensures we have tools available for Anthropic's tool_choice parameter
  const tools = [
    createBashTool(),
    createGlobTool(),
    createGrepTool(),
    createLSTool(),
    createFileReadTool(),
    createFileEditTool(),
    createFileWriteTool()
  ];
  
  tools.forEach(tool => toolRegistry.registerTool(tool));
  
  // Create the permission manager with DANGER_MODE enabled for sandbox execution
  const permissionManager = createPermissionManager(toolRegistry, {
    logger,
    DANGER_MODE: true
  });
  
  // Always enable DANGER_MODE for sandbox testing
  permissionManager.enableDangerMode();
  
  // Create the agent runner
  const runner = createAgentRunner({
    modelClient,
    toolRegistry,
    permissionManager,
    executionAdapter,
    logger
  });
  
  // Prepare metrics collection
  const startTime = Date.now();
  let toolCalls = 0;
  let success = false;
  let notes = '';
  const tokenUsage = {
    input: 0,
    output: 0,
    total: 0,
  };
  
  // Set up tool event listeners to count approved tool calls
  const startListener = toolRegistry.onToolExecutionStart(() => {
    toolCalls++;
    console.log(`Tool call count increased to ${toolCalls}`);
  });
  
  // Also count completed tool calls in case any fail
  const completeListener = toolRegistry.onToolExecutionComplete((toolId) => {
    console.log(`Tool ${toolId} executed successfully`);
  });
  
  // Also count error calls
  const errorListener = toolRegistry.onToolExecutionError((toolId, args, error) => {
    console.log(`Tool ${toolId} failed with error: ${error.message}`);
  });
  
  try {
    // Run the test case
    const result = await runner.processQuery(testCase.instructions, { conversationHistory: [] });
    
    // Determine success based on the result - no error means success by default
    success = !result.error;
    
    // Extract token usage from the session state if available
    if (result.sessionState && result.sessionState.tokenUsage) {
      const usageData = result.sessionState.tokenUsage as any;
      
      // The TokenManager stores this as totalTokens
      if (usageData.totalTokens) {
        tokenUsage.total = usageData.totalTokens;
        // Split the total roughly 33% input / 67% output as an estimate
        tokenUsage.input = Math.floor(tokenUsage.total * 0.33);
        tokenUsage.output = tokenUsage.total - tokenUsage.input;
      }
    }
    
    // Custom success criteria if provided
    if (testCase.successCriteria && result.result) {
      success = testCase.successCriteria(result.result);
    }
    
    // Custom notes if provided
    if (testCase.notes && result.result) {
      notes = testCase.notes(result.result);
    }
  } catch (error) {
    console.error(`Error running test case ${testCase.name}:`, error);
    success = false;
    notes = `Error: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    // Clean up the event listeners
    startListener();
    completeListener();
    errorListener();
  }
  
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000; // Convert to seconds
  
  return {
    testCase: testCase.name,
    promptName: systemPrompt.name,
    duration,
    toolCalls,
    tokenUsage,
    success,
    notes,
  };
}