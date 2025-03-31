/**
 * React hook for tool execution events
 */
import { useState, useCallback, useEffect } from 'react';
import { useWebSocket } from './useWebSocket';
import { WebSocketEvent, WebSocketEventMap } from '../types/api';
import { throttle } from '@/utils/performance';
import { ToolPreviewData, PreviewMode } from '../../types/preview';

// Type helper for event handlers to properly map WebSocketEvent enum to WebSocketEventMap
type EventData<E extends WebSocketEvent> = WebSocketEventMap[E];

/**
 * Interface for tool execution event data
 */

export interface ToolExecution {
  id: string;
  tool: string;
  toolName: string;
  status: 'running' | 'completed' | 'error' | 'awaiting-permission' | 'aborted';
  args?: Record<string, unknown>;
  paramSummary?: string;
  result?: unknown;
  error?: {
    message: string;
    stack?: string;
  };
  startTime: number;
  endTime?: number;
  executionTime?: number;
  timestamp?: number; // For backward compatibility
  requiresPermission?: boolean;
  permissionId?: string;
  
  // Add preview data and view mode
  preview?: ToolPreviewData;
  viewMode?: PreviewMode;
}

// Interface for batched tool executions
export interface ToolExecutionBatch {
  toolId: string;
  results: Array<unknown>;
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
  data: Record<string, unknown>
): string => {
  // Check if data has args to use for description
  const args = (typeof data.tool === 'object' && data.tool !== null && 'args' in data.tool) ? 
    (data.tool.args as Record<string, unknown>) : 
    ('args' in data ? (data.args as Record<string, unknown>) : {});
  
  // Specialized descriptions based on common tool types - check both toolId and toolName
  const toolInfo = (toolName || '') + '|' + (toolId || '');
  
  // Search tools
  if (toolInfo.includes('Glob') || toolInfo.includes('glob')) {
    return `Searching for files: ${args.pattern || 'files'}`;
  }
  if (toolInfo.includes('Grep') || toolInfo.includes('grep')) {
    return `Searching for content: ${args.pattern || 'pattern'}`;
  }
  
  // Command execution
  if (toolInfo.includes('Bash') || toolInfo.includes('bash')) {
    return `Running command: ${String(args.command || '').slice(0, 50)}${String(args.command || '').length > 50 ? '...' : ''}`;
  }
  
  // File reading
  if (toolInfo.includes('View') || toolInfo.includes('Read') || 
      toolInfo.includes('file_read')) {
    const filePath = args.file_path || args.path || '';
    return `Reading file: ${filePath || 'file'}`;
  }
  
  // File editing
  if (toolInfo.includes('Edit') || toolInfo.includes('Write') || 
      toolInfo.includes('file_edit') || toolInfo.includes('file_write')) {
    const filePath = args.file_path || args.path || '';
    return `Editing file: ${filePath || 'file'}`;
  }
  
  // Directory listing
  if (toolInfo.includes('LS') || toolInfo.includes('ls')) {
    const path = args.path || '.';
    return `Listing files in: ${path}`;
  }
  
  // Agent execution
  if (toolInfo.includes('Agent') || toolInfo.includes('agent')) {
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
    const result = data.result as Record<string, unknown>;
    if (typeof result === 'object' && result !== null) {
      // For search results, often includes counts
      if ('count' in result || 'matches' in result) {
        return `${toolName} found ${result.count || (result.matches as unknown[])?.length || 'results'}`;
      }
      
      // For file operations
      if ('fileName' in result || 'file' in result) {
        return `${toolName} processed ${result.fileName || result.file}`;
      }
    }
  }
  
  // Fallback to generic but slightly better description
  return `${toolName} completed`;
};

