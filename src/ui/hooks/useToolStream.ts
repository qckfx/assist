/**
 * React hook for tool execution events
 */
import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { WebSocketEvent } from '../types/api';

/**
 * Interface for tool execution event data
 */
export interface ToolExecution {
  id: string;
  tool: string;
  result: any;
  timestamp: number;
}

/**
 * Hook for subscribing to tool execution events
 */
export function useToolStream(sessionId?: string) {
  const { subscribe, subscribeToBatch } = useWebSocket(sessionId);
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([]);
  const [lastToolExecution, setLastToolExecution] = useState<ToolExecution | null>(null);
  
  // Handle individual tool execution events
  useEffect(() => {
    const unsubscribe = subscribe(WebSocketEvent.TOOL_EXECUTION, (data) => {
      const execution = {
        id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        tool: data.tool,
        result: data.result,
        timestamp: Date.now(),
      };
      
      setToolExecutions((prev) => [...prev, execution]);
      setLastToolExecution(execution);
    });
    
    return unsubscribe;
  }, [subscribe]);
  
  // Handle batched tool execution events
  useEffect(() => {
    const unsubscribe = subscribeToBatch(WebSocketEvent.TOOL_EXECUTION, (batch) => {
      if (batch.length === 0) return;
      
      const newExecutions = batch.map((item) => ({
        id: `tool-${item.timestamp}-${Math.random().toString(36).slice(2, 9)}`,
        tool: item.data.tool,
        result: item.data.result,
        timestamp: item.timestamp,
      }));
      
      setToolExecutions((prev) => [...prev, ...newExecutions]);
      setLastToolExecution(newExecutions[newExecutions.length - 1]);
    });
    
    return unsubscribe;
  }, [subscribeToBatch]);
  
  // Clear tool executions
  const clearToolExecutions = useCallback(() => {
    setToolExecutions([]);
    setLastToolExecution(null);
  }, []);
  
  return {
    toolExecutions,
    lastToolExecution,
    clearToolExecutions,
  };
}

export default useToolStream;