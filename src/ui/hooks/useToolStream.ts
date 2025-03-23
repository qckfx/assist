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
  result: any;
  timestamp: number;
}

// Added interface for batched tool executions
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
  
  // State for tool executions
  const [state, setState] = useState<{
    results: Record<string, any>;
    activeTools: Record<string, boolean>;
    latestExecution: any | null;
  }>({
    results: {},
    activeTools: {},
    latestExecution: null,
  });
  
  // Create a buffer for batched updates
  const [toolBuffers, setToolBuffers] = useState<
    Record<string, Array<any>>
  >({});
  
  // Throttled state update for high-frequency tools
  const updateState = useCallback(
    throttle((toolId: string, result: any) => {
      setState(prev => ({
        ...prev,
        results: {
          ...prev.results,
          [toolId]: result,
        },
        activeTools: {
          ...prev.activeTools,
          [toolId]: true,
        },
      }));
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
      
      setState(prev => {
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
        };
      });
    }
  }, []);
  
  // Handle individual tool execution events
  const handleToolExecution = useCallback((data: any) => {
    const toolId = data.tool.id;
    
    // For frequently updating tools, use throttling
    if (isHighFrequencyTool(toolId)) {
      updateState(toolId, data.result);
      
      // Still add to buffer for history
      setToolBuffers(prev => ({
        ...prev,
        [toolId]: [...(prev[toolId] || []), data]
      }));
    } else {
      // For normal tools, update immediately
      setState(prev => ({
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
      }));
      
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
    setState(prev => ({
      ...prev,
      activeTools: Object.keys(prev.activeTools).reduce((acc, key) => {
        acc[key] = false;
        return acc;
      }, {} as Record<string, boolean>),
    }));
  }, []);
  
  // Handle processing aborted
  const handleProcessingAborted = useCallback(() => {
    // Mark all tools as inactive
    setState(prev => ({
      ...prev,
      activeTools: Object.keys(prev.activeTools).reduce((acc, key) => {
        acc[key] = false;
        return acc;
      }, {} as Record<string, boolean>),
    }));
  }, []);
  
  // Handle processing error
  const handleProcessingError = useCallback(() => {
    // Mark all tools as inactive
    setState(prev => ({
      ...prev,
      activeTools: Object.keys(prev.activeTools).reduce((acc, key) => {
        acc[key] = false;
        return acc;
      }, {} as Record<string, boolean>),
    }));
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
    
    // Clean up subscriptions
    return () => {
      unsubscribeExecution();
      unsubscribeBatch();
      unsubscribeCompleted();
      unsubscribeAborted();
      unsubscribeError();
    };
  }, [
    subscribe, 
    handleToolExecution, 
    handleToolExecutionBatch,
    handleProcessingCompleted,
    handleProcessingAborted,
    handleProcessingError
  ]);
  
  // Clear results
  const clearResults = useCallback(() => {
    setState({
      results: {},
      activeTools: {},
      latestExecution: null,
    });
    setToolBuffers({});
  }, []);
  
  // Function to access the full history of a specific tool
  const getToolHistory = useCallback((toolId: string) => {
    return toolBuffers[toolId] || [];
  }, [toolBuffers]);
  
  return {
    state,
    clearResults,
    getToolHistory,
    // Expose buffer information
    bufferSizes: Object.entries(toolBuffers).reduce(
      (acc, [toolId, buffer]) => ({ ...acc, [toolId]: buffer.length }),
      {}
    ),
  };
}

export default useToolStream;