export function useToolStream() {
  const { subscribe, subscribeToBatch: _subscribeToBatch } = useWebSocket();
  
  // Enhanced state for tool executions
  const [state, setState] = useState<{
    results: Record<string, unknown>;
    activeTools: Record<string, boolean>;
    latestExecution: unknown | null;
    // New state for visualization
    toolExecutions: Record<string, ToolExecution>;
    activeToolCount: number;
    toolHistory: ToolExecution[];
    // Add view mode preferences
    viewModes: Record<string, PreviewMode>;
    defaultViewMode: PreviewMode;
    // Add ID mappings to track tools across state transitions
    toolIdMappings?: Record<string, string>;
  }>({
    results: {},
    activeTools: {},
    latestExecution: null,
    // New state for visualization
    toolExecutions: {},
    activeToolCount: 0,
    toolHistory: [],
    // Initialize view modes
    viewModes: {},
    defaultViewMode: PreviewMode.BRIEF,
    // Initialize tool ID mappings
    toolIdMappings: {},
  });
  
  // Create a buffer for batched updates
  const [toolBuffers, setToolBuffers] = useState<
    Record<string, Array<unknown>>
  >({});
  
  // Throttled state update for high-frequency tools
  // Create a properly typed wrapper function for throttle
  const updateStateImpl = useCallback((toolId: string, result: unknown, toolName?: string) => {
    setState(prev => {
        // Create a ToolExecution object for high-frequency tool updates with better description
        const execution: ToolExecution = {
          id: `${toolId}-${Date.now()}`,
          tool: toolId,
          toolName: toolName || toolId,
          status: 'completed', // High-frequency tools update so quickly we treat them as immediately completed
          result,
          paramSummary: getImprovedToolDescription(toolId, toolName || toolId, { tool: { args: {} }, result }),
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
    }, []
  );
  
  // Apply throttle to the implementation function with proper typing
  const updateState = useCallback(
    throttle<typeof updateStateImpl>(updateStateImpl, 100), 
    [updateStateImpl]
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
      const latestResult = results[results.length - 1] as Record<string, unknown>;
      const toolObj = latestResult.tool as Record<string, unknown> || {};
      const toolName = (toolObj.name as string) || toolId;
      
      // Create a ToolExecution object for the batch
      const execution: ToolExecution = {
        id: `${toolId}-batch-${Date.now()}`,
        tool: toolId,
        toolName,
        status: 'completed', // Batch events are considered completed immediately
        result: latestResult.result as unknown,
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
            [toolId]: latestResult.result as unknown,
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
  
  // Handle individual tool execution events (can be removed if not called anywhere)
  const _handleToolExecution = useCallback((data: Record<string, unknown>) => {
    const tool = data.tool as Record<string, unknown>;
    const toolId = tool.id as string;
    const toolName = (tool.name as string) || toolId;
    
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
    const highFrequencyTools = [
      'FileReadTool', 'file_read',
      'GrepTool', 'grep',
      'GlobTool', 'glob',
      'BashTool', 'bash'
    ];
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
        if (tool.status === 'running' || tool.status === 'awaiting-permission') {
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
      
      // Update any running tools to aborted state
      const updatedToolExecutions = { ...prev.toolExecutions };
      
      for (const toolId in updatedToolExecutions) {
        const tool = updatedToolExecutions[toolId];
        if (tool.status === 'running' || tool.status === 'awaiting-permission') {
          updatedToolExecutions[toolId] = {
            ...tool,
            status: 'aborted',
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
        if (tool.status === 'running' || tool.status === 'awaiting-permission') {
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
  const handleToolExecutionStarted = useCallback((data: EventData<WebSocketEvent.TOOL_EXECUTION_STARTED>) => {
    const { tool, args, paramSummary, timestamp } = data;
    const toolId = tool.id;
    const toolName = tool.name;
    const executionId = tool.executionId as string; // Use server-provided executionId if available
    
    setState(prev => {
      // Generate a consistent ID based on the provided executionId or create one
      // This ID will be used consistently throughout the tool lifecycle
      const uniqueExecutionId = executionId || `${toolId}-${new Date(timestamp).getTime()}`;
      
      console.log('Tool execution started', { 
        toolId, 
        toolName, 
        receivedExecutionId: executionId,
        uniqueExecutionId,
        timestamp
      });
      
      // Create a new ToolExecution object
      const execution: ToolExecution = {
        id: uniqueExecutionId,
        tool: toolId,
        toolName,
        status: 'running',
        args: args || {},
        paramSummary: paramSummary || 'Tool execution',
        startTime: new Date(timestamp).getTime(),
      };
      
      // Set up mappings to help link this tool across its lifecycle
      const mappings = { ...(prev.toolIdMappings || {}) };
      
      // Store a mapping using the executionId if provided
      if (executionId) {
        mappings[`executionId:${executionId}`] = uniqueExecutionId;
      }
      
      // Store a mapping by toolId+timestamp
      const timeKey = `${toolId}-${new Date(timestamp).getTime()}`;
      mappings[timeKey] = uniqueExecutionId;
      
      // Add to toolExecutions
      const toolExecutions = {
        ...prev.toolExecutions,
        [uniqueExecutionId]: execution
      };
      
      // Update active tools
      const activeTools = {
        ...prev.activeTools,
        [uniqueExecutionId]: true
      };
      
      // Count active tools (running or awaiting permission)
      const activeToolCount = Object.values(toolExecutions).filter(
        t => t.status === 'running' || t.status === 'awaiting-permission'
      ).length;
      
      return {
        ...prev,
        toolExecutions,
        activeTools,
        activeToolCount,
        toolIdMappings: mappings,
        latestExecution: execution
      };
    });
  }, []);
  
  // Handler for tool execution completed with improved synchronization
  const handleToolExecutionCompleted = useCallback((data: EventData<WebSocketEvent.TOOL_EXECUTION_COMPLETED>) => {
    const { tool, result, paramSummary, executionTime, timestamp, startTime, preview } = data;
    const toolId = tool.id;
    const executionId = tool.executionId as string; // Get executionId from tool data if present
    
    setState(prev => {
      // Find the existing execution using multiple strategies
      let matchingExecution: ToolExecution | null = null;
      let matchingExecutionId: string | null = null;
      
      console.log('Looking for matching tool execution', {
        toolId,
        executionId,
        hasExecutionId: !!executionId,
        hasMappings: !!prev.toolIdMappings,
        mappingKeys: prev.toolIdMappings ? Object.keys(prev.toolIdMappings) : [],
        hasStartTime: !!startTime 
      });
      
      // Strategy 1: Try direct executionId match if available
      if (executionId && executionId in prev.toolExecutions) {
        matchingExecution = prev.toolExecutions[executionId];
        matchingExecutionId = executionId;
        console.log(`Found direct match by executionId: ${executionId}`);
      }
      
      // Strategy 2: Try mapping lookup by executionId
      if (!matchingExecution && executionId && prev.toolIdMappings) {
        const mappedId = prev.toolIdMappings[`executionId:${executionId}`];
        if (mappedId && mappedId in prev.toolExecutions) {
          matchingExecution = prev.toolExecutions[mappedId];
          matchingExecutionId = mappedId;
          console.log(`Found match via executionId mapping: ${executionId} -> ${mappedId}`);
        }
      }
      
      // Strategy 3: Try by timestamp pattern
      if (!matchingExecution && startTime) {
        const expectedStartTime = new Date(startTime).getTime();
        const expectedId = `${toolId}-${expectedStartTime}`;
        
        // Direct match by ID pattern
        if (expectedId in prev.toolExecutions) {
          matchingExecution = prev.toolExecutions[expectedId];
          matchingExecutionId = expectedId;
          console.log(`Found match by ID pattern: ${expectedId}`);
        }
        
        // Lookup by pattern in mappings
        if (!matchingExecution && prev.toolIdMappings && prev.toolIdMappings[expectedId]) {
          const mappedId = prev.toolIdMappings[expectedId];
          if (mappedId in prev.toolExecutions) {
            matchingExecution = prev.toolExecutions[mappedId];
            matchingExecutionId = mappedId;
            console.log(`Found match via timestamp pattern mapping: ${expectedId} -> ${mappedId}`);
          }
        }
      }
      
      // Strategy 4: Find most recent running tool with matching toolId
      if (!matchingExecution) {
        // Create a sorted array of tools by start time (newest first)
        const runningTools = Object.entries(prev.toolExecutions)
          .filter(([, execution]) => 
            // Match by tool ID or tool name, prioritizing running status
            (execution.tool === toolId || execution.toolName === tool.name) && 
            (execution.status === 'running' || execution.status === 'awaiting-permission')
          )
          .sort(([, a], [, b]) => b.startTime - a.startTime);
        
        if (runningTools.length > 0) {
          // Take the most recent running tool
          [matchingExecutionId, matchingExecution] = runningTools[0];
          console.log(`Found most recent running tool: ${matchingExecutionId}`);
        }
      }
      
      // Strategy 5: If all else fails, create a fallback ID that won't conflict
      if (!matchingExecutionId) {
        matchingExecutionId = `${toolId}-completion-${Date.now()}`;
        console.log(`No match found, using fallback ID: ${matchingExecutionId}`);
      }
      
      // Get the existing execution or create a new one if none exists
      const prevExecution = matchingExecution || {
        id: matchingExecutionId,
        tool: toolId,
        toolName: typeof tool.name === "string" ? tool.name : toolId,
        status: 'running',
        args: {},
        paramSummary: paramSummary || 'Tool execution',
        startTime: startTime ? new Date(startTime).getTime() : Date.now() - (executionTime || 0),
      };
      
      // Update with completion data but keep the original description and preview
      const execution: ToolExecution = {
        ...prevExecution,
        status: 'completed',
        result,
        // Keep the original paramSummary to maintain consistency
        paramSummary: prevExecution.paramSummary,
        endTime: new Date(timestamp).getTime(),
        executionTime: executionTime || 
          (new Date(timestamp).getTime() - prevExecution.startTime),
        // IMPORTANT: Prefer existing preview over new one to maintain visual consistency
        preview: prevExecution.preview || preview,
      };
      
      // Log completion details for debugging
      console.log('Tool execution completed', {
        toolId,
        matchingId: matchingExecutionId,
        existingStatus: prevExecution.status,
        hadPreviousPreview: !!prevExecution.preview,
        newPreviewProvided: !!preview,
        usingExistingPreview: !!prevExecution.preview && !!execution.preview
      });
      
      // Add to history - without limiting size (let's show all tools)
      const toolHistory = [...prev.toolHistory, execution];
      
      // Update the toolExecutions map
      const updatedToolExecutions = {
        ...prev.toolExecutions
      };
      
      // Add the current execution
      updatedToolExecutions[matchingExecutionId] = execution;
      
      // Count active tools after completion (running or awaiting permission)
      const activeTools = Object.values(updatedToolExecutions).filter(
        t => t.status === 'running' || t.status === 'awaiting-permission'
      );
      
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
        activeToolCount: activeTools.length,
        toolHistory,
        latestExecution: execution,
      };
    });
  }, []);
  
  // Handler for tool execution aborted
  const handleToolExecutionAborted = useCallback((data: EventData<WebSocketEvent.TOOL_EXECUTION_ABORTED>) => {
    const { tool, timestamp, startTime, abortTimestamp } = data;
    const toolId = tool.id;
    
    setState(prev => {
      // Find the existing execution by looking for a matching ID pattern or tool ID
      let matchingExecution: ToolExecution | null = null;
      let matchingExecutionId: string | null = null;
      
      // First try to find a tool with the same start time
      if (startTime) {
        const expectedStartTime = new Date(startTime).getTime();
        const expectedId = `${toolId}-${expectedStartTime}`;
        if (prev.toolExecutions[expectedId]) {
          matchingExecution = prev.toolExecutions[expectedId];
          matchingExecutionId = expectedId;
        }
      }
      
      // If no match by start time, look for a running tool with matching tool ID
      if (!matchingExecution) {
        const runningTools = Object.entries(prev.toolExecutions)
          .filter(([, execution]) => execution.tool === toolId && execution.status === 'running')
          .sort(([, a], [, b]) => b.startTime - a.startTime);
        
        if (runningTools.length > 0) {
          [matchingExecutionId, matchingExecution] = runningTools[0];
        }
      }
      
      // If still no match, create a fallback ID
      if (!matchingExecutionId) {
        matchingExecutionId = `${toolId}-${Date.now()}`;
      }
      
      // Get the existing execution or create a new one if none exists
      const prevExecution = matchingExecution || {
        id: matchingExecutionId,
        tool: toolId,
        toolName: tool.name,
        status: 'running',
        args: {},
        paramSummary: 'Tool execution (aborted)',
        startTime: startTime ? new Date(startTime).getTime() : (Date.now() - 1000),
      };
      
      // Update with abort data
      const execution: ToolExecution = {
        ...prevExecution,
        status: 'aborted', // Explicitly mark as aborted
        result: { aborted: true, abortTimestamp },
        endTime: new Date(timestamp).getTime(),
        executionTime: startTime ? 
          new Date(timestamp).getTime() - new Date(startTime).getTime() : 0,
      };
      
      // Add to history - without limiting size
      const toolHistory = [...prev.toolHistory, execution];
      
      // Update tool executions map
      const updatedToolExecutions = {
        ...prev.toolExecutions,
        [matchingExecutionId]: execution,
      };
      
      // Count active tools after abort
      const activeTools = Object.values(updatedToolExecutions).filter(
        t => t.status === 'running' || t.status === 'awaiting-permission'
      );
      
      return {
        ...prev,
        toolExecutions: updatedToolExecutions,
        activeTools: {
          ...prev.activeTools,
          [matchingExecutionId]: false,
        },
        activeToolCount: activeTools.length,
        toolHistory,
        latestExecution: execution,
      };
    });
  }, []);
  
  // Handler for tool execution error
  const handleToolExecutionError = useCallback((data: EventData<WebSocketEvent.TOOL_EXECUTION_ERROR>) => {
    const { tool, error, paramSummary, timestamp, startTime, preview } = data;
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
        toolName: typeof tool.name === "string" ? tool.name : toolId,
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
        // Include preview data for errors
        preview,
      };
      
      // Add to history - without limiting size
      const toolHistory = [...prev.toolHistory, execution];
      
      // Update our map of tool executions
      const updatedToolExecutions = {
        ...prev.toolExecutions,
        [matchingExecutionId]: execution,
      };
      
      // Count active tools (running or awaiting permission) after error
      const activeTools = Object.values(updatedToolExecutions).filter(
        t => t.status === 'running' || t.status === 'awaiting-permission'
      );
      
      return {
        ...prev,
        toolExecutions: updatedToolExecutions,
        activeTools: {
          ...prev.activeTools,
          [matchingExecutionId]: false,
        },
        activeToolCount: activeTools.length,
        toolHistory,
        latestExecution: execution,
      };
    });
  }, []);
  
  // Handle permission request events
  const handlePermissionRequested = useCallback((data: Record<string, unknown>) => {
    const permission = data.permission as Record<string, unknown>;
    const toolId = permission.toolId as string;
    const permissionId = permission.id as string;
    const executionId = permission.executionId as string;
    const args = permission.args as Record<string, unknown>;
    const timestamp = permission.timestamp as string;
    
    console.log('Permission requested:', { 
      permissionId, 
      toolId, 
      executionId,
      hasMapping: executionId ? 'yes' : 'no'
    });
    
    // Find the related tool execution
    setState(prev => {
      // Strategy 1: Try to find by executionId if available (direct match)
      if (executionId && executionId in prev.toolExecutions) {
        console.log('Found exact execution ID match:', executionId);
        
        const matchingExecution = prev.toolExecutions[executionId];
        
        // Update the tool execution with permission information
        const updatedExecution: ToolExecution = {
          ...matchingExecution,
          requiresPermission: true,
          permissionId: permissionId,
          status: 'awaiting-permission' as const,
          preview: permission.preview as ToolPreviewData // Include the preview
        };
        
        // Set up mappings to link permission to execution
        const mappings = { ...(prev.toolIdMappings || {}) };
        mappings[`permission:${permissionId}`] = executionId;
        
        // Return updated state with the direct match
        const updatedToolExecutions = {
          ...prev.toolExecutions,
          [executionId]: updatedExecution,
        };
        
        // Count tools that are running or awaiting permission
        const activeTools = Object.values(updatedToolExecutions).filter(
          t => t.status === 'running' || t.status === 'awaiting-permission'
        );
        
        return {
          ...prev,
          toolExecutions: updatedToolExecutions,
          activeToolCount: activeTools.length,
          toolIdMappings: mappings
        };
      }
      
      // Strategy 2: Try finding by executionId in mappings
      if (executionId && prev.toolIdMappings) {
        const mappedId = prev.toolIdMappings[`executionId:${executionId}`];
        if (mappedId && mappedId in prev.toolExecutions) {
          console.log('Found execution ID through mapping:', mappedId);
          
          const matchingExecution = prev.toolExecutions[mappedId];
          
          // Update the tool execution with permission information
          const updatedExecution: ToolExecution = {
            ...matchingExecution,
            requiresPermission: true,
            permissionId: permissionId,
            status: 'awaiting-permission' as const,
            preview: permission.preview as ToolPreviewData
          };
          
          // Update mappings to link permission with execution
          const mappings = { ...prev.toolIdMappings };
          mappings[`permission:${permissionId}`] = mappedId;
          
          const updatedToolExecutions = {
            ...prev.toolExecutions,
            [mappedId]: updatedExecution,
          };
          
          // Count active tools
          const activeTools = Object.values(updatedToolExecutions).filter(
            t => t.status === 'running' || t.status === 'awaiting-permission'
          );
          
          return {
            ...prev,
            toolExecutions: updatedToolExecutions,
            activeToolCount: activeTools.length,
            toolIdMappings: mappings
          };
        }
      }
    
      // Strategy 3: Find matching running tool by toolId (most recent)
      const runningTools = Object.entries(prev.toolExecutions)
        .filter(([, execution]) => {
          // Match exact toolId or tool name
          const exactMatch = execution.tool === toolId || execution.toolName === toolId;
          
          // Match by lowercase (bash / Bash)
          const lowercaseMatch = 
            execution.tool.toLowerCase() === toolId.toLowerCase() || 
            (execution.toolName && execution.toolName.toLowerCase() === toolId.toLowerCase());
          
          // Match by substring for partial matches
          const substringMatch = 
            execution.tool.toLowerCase().includes(toolId.toLowerCase()) || 
            (execution.toolName && execution.toolName.toLowerCase().includes(toolId.toLowerCase()));
          
          // Check status - only running tools can await permission
          const statusOk = execution.status === 'running';
          
          return (exactMatch || lowercaseMatch || substringMatch) && statusOk;
        })
        .sort(([, a], [, b]) => b.startTime - a.startTime);
      
      console.log('Found running tools:', runningTools.length);
      
      if (runningTools.length > 0) {
        const [matchingExecutionId, matchingExecution] = runningTools[0];
        console.log('Found most recent running tool:', matchingExecutionId);
        
        // Update the tool execution with permission information and preview
        const updatedExecution: ToolExecution = {
          ...matchingExecution,
          requiresPermission: true,
          permissionId: permissionId,
          status: 'awaiting-permission' as const,
          preview: permission.preview as ToolPreviewData // Include the preview data
        };
        
        // Set up mappings to link permission to execution
        const mappings = { ...(prev.toolIdMappings || {}) };
        mappings[`permission:${permissionId}`] = matchingExecutionId;
        if (executionId) {
          mappings[`executionId:${executionId}`] = matchingExecutionId;
        }
        
        // Update tool executions map
        const updatedToolExecutions = {
          ...prev.toolExecutions,
          [matchingExecutionId]: updatedExecution,
        };
        
        // Count tools that are running or awaiting permission
        const activeTools = Object.values(updatedToolExecutions).filter(
          t => t.status === 'running' || t.status === 'awaiting-permission'
        );
        
        return {
          ...prev,
          toolExecutions: updatedToolExecutions,
          activeToolCount: activeTools.length,
          toolIdMappings: mappings
        };
      }
      
      // Strategy 4: If no matching tool found, create a new one
      // This is a fallback for permission requests without previous tool_execution_started event
      console.log('No matching running tool found, creating new execution object');
      
      // Generate a stable ID for this permission request
      const newExecutionId = executionId || `${toolId}-permission-${Date.now()}`;
      
      // Create a new tool execution for this permission
      const newExecution: ToolExecution = {
        id: newExecutionId,
        tool: toolId,
        toolName: toolId, // Use toolId as name if no better info
        status: 'awaiting-permission',
        requiresPermission: true,
        permissionId: permissionId,
        args: args || {},
        startTime: timestamp ? new Date(timestamp).getTime() : Date.now(),
        preview: permission.preview as ToolPreviewData // Include preview data
      };
      
      // Set up mappings
      const mappings = { ...(prev.toolIdMappings || {}) };
      mappings[`permission:${permissionId}`] = newExecutionId;
      if (executionId) {
        mappings[`executionId:${executionId}`] = newExecutionId;
      }
      
      // Add to tool executions map
      const updatedToolExecutions = {
        ...prev.toolExecutions,
        [newExecutionId]: newExecution,
      };
      
      // Count active tools
      const activeTools = Object.values(updatedToolExecutions).filter(
        t => t.status === 'running' || t.status === 'awaiting-permission'
      );
      
      return {
        ...prev,
        toolExecutions: updatedToolExecutions,
        activeToolCount: activeTools.length,
        toolIdMappings: mappings
      };
    });
  }, []);
  
  // Handle permission resolution events
  const handlePermissionResolved = useCallback((data: Record<string, unknown>) => {
    const permissionId = data.permissionId as string;
    const toolId = data.toolId as string;
    const executionId = data.executionId as string;
    const granted = data.resolution as boolean;
    
    console.log('Permission resolved:', { permissionId, toolId, executionId, granted, data });
    
    // Update any tool execution waiting for this permission
    setState(prev => {
      const updatedToolExecutions = { ...prev.toolExecutions };
      let updated = false;
      let toolToUpdate = null;
      let toolIdToUpdate = null;
      
      // First try to find the tool by executionId if available
      if (executionId && executionId in updatedToolExecutions) {
        toolToUpdate = updatedToolExecutions[executionId];
        toolIdToUpdate = executionId;
        updated = true;
        console.log('Found tool by executionId:', executionId);
      }
      
      // If no match by executionId, try by permissionId
      if (!updated) {
        for (const id in updatedToolExecutions) {
          const tool = updatedToolExecutions[id];
          if (tool.permissionId === permissionId) {
            toolToUpdate = tool;
            toolIdToUpdate = id;
            updated = true;
            console.log('Found tool waiting for permission by permissionId:', id);
            break;
          }
        }
      }
      
      // If still no match, try by toolId for the most recent awaiting-permission tool
      if (!updated) {
        const matchingTools = Object.entries(updatedToolExecutions)
          .filter(([, tool]) => tool.tool === toolId && tool.status === 'awaiting-permission')
          .sort(([, a], [, b]) => b.startTime - a.startTime);
        
        if (matchingTools.length > 0) {
          const [id, tool] = matchingTools[0];
          toolToUpdate = tool;
          toolIdToUpdate = id;
          updated = true;
          console.log('Found tool by toolId (most recent):', id);
        }
      }
      
      // Update the tool if found
      if (updated && toolToUpdate && toolIdToUpdate) {
        // If denied, mark as error
        if (!granted) {
          updatedToolExecutions[toolIdToUpdate] = {
            ...toolToUpdate,
            status: 'error',
            error: { message: 'Permission denied' },
            requiresPermission: false,
            permissionId: undefined,
          };
          console.log('Permission denied, updated tool status to error');
          // Note: We're only updating the visualization here.
          // The error message to the user is not shown because we've suppressed
          // permission errors in TerminalContext.handleProcessingError
        } else {
          // If granted, return to running state but preserve the preview
          // IMPORTANT: keep the same object key to prevent component unmounting
          updatedToolExecutions[toolIdToUpdate] = {
            ...toolToUpdate,
            status: 'running',
            requiresPermission: false,
            permissionId: undefined,
            // Preview is preserved through ...toolToUpdate
          };
          
          // Store mappings to help match the tool when completion events arrive
          const mappings = { ...(prev.toolIdMappings || {}) };
          
          // Map executionId -> toolId
          if (executionId) {
            mappings[`executionId:${executionId}`] = toolIdToUpdate;
          }
          
          // Map permissionId -> toolId
          if (permissionId) {
            mappings[`permission:${permissionId}`] = toolIdToUpdate;
          }
          
          // Map toolId+timestamp -> toolId (for completion events)
          const timestamp = toolToUpdate.startTime;
          if (toolId && timestamp) {
            mappings[`${toolId}-${timestamp}`] = toolIdToUpdate;
          }
          
          console.log('Permission granted, updated tool status to running', {
            toolId: toolIdToUpdate,
            executionId,
            hasPreview: !!toolToUpdate.preview,
            previewType: toolToUpdate.preview?.contentType,
            preservedPreview: !!updatedToolExecutions[toolIdToUpdate].preview,
            mappingsCreated: Object.keys(mappings).filter(k => !prev.toolIdMappings?.[k])
          });
          
          return {
            ...prev,
            toolExecutions: updatedToolExecutions,
            // Count active tools (running or awaiting permission)
            activeToolCount: Object.values(updatedToolExecutions).filter(
              t => t.status === 'running' || t.status === 'awaiting-permission'
            ).length,
            // Update mappings
            toolIdMappings: mappings
          };
        }
      } else {
        console.warn(`No tools found with matching criteria:`, {
          permissionId,
          toolId,
          executionId
        });
      }
      
      // Recalculate active tool count
      const activeTools = Object.values(updatedToolExecutions).filter(
        t => t.status === 'running' || t.status === 'awaiting-permission'
      );
      
      return {
        ...prev,
        toolExecutions: updatedToolExecutions,
        activeToolCount: activeTools.length,
      };
    });
  }, []);

  // Set up event handlers
  useEffect(() => {
    // Create an array to track all unsubscribe functions
    const unsubscribers: Array<() => void> = [];
    
    // Helper function to safely subscribe and track unsubscribe function with proper typing
    function safeSubscribe<E extends WebSocketEvent>(
      event: E, 
      handler: (data: EventData<E>) => void
    ) {
      try {
        // The cast is necessary because WebSocket subscriber doesn't have proper type parameters
        const unsubscribe = subscribe(event, handler as (data: unknown) => void);
        unsubscribers.push(unsubscribe);
        return unsubscribe;
      } catch (error) {
        console.warn(`Failed to subscribe to ${event}:`, error);
        // Return a no-op function
        return () => {};
      }
    }
    
    // For non-typed events, use the original pattern
    subscribe(WebSocketEvent.TOOL_EXECUTION_BATCH, (data) => handleToolExecutionBatch(data as ToolExecutionBatch));
    subscribe(WebSocketEvent.PROCESSING_COMPLETED, handleProcessingCompleted);
    subscribe(WebSocketEvent.PROCESSING_ABORTED, handleProcessingAborted);
    subscribe(WebSocketEvent.PROCESSING_ERROR, handleProcessingError);
    
    // Use properly typed subscription for tool events
    safeSubscribe(WebSocketEvent.TOOL_EXECUTION_STARTED, handleToolExecutionStarted);
    safeSubscribe(WebSocketEvent.TOOL_EXECUTION_COMPLETED, handleToolExecutionCompleted);
    safeSubscribe(WebSocketEvent.TOOL_EXECUTION_ERROR, handleToolExecutionError);
    safeSubscribe(WebSocketEvent.TOOL_EXECUTION_ABORTED, handleToolExecutionAborted);
    
    // For non-typed events, use the original pattern
    subscribe(WebSocketEvent.PERMISSION_REQUESTED, (data) => handlePermissionRequested(data as Record<string, unknown>));
    subscribe(WebSocketEvent.PERMISSION_RESOLVED, (data) => handlePermissionResolved(data as Record<string, unknown>));
    
    // Clean up subscriptions
    return () => {
      unsubscribers.forEach(unsubscribe => {
        try {
          unsubscribe();
        } catch (error) {
          console.warn('Error during unsubscribe:', error);
        }
      });
    };
  }, [
    subscribe, 
    handleToolExecutionBatch,
    handleProcessingCompleted,
    handleProcessingAborted,
    handleProcessingError,
    handleToolExecutionStarted,
    handleToolExecutionCompleted,
    handleToolExecutionError,
    handleToolExecutionAborted,
    handlePermissionRequested,
    handlePermissionResolved
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
      viewModes: {},
      defaultViewMode: PreviewMode.BRIEF,
      toolIdMappings: {},
    });
    setToolBuffers({});
  }, []);
  
  // Function to access the full history of a specific tool
  const getToolHistory = useCallback((toolId: string): Array<unknown> => {
    return toolBuffers[toolId] || [];
  }, [toolBuffers]);
  
  // Utility method to get active tools
  const getActiveTools = useCallback(() => {
    const tools = Object.entries(state.toolExecutions)
      .filter(([, tool]) => 
        // Include both running tools and tools awaiting permission
        tool.status === 'running' || tool.status === 'awaiting-permission'
      )
      .map(([id, tool]) => ({
        ...tool,
        viewMode: state.viewModes[id] || state.defaultViewMode
      }));
    return tools;
  }, [state.toolExecutions, state.viewModes, state.defaultViewMode]);

  // Utility method to get all completed tools from the history
  const getRecentTools = useCallback((count = 1000) => {
    const tools = state.toolHistory
      .filter(tool => 
        // Exclude running and awaiting-permission tools which are already in active
        tool.status !== 'running' && tool.status !== 'awaiting-permission'
      )
      .map(tool => ({
        ...tool,
        viewMode: state.viewModes[tool.id] || state.defaultViewMode
      }))
      .reverse();
    // If a count limit is provided, respect it
    return count && count < tools.length ? tools.slice(0, count) : tools;
  }, [state.toolHistory, state.viewModes, state.defaultViewMode]);

  // Utility method to get a specific tool execution by ID
  const getToolExecutionById = useCallback((toolId: string) => {
    const tool = state.toolExecutions[toolId];
    
    if (!tool) return undefined;
    
    // Attach view mode to the tool
    return {
      ...tool,
      viewMode: state.viewModes[toolId] || state.defaultViewMode
    };
  }, [state.toolExecutions, state.viewModes, state.defaultViewMode]);

  // Add method to update view mode
  const setToolViewMode = useCallback((toolId: string, mode: PreviewMode) => {
    setState(prev => ({
      ...prev,
      viewModes: {
        ...prev.viewModes,
        [toolId]: mode
      }
    }));
  }, []);
  
  // Add method to set default view mode for all tools
  const setDefaultViewMode = useCallback((mode: PreviewMode) => {
    setState(prev => ({
      ...prev,
      defaultViewMode: mode
    }));
  }, []);

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
    // Add view mode controls
    setToolViewMode,
    setDefaultViewMode,
    defaultViewMode: state.defaultViewMode,
  };
}

export default useToolStream;