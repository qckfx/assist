/**
 * React hook for tool execution events
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import { WebSocketEvent, WebSocketEventMap } from '../types/api';
import { PreviewMode } from '../../types/preview';

// Type helper for event handlers to properly map WebSocketEvent enum to WebSocketEventMap
// Unused for now but keeping for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type EventData<E extends WebSocketEvent> = WebSocketEventMap[E];

/**
 * Interface for tool execution event data
 */
export interface ToolExecution {
  id: string;
  tool: string;
  toolName: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'awaiting-permission' | 'aborted';
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
  permissionId?: string;
  
  // Preview data
  preview?: {
    contentType: string;
    briefContent: string;
    fullContent?: string;
    metadata?: Record<string, unknown>;
  };
  
  // View mode (client-side only)
  viewMode?: PreviewMode;
}

/**
 * Hook for subscribing to tool execution events
 */
export function useToolStream() {
  const { subscribe, socket, getSessionId } = useWebSocket();
  
  // State for tool executions
  const [state, setState] = useState<{
    toolExecutions: Record<string, ToolExecution>;
    activeToolCount: number;
    viewModes: Record<string, PreviewMode>;
    defaultViewMode: PreviewMode;
    isInitialized: boolean;
  }>({
    toolExecutions: {},
    activeToolCount: 0,
    viewModes: {},
    defaultViewMode: PreviewMode.BRIEF,
    isInitialized: false
  });
  
  // Keep track of whether we've loaded history
  const historyLoadedRef = useRef(false);
  
  // Load initial tool history
  useEffect(() => {
    if (!socket) {
      return;
    }
    
    const sessionId = getSessionId();
    if (!sessionId) {
      return;
    }
    
    // Function to request history
    const requestHistory = () => {
      console.log('Requesting tool history for session:', sessionId);
      socket.emit(WebSocketEvent.TOOL_HISTORY, {
        sessionId,
        includeCompleted: true
      });
      historyLoadedRef.current = true;
    };
    
    // If socket is connected and we haven't loaded history yet, request it
    if (socket.connected && !historyLoadedRef.current) {
      requestHistory();
    }
    
    // Also listen for connect events to request history when socket reconnects
    const handleConnect = () => {
      console.log('Socket connected, requesting tool history');
      // Reset history loaded flag to ensure we request it on reconnection
      historyLoadedRef.current = false;
      requestHistory();
    };
    
    socket.on('connect', handleConnect);
    
    // Clean up listener
    return () => {
      socket.off('connect', handleConnect);
    };
  }, [socket, getSessionId]);
  
  // Handle tool state updates from the server
  const handleToolStateUpdate = useCallback((data: { sessionId: string; tool: ToolExecution }) => {
    const { tool } = data;
    
    // Add logging to see what's coming from the server
    console.log('Tool state update received:', {
      toolId: tool.id,
      toolName: tool.toolName,
      status: tool.status,
      hasPreview: !!tool.preview,
      previewType: tool.preview?.contentType
    });

    if (tool.preview) {
      console.log('Preview data for tool:', {
        toolId: tool.id,
        contentType: tool.preview.contentType,
        briefContentLength: tool.preview.briefContent?.length,
        fullContentLength: tool.preview.fullContent?.length
      });
    }
    
    setState(prev => {
      // Create new tool executions map with the updated tool
      const toolExecutions = {
        ...prev.toolExecutions,
        [tool.id]: {
          ...tool,
          // Preserve the view mode if already set
          viewMode: prev.toolExecutions[tool.id]?.viewMode || prev.defaultViewMode
        }
      };
      
      // Count active tools (running or awaiting permission)
      const activeToolCount = Object.values(toolExecutions).filter(
        t => t.status === 'running' || t.status === 'awaiting-permission'
      ).length;
      
      return {
        ...prev,
        toolExecutions,
        activeToolCount,
        isInitialized: true
      };
    });
  }, []);
  
  // Handle tool history response
  const handleToolHistory = useCallback((data: { sessionId: string; tools: ToolExecution[] }) => {
    const { tools } = data;
    
    console.log('Received tool history:', {
      sessionId: data.sessionId,
      toolCount: tools.length,
      toolIds: tools.map(t => t.id),
      // Log the first few tools to see their properties
      sampleTools: tools.slice(0, 2)
    });
    
    setState(prev => {
      // Create map of tool executions
      const toolExecutions = { ...prev.toolExecutions };
      
      // Add each tool from history, preserving existing ones
      tools.forEach(tool => {
        toolExecutions[tool.id] = {
          ...tool,
          // Preserve the view mode if already set
          viewMode: prev.toolExecutions[tool.id]?.viewMode || prev.defaultViewMode
        };
      });
      
      // Count active tools
      const activeToolCount = Object.values(toolExecutions).filter(
        t => t.status === 'running' || t.status === 'awaiting-permission'
      ).length;
      
      const completedCount = Object.values(toolExecutions).filter(
        t => t.status === 'completed'
      ).length;
      
      console.log('Tool history processed:', {
        totalTools: Object.keys(toolExecutions).length,
        activeTools: activeToolCount,
        completedTools: completedCount
      });
      
      return {
        ...prev,
        toolExecutions,
        activeToolCount,
        isInitialized: true
      };
    });
  }, []);
  
  // Set up event handlers
  useEffect(() => {
    // Create an array to track all unsubscribe functions
    const unsubscribers: Array<() => void> = [];
    
    // Subscribe to the new enhanced events
    const toolStateUnsubscribe = subscribe(WebSocketEvent.TOOL_STATE_UPDATE, handleToolStateUpdate);
    unsubscribers.push(toolStateUnsubscribe);
    
    const toolHistoryUnsubscribe = subscribe(WebSocketEvent.TOOL_HISTORY, handleToolHistory);
    unsubscribers.push(toolHistoryUnsubscribe);
    
    // Subscribe to session_updated to request tool history
    const sessionUpdatedUnsubscribe = subscribe('session_updated', (data) => {
      console.log('Session updated, requesting tool history');
      // Reset history loaded flag to trigger a fresh load
      historyLoadedRef.current = false;
      
      // Request tool history when session is updated
      if (socket && socket.connected) {
        const sessionId = getSessionId();
        if (sessionId) {
          socket.emit(WebSocketEvent.TOOL_HISTORY, {
            sessionId,
            includeCompleted: true
          });
          historyLoadedRef.current = true;
        }
      }
    });
    unsubscribers.push(sessionUpdatedUnsubscribe);
    
    // Subscribe to processing completed to reset active tool count
    const processingCompletedUnsubscribe = subscribe(WebSocketEvent.PROCESSING_COMPLETED, () => {
      setState(prev => ({
        ...prev,
        activeToolCount: 0
      }));
    });
    unsubscribers.push(processingCompletedUnsubscribe);
    
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
  }, [subscribe, handleToolStateUpdate, handleToolHistory]);
  
  // Clear results
  const clearResults = useCallback(() => {
    setState({
      toolExecutions: {},
      activeToolCount: 0,
      viewModes: {},
      defaultViewMode: PreviewMode.BRIEF,
      isInitialized: false
    });
    
    // Reset history loaded flag
    historyLoadedRef.current = false;
  }, []);
  
  // Add method to update view mode
  const setToolViewMode = useCallback((toolId: string, mode: PreviewMode) => {
    setState(prev => {
      // Update the tool's view mode
      const toolExecutions = { ...prev.toolExecutions };
      if (toolExecutions[toolId]) {
        toolExecutions[toolId] = {
          ...toolExecutions[toolId],
          viewMode: mode
        };
      }
      
      // Also update the view modes map
      const viewModes = {
        ...prev.viewModes,
        [toolId]: mode
      };
      
      return {
        ...prev,
        toolExecutions,
        viewModes
      };
    });
  }, []);
  
  // Add method to set default view mode for all tools
  const setDefaultViewMode = useCallback((mode: PreviewMode) => {
    setState(prev => ({
      ...prev,
      defaultViewMode: mode
    }));
  }, []);
  
  // Utility method to get active tools
  const getActiveTools = useCallback(() => {
    return Object.values(state.toolExecutions)
      .filter(tool => 
        tool.status === 'running' || tool.status === 'awaiting-permission'
      )
      .sort((a, b) => b.startTime - a.startTime);
  }, [state.toolExecutions]);

  // Utility method to get completed tools
  const getRecentTools = useCallback((count = 1000) => {
    return Object.values(state.toolExecutions)
      .filter(tool => 
        tool.status === 'completed' || 
        tool.status === 'error' || 
        tool.status === 'aborted'
      )
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, count);
  }, [state.toolExecutions]);

  // Utility method to get a specific tool by ID
  const getToolExecutionById = useCallback((toolId: string) => {
    return state.toolExecutions[toolId];
  }, [state.toolExecutions]);
  
  // Generate the tool execution history for display
  const toolHistory = useCallback(() => {
    return Object.values(state.toolExecutions)
      .sort((a, b) => b.startTime - a.startTime);
  }, [state.toolExecutions]);

  return {
    state,
    clearResults,
    getActiveTools,
    getRecentTools,
    getToolExecutionById,
    hasActiveTools: state.activeToolCount > 0,
    activeToolCount: state.activeToolCount,
    toolHistory: toolHistory(),
    setToolViewMode,
    setDefaultViewMode,
    defaultViewMode: state.defaultViewMode,
    isInitialized: state.isInitialized
  };
}

export default useToolStream;