/**
 * React hook for tool execution events
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import { WebSocketEvent } from '../types/api';
import { throttle } from '@/utils/performance';

/**
 * Interface for tool execution event data
 */
export interface ToolExecution {
  id: string;
  tool: string;
  toolName: string;
  status: 'running' | 'completed' | 'error';
  args?: Record<string, unknown>;
  paramSummary?: string;
  result?: any;
  error?: {
    message: string;
    stack?: string;
  };
  startTime: number;
  endTime?: number;
  executionTime?: number;
  timestamp?: number; // For backward compatibility
}

// Interface for batched tool executions
export interface ToolExecutionBatch {
  toolId: string;
  results: Array<any>;
  isBatched: boolean;
  batchSize: number;
}

/**
 * Hook for subscribing to tool execution events
 */
// Helper function to generate better tool descriptions
const getImprovedToolDescription = (
  toolId: string, 
  toolName: string, 
  data: any
): string => {
  // Check if data has args to use for description
  const args = data.tool?.args || data.args || {};
  
  // Specialized descriptions based on common tool types
  if (toolName.includes('Glob')) {
    return `Searching for files: ${args.pattern || 'files'}`;
  }
  if (toolName.includes('Grep')) {
    return `Searching for content: ${args.pattern || 'pattern'}`;
  }
  if (toolName.includes('Bash')) {
    return `Running command: ${String(args.command || '').slice(0, 50)}${String(args.command || '').length > 50 ? '...' : ''}`;
  }
  if (toolName.includes('View') || toolName.includes('Read')) {
    const filePath = args.file_path || args.path || '';
    return `Reading file: ${filePath || 'file'}`;
  }
  if (toolName.includes('Edit') || toolName.includes('Write')) {
    const filePath = args.file_path || args.path || '';
    return `Editing file: ${filePath || 'file'}`;
  }
  if (toolName.includes('LS')) {
    const path = args.path || '.';
    return `Listing files in: ${path}`;
  }
  if (toolName.includes('Agent')) {
    const promptStart = String(args.prompt || '').slice(0, 50);
    return `Running agent to: ${promptStart}${String(args.prompt || '').length > 50 ? '...' : ''}`;
  }
  
  // For other tools, try to extract useful parameter information
  if (Object.keys(args).length > 0) {
    // Find non-generic parameters to show
    const meaningfulParams = Object.keys(args).filter(key => 
      !['type', 'id', 'name', 'tool', 'timestamp'].includes(key.toLowerCase())
    );
    
    if (meaningfulParams.length > 0) {
      const paramKey = meaningfulParams[0];
      const paramValue = String(args[paramKey]).slice(0, 50);
      return `${toolName}: ${paramKey}=${paramValue}${String(args[paramKey]).length > 50 ? '...' : ''}`;
    }
  }
  
  // For result-based tool descriptions
  if (data.result) {
    if (typeof data.result === 'object') {
      // For search results, often includes counts
      if ('count' in data.result || 'matches' in data.result) {
        return `${toolName} found ${data.result.count || data.result.matches?.length || 'results'}`;
      }
      
      // For file operations
      if ('fileName' in data.result || 'file' in data.result) {
        return `${toolName} processed ${data.result.fileName || data.result.file}`;
      }
    }
  }
  
  // Fallback to generic but slightly better description
  return `${toolName} completed`;
};

