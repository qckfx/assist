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
        // Create a ToolExecution object for high-frequency tool updates
        const execution: ToolExecution = {
          id: `${toolId}-${Date.now()}`,
          tool: toolId,
          toolName,
          status: 'completed', // High-frequency tools update so quickly we treat them as immediately completed
          result,
          paramSummary: `High-frequency tool execution`,
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
    
    // Create a ToolExecution object for the legacy event
    const execution: ToolExecution = {
      id: `${toolId}-${Date.now()}`,
      tool: toolId,
      toolName,
      status: 'completed', // Legacy events are considered completed immediately
      result: data.result,
      paramSummary: `Tool execution result`,
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
  
  // Handler for tool execution completed
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
      
      // Update with completion data
      const execution: ToolExecution = {
        ...prevExecution,
        status: 'completed',
        result,
        paramSummary: paramSummary || prevExecution.paramSummary,
        endTime: new Date(timestamp).getTime(),
        executionTime: executionTime || 
          (new Date(timestamp).getTime() - prevExecution.startTime),
      };
      
      // Add to history
      const toolHistory = [...prev.toolHistory, execution];
      
      // Keep history at a reasonable size
      if (toolHistory.length > 100) {
        toolHistory.shift();
      }
      
      return {
        ...prev,
        results: {
          ...prev.results,
          [toolId]: result,
        },
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
      
      // Update with error data
      const execution: ToolExecution = {
        ...prevExecution,
        status: 'error',
        error,
        paramSummary: paramSummary || prevExecution.paramSummary,
        endTime: new Date(timestamp).getTime(),
        executionTime: new Date(timestamp).getTime() - prevExecution.startTime,
      };
      
      // Add to history
      const toolHistory = [...prev.toolHistory, execution];
      
      // Keep history at a reasonable size
      if (toolHistory.length > 100) {
        toolHistory.shift();
      }
      
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
    // Subscribe to individual tool executions
    const unsubscribeExecution = subscribe(WebSocketEvent.TOOL_EXECUTION, handleToolExecution);
    
    // Subscribe to batched tool executions
    const unsubscribeBatch = subscribe(WebSocketEvent.TOOL_EXECUTION_BATCH, handleToolExecutionBatch);
    
    // Subscribe to processing events
    const unsubscribeCompleted = subscribe(WebSocketEvent.PROCESSING_COMPLETED, handleProcessingCompleted);
    const unsubscribeAborted = subscribe(WebSocketEvent.PROCESSING_ABORTED, handleProcessingAborted);
    const unsubscribeError = subscribe(WebSocketEvent.PROCESSING_ERROR, handleProcessingError);
    
    // Subscribe to new tool visualization events
    const unsubscribeStarted = subscribe(WebSocketEvent.TOOL_EXECUTION_STARTED, handleToolExecutionStarted);
    const unsubscribeCompletedViz = subscribe(WebSocketEvent.TOOL_EXECUTION_COMPLETED, handleToolExecutionCompleted);
    const unsubscribeErrorViz = subscribe(WebSocketEvent.TOOL_EXECUTION_ERROR, handleToolExecutionError);
    
    // Clean up subscriptions
    return () => {
      unsubscribeExecution();
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
    handleToolExecution, 
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
      .filter(([_, tool]) => tool.status === 'running')
      .map(([_, tool]) => tool);
    console.log('Active tools:', tools.length, tools);
    return tools;
  }, [state.toolExecutions]);

  // Utility method to get recent tools from the history
  const getRecentTools = useCallback((count = 5) => {
    const tools = state.toolHistory
      .filter(tool => tool.status !== 'running') // Exclude running tools which are already in active
      .slice(-count)
      .reverse();
    console.log('Recent tools:', tools.length, tools);
    return tools;
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