export function useToolStream(sessionId?: string) {
  const { subscribe, subscribeToBatch } = useWebSocket(sessionId);
  
  // Enhanced state for tool executions
  const [state, setState] = useState<{
    results: Record<string, any>;
    activeTools: Record<string, boolean>;
    latestExecution: any | null;
    // New state for visualization
    toolExecutions: Record<string, ToolExecution>;
    activeToolCount: number;
    toolHistory: ToolExecution[];
  }>({
    results: {},
    activeTools: {},
    latestExecution: null,
    // New state for visualization
    toolExecutions: {},
    activeToolCount: 0,
    toolHistory: [],
  });
  
  // Create a buffer for batched updates
  const [toolBuffers, setToolBuffers] = useState<
    Record<string, Array<any>>
  >({});
  
  // Throttled state update for high-frequency tools
  const updateState = useCallback(
    throttle((toolId: string, result: any, toolName: string = toolId) => {
      setState(prev => {
        // Create a ToolExecution object for high-frequency tool updates with better description
        const execution: ToolExecution = {
          id: `${toolId}-${Date.now()}`,
          tool: toolId,
          toolName,
          status: 'completed', // High-frequency tools update so quickly we treat them as immediately completed
          result,
          paramSummary: getImprovedToolDescription(toolId, toolName, { tool: { args: {} }, result }),
          startTime: Date.now() - 50, // Approximate startTime
          endTime: Date.now(),
          executionTime: 50, // Approximate execution time
        };
        
        // Add to history (limited to last 100 items)
        const toolHistory = [...prev.toolHistory, execution];
        if (toolHistory.length > 100) {
          toolHistory.shift();
        }
        
        return {
          ...prev,
          results: {
            ...prev.results,
            [toolId]: result,
          },
          activeTools: {
            ...prev.activeTools,
            [toolId]: true,
          },
          // New state for visualization
          toolExecutions: {
            ...prev.toolExecutions,
            [toolId]: execution,
          },
          toolHistory,
        };
      });
    }, 100),
    []
  );
  
  // Handle batch tool execution events
  const handleToolExecutionBatch = useCallback((data: ToolExecutionBatch) => {
    const { toolId, results } = data;
    
    // Update tool buffers
    setToolBuffers(prev => ({
      ...prev,
      [toolId]: [...(prev[toolId] || []), ...results]
    }));
    
    // Update state with the latest result only (for UI responsiveness)
    if (results.length > 0) {
      const latestResult = results[results.length - 1];
      const toolName = latestResult.tool?.name || toolId;
      
      // Create a ToolExecution object for the batch
      const execution: ToolExecution = {
        id: `${toolId}-batch-${Date.now()}`,
        tool: toolId,
        toolName,
        status: 'completed', // Batch events are considered completed immediately
        result: latestResult.result,
        paramSummary: `Batch execution (${results.length} items)`,
        startTime: Date.now() - (results.length * 50), // Rough estimate of start time
        endTime: Date.now(),
        executionTime: results.length * 50, // Rough estimate of execution time
      };
      
      setState(prev => {
        // Add to history
        const toolHistory = [...prev.toolHistory, execution];
        if (toolHistory.length > 100) {
          toolHistory.shift();
        }
        
        return {
          ...prev,
          results: {
            ...prev.results,
            [toolId]: latestResult.result,
          },
          activeTools: {
            ...prev.activeTools,
            [toolId]: true,
          },
          latestExecution: latestResult,
          // New state for visualization
          toolExecutions: {
            ...prev.toolExecutions,
            [toolId]: execution,
          },
          toolHistory,
        };
      });
    }
  }, []);
  
  // Handle individual tool execution events
  const handleToolExecution = useCallback((data: any) => {
    const toolId = data.tool.id;
    const toolName = data.tool.name || toolId;
    
    // Create a ToolExecution object for the legacy event with a better description
    const execution: ToolExecution = {
      id: `${toolId}-${Date.now()}`,
      tool: toolId,
      toolName,
      status: 'completed', // Legacy events are considered completed immediately
      result: data.result,
      // Generate a more informative description based on the tool type
      paramSummary: getImprovedToolDescription(toolId, toolName, data),
      startTime: Date.now() - 100, // Approximate startTime for legacy events
      endTime: Date.now(),
      executionTime: 100, // Approximate execution time for legacy events
    };
    
    // For frequently updating tools, use throttling
    if (isHighFrequencyTool(toolId)) {
      updateState(toolId, data.result, toolName);
      
      // Still add to buffer for history
      setToolBuffers(prev => ({
        ...prev,
        [toolId]: [...(prev[toolId] || []), data]
      }));
    } else {
      // For normal tools, update immediately
      setState(prev => {
        // Add to history (limited to 100 items)
        const toolHistory = [...prev.toolHistory, execution];
        if (toolHistory.length > 100) {
          toolHistory.shift();
        }
        
        return {
          ...prev,
          results: {
            ...prev.results,
            [toolId]: data.result,
          },
          activeTools: {
            ...prev.activeTools,
            [toolId]: true,
          },
          latestExecution: data,
          // New state for visualization
          toolExecutions: {
            ...prev.toolExecutions,
            [toolId]: execution,
          },
          toolHistory,
        };
      });
      
      // Add to buffer
      setToolBuffers(prev => ({
        ...prev,
        [toolId]: [...(prev[toolId] || []), data]
      }));
    }
  }, [updateState]);
  
  // Helper to identify high-frequency tools
  const isHighFrequencyTool = (toolId: string) => {
    // Tools that tend to emit many events in rapid succession
    const highFrequencyTools = ['FileReadTool', 'GrepTool', 'GlobTool', 'BashTool'];
    return highFrequencyTools.some(id => toolId.includes(id));
  };
  
  // Handle processing completed
  const handleProcessingCompleted = useCallback(() => {
    // Mark all tools as inactive
    setState(prev => {
      // Get current timestamp
      const now = Date.now();
      
      // Update any running tools to completed state
      const updatedToolExecutions = { ...prev.toolExecutions };
      
      for (const toolId in updatedToolExecutions) {
        const tool = updatedToolExecutions[toolId];
        if (tool.status === 'running') {
          updatedToolExecutions[toolId] = {
            ...tool,
            status: 'completed',
            endTime: now,
            executionTime: tool.executionTime || (now - tool.startTime),
          };
        }
      }
      
      return {
        ...prev,
        activeTools: Object.keys(prev.activeTools).reduce((acc, key) => {
          acc[key] = false;
          return acc;
        }, {} as Record<string, boolean>),
        toolExecutions: updatedToolExecutions,
        activeToolCount: 0
      };
    });
  }, []);
  
  // Handle processing aborted
  const handleProcessingAborted = useCallback(() => {
    // Mark all tools as inactive
    setState(prev => {
      // Get current timestamp
      const now = Date.now();
      
      // Update any running tools to error state
      const updatedToolExecutions = { ...prev.toolExecutions };
      
      for (const toolId in updatedToolExecutions) {
        const tool = updatedToolExecutions[toolId];
        if (tool.status === 'running') {
          updatedToolExecutions[toolId] = {
            ...tool,
            status: 'error',
            error: { message: 'Processing aborted' },
            endTime: now,
            executionTime: tool.executionTime || (now - tool.startTime),
          };
        }
      }
      
      return {
        ...prev,
        activeTools: Object.keys(prev.activeTools).reduce((acc, key) => {
          acc[key] = false;
          return acc;
        }, {} as Record<string, boolean>),
        toolExecutions: updatedToolExecutions,
        activeToolCount: 0
      };
    });
  }, []);
  
  // Handle processing error
  const handleProcessingError = useCallback(() => {
    // Mark all tools as inactive
    setState(prev => {
      // Get current timestamp
      const now = Date.now();
      
      // Update any running tools to error state
      const updatedToolExecutions = { ...prev.toolExecutions };
      
      for (const toolId in updatedToolExecutions) {
        const tool = updatedToolExecutions[toolId];
        if (tool.status === 'running') {
          updatedToolExecutions[toolId] = {
            ...tool,
            status: 'error',
            error: { message: 'Processing error' },
            endTime: now,
            executionTime: tool.executionTime || (now - tool.startTime),
          };
        }
      }
      
      return {
        ...prev,
        activeTools: Object.keys(prev.activeTools).reduce((acc, key) => {
          acc[key] = false;
          return acc;
        }, {} as Record<string, boolean>),
        toolExecutions: updatedToolExecutions,
        activeToolCount: 0
      };
    });
  }, []);
  
  // Handler for tool execution started
  const handleToolExecutionStarted = useCallback((data: any) => {
    const { tool, args, paramSummary, timestamp } = data;
    const toolId = tool.id;
    const toolName = tool.name;
    
    setState(prev => {
      // Generate a consistent ID based on the tool ID so we can update it later
      // but also include a timestamp for uniqueness between different executions
      const executionId = `${toolId}-${new Date(timestamp).getTime()}`;
      
      // Create a new ToolExecution object
      const execution: ToolExecution = {
        id: executionId,
        tool: toolId,
        toolName,
        status: 'running',
        args: args || {},
        paramSummary: paramSummary || 'Tool execution',
        startTime: new Date(timestamp).getTime(),
      };
      
      // Add to toolExecutions
      const toolExecutions = {
        ...prev.toolExecutions,
        [executionId]: execution
      };
      
      // Update active tools
      const activeTools = {
        ...prev.activeTools,
        [executionId]: true
      };
      
      return {
        ...prev,
        toolExecutions,
        activeTools,
        activeToolCount: prev.activeToolCount + 1,
        latestExecution: execution
      };
    });
  }, []);
  
  // Handler for tool execution completed with improved synchronization
  const handleToolExecutionCompleted = useCallback((data: any) => {
    const { tool, result, paramSummary, executionTime, timestamp, startTime } = data;
    const toolId = tool.id;
    
    setState(prev => {
      // Generate the expected execution ID from startTime if available
      const expectedStartTime = startTime ? new Date(startTime).getTime() : null;
      
      // Find the existing execution by looking for a matching ID pattern or tool ID
      let matchingExecution: ToolExecution | null = null;
      let matchingExecutionId: string | null = null;
      
      // First try to find a tool with the same start time
      if (expectedStartTime) {
        const expectedId = `${toolId}-${expectedStartTime}`;
        if (prev.toolExecutions[expectedId]) {
          matchingExecution = prev.toolExecutions[expectedId];
          matchingExecutionId = expectedId;
        }
      }
      
      // If no match by start time, look for a running tool with matching tool ID
      if (!matchingExecution) {
        // Create a sorted array of tools by start time (newest first)
        const runningTools = Object.entries(prev.toolExecutions)
          .filter(([, execution]) => execution.tool === toolId && execution.status === 'running')
          .sort(([, a], [, b]) => b.startTime - a.startTime);
        
        if (runningTools.length > 0) {
          // Take the most recent running tool
          [matchingExecutionId, matchingExecution] = runningTools[0];
        }
      }
      
      // If still no match, create a fallback ID
      if (!matchingExecutionId) {
        matchingExecutionId = `${toolId}-${expectedStartTime || Date.now()}`;
      }
      
      // Get the existing execution or create a new one if none exists
      const prevExecution = matchingExecution || {
        id: matchingExecutionId,
        tool: toolId,
        toolName: tool.name,
        status: 'running',
        args: {},
        paramSummary: paramSummary || 'Tool execution',
        startTime: expectedStartTime || Date.now() - (executionTime || 0),
      };
      
      // Update with completion data but keep the original description
      const execution: ToolExecution = {
        ...prevExecution,
        status: 'completed',
        result,
        // Keep the original paramSummary to maintain consistency
        paramSummary: prevExecution.paramSummary,
        endTime: new Date(timestamp).getTime(),
        executionTime: executionTime || 
          (new Date(timestamp).getTime() - prevExecution.startTime),
      };
      
      // Add to history - without limiting size (let's show all tools)
      const toolHistory = [...prev.toolHistory, execution];
      
      // Simply update the toolExecutions map without limits
      const updatedToolExecutions = {
        ...prev.toolExecutions
      };
      
      // Add the current execution
      updatedToolExecutions[matchingExecutionId] = execution;
      
      return {
        ...prev,
        results: {
          ...prev.results,
          [toolId]: result,
        },
        toolExecutions: updatedToolExecutions,
        activeTools: {
          ...prev.activeTools,
          [matchingExecutionId]: false,
        },
        activeToolCount: Math.max(prev.activeToolCount - 1, 0),
        toolHistory,
        latestExecution: execution,
      };
    });
  }, []);
  
  // Handler for tool execution error
  const handleToolExecutionError = useCallback((data: any) => {
    const { tool, error, paramSummary, timestamp, startTime } = data;
    const toolId = tool.id;
    
    setState(prev => {
      // Generate the expected execution ID from startTime if available
      const expectedStartTime = startTime ? new Date(startTime).getTime() : null;
      
      // Find the existing execution by looking for a matching ID pattern or tool ID
      let matchingExecution: ToolExecution | null = null;
      let matchingExecutionId: string | null = null;
      
      // First try to find a tool with the same start time
      if (expectedStartTime) {
        const expectedId = `${toolId}-${expectedStartTime}`;
        if (prev.toolExecutions[expectedId]) {
          matchingExecution = prev.toolExecutions[expectedId];
          matchingExecutionId = expectedId;
        }
      }
      
      // If no match by start time, look for a running tool with matching tool ID
      if (!matchingExecution) {
        Object.entries(prev.toolExecutions).forEach(([id, execution]) => {
          if (execution.tool === toolId && execution.status === 'running') {
            matchingExecution = execution;
            matchingExecutionId = id;
          }
        });
      }
      
      // If still no match, create a fallback ID
      if (!matchingExecutionId) {
        matchingExecutionId = `${toolId}-${expectedStartTime || Date.now()}`;
      }
      
      // Get the existing execution or create a new one
      const prevExecution = matchingExecution || {
        id: matchingExecutionId,
        tool: toolId,
        toolName: tool.name,
        status: 'running',
        args: {},
        paramSummary: paramSummary || 'Tool execution',
        startTime: expectedStartTime || Date.now() - 100, // Assume error happened shortly after start if no start time
      };
      
      // Update with error data but keep the original description
      const execution: ToolExecution = {
        ...prevExecution,
        status: 'error',
        error,
        // Keep the original paramSummary to maintain consistency
        paramSummary: prevExecution.paramSummary,
        endTime: new Date(timestamp).getTime(),
        executionTime: new Date(timestamp).getTime() - prevExecution.startTime,
      };
      
      // Add to history - without limiting size
      const toolHistory = [...prev.toolHistory, execution];
      
      return {
        ...prev,
        toolExecutions: {
          ...prev.toolExecutions,
          [matchingExecutionId]: execution,
        },
        activeTools: {
          ...prev.activeTools,
          [matchingExecutionId]: false,
        },
        activeToolCount: Math.max(prev.activeToolCount - 1, 0),
        toolHistory,
        latestExecution: execution,
      };
    });
  }, []);

  // Set up event handlers
  useEffect(() => {
    // Subscribe to batched tool executions (still needed for performance)
    const unsubscribeBatch = subscribe(WebSocketEvent.TOOL_EXECUTION_BATCH, handleToolExecutionBatch);
    
    // Subscribe to processing events
    const unsubscribeCompleted = subscribe(WebSocketEvent.PROCESSING_COMPLETED, handleProcessingCompleted);
    const unsubscribeAborted = subscribe(WebSocketEvent.PROCESSING_ABORTED, handleProcessingAborted);
    const unsubscribeError = subscribe(WebSocketEvent.PROCESSING_ERROR, handleProcessingError);
    
    // Subscribe to tool visualization events - these are the primary events we use now
    const unsubscribeStarted = subscribe(WebSocketEvent.TOOL_EXECUTION_STARTED, handleToolExecutionStarted);
    const unsubscribeCompletedViz = subscribe(WebSocketEvent.TOOL_EXECUTION_COMPLETED, handleToolExecutionCompleted);
    const unsubscribeErrorViz = subscribe(WebSocketEvent.TOOL_EXECUTION_ERROR, handleToolExecutionError);
    
    // Clean up subscriptions
    return () => {
      unsubscribeBatch();
      unsubscribeCompleted();
      unsubscribeAborted();
      unsubscribeError();
      unsubscribeStarted();
      unsubscribeCompletedViz();
      unsubscribeErrorViz();
    };
  }, [
    subscribe, 
    handleToolExecutionBatch,
    handleProcessingCompleted,
    handleProcessingAborted,
    handleProcessingError,
    handleToolExecutionStarted,
    handleToolExecutionCompleted,
    handleToolExecutionError
  ]);
  
  // Clear results
  const clearResults = useCallback(() => {
    setState({
      results: {},
      activeTools: {},
      latestExecution: null,
      toolExecutions: {},
      activeToolCount: 0,
      toolHistory: [],
    });
    setToolBuffers({});
  }, []);
  
  // Function to access the full history of a specific tool
  const getToolHistory = useCallback((toolId: string) => {
    return toolBuffers[toolId] || [];
  }, [toolBuffers]);
  
  // Utility method to get active tools
  const getActiveTools = useCallback(() => {
    const tools = Object.entries(state.toolExecutions)
      .filter(([, tool]) => tool.status === 'running')
      .map(([, tool]) => tool);
    return tools;
  }, [state.toolExecutions]);

  // Utility method to get all completed tools from the history
  const getRecentTools = useCallback((count = 1000) => {
    const tools = state.toolHistory
      .filter(tool => tool.status !== 'running') // Exclude running tools which are already in active
      .reverse();
    // If a count limit is provided, respect it
    return count && count < tools.length ? tools.slice(0, count) : tools;
  }, [state.toolHistory]);

  // Utility method to get a specific tool execution by ID
  const getToolExecutionById = useCallback((toolId: string) => {
    return state.toolExecutions[toolId];
  }, [state.toolExecutions]);

  return {
    state,
    clearResults,
    getToolHistory,
    // Expose buffer information
    bufferSizes: Object.entries(toolBuffers).reduce(
      (acc, [toolId, buffer]) => ({ ...acc, [toolId]: buffer.length }),
      {}
    ),
    // New utility methods for tool visualization
    getActiveTools,
    getRecentTools,
    getToolExecutionById,
    hasActiveTools: state.activeToolCount > 0,
    activeToolCount: state.activeToolCount,
    toolHistory: state.toolHistory,
  };
}

export default useToolStream;