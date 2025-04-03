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
  
  // We no longer need a separate handleToolHistory function as we receive individual TOOL_EXECUTION_RECEIVED events
  // This comment is kept to document the change
  
  // Set up event handlers
  useEffect(() => {
    // Create an array to track all unsubscribe functions
    const unsubscribers: Array<() => void> = [];
    
    // Debug socket connection status
    if (socket) {
      console.log('🔌 useToolStream has socket connection:', { 
        socketId: socket.id,
        connected: socket.connected,
        disconnected: socket.disconnected
      });
      
      // Listen for underlying socket events for more debugging
      const handleSocketConnect = () => {
        console.log('🔌 Socket connected event fired in useToolStream');
      };
      
      const handleSocketDisconnect = (reason: string) => {
        console.log('🔌 Socket disconnected in useToolStream:', reason);
      };
      
      const handleSocketError = (error: Error) => {
        console.error('🔌 Socket error in useToolStream:', error);
      };
      
      socket.on('connect', handleSocketConnect);
      socket.on('disconnect', handleSocketDisconnect);
      socket.on('error', handleSocketError);
      
      // Clean up socket event listeners
      unsubscribers.push(() => {
        socket.off('connect', handleSocketConnect);
        socket.off('disconnect', handleSocketDisconnect);
        socket.off('error', handleSocketError);
      });
    } else {
      console.warn('⚠️ useToolStream has no socket connection!');
    }
    
    // Subscribe to tool execution events
    const toolExecutionReceivedUnsubscribe = subscribe(WebSocketEvent.TOOL_EXECUTION_RECEIVED, (data) => {
      console.log('🔄 TOOL_EXECUTION_RECEIVED event:', {
        executionId: data.toolExecution.id,
        toolName: data.toolExecution.toolName,
        status: data.toolExecution.status,
        timestamp: new Date().toISOString()
      });
      
      // Convert timeline format to tool state format
      console.log('🔄 Processing TOOL_EXECUTION_RECEIVED with preview:', {
        executionId: data.toolExecution.id,
        hasPreview: !!data.toolExecution.preview,
        previewContentType: data.toolExecution.preview?.contentType
      });
      
      const tool: ToolExecution = {
        id: data.toolExecution.id,
        tool: data.toolExecution.toolId,
        toolName: data.toolExecution.toolName,
        status: data.toolExecution.status as any,
        args: data.toolExecution.args,
        startTime: new Date(data.toolExecution.startTime).getTime(),
        result: data.toolExecution.result,
        error: data.toolExecution.error,
        preview: data.toolExecution.preview,
        endTime: data.toolExecution.endTime ? new Date(data.toolExecution.endTime).getTime() : undefined,
        executionTime: data.toolExecution.executionTime
      };
      
      handleToolStateUpdate({ sessionId: data.sessionId, tool });
    });
    unsubscribers.push(toolExecutionReceivedUnsubscribe);
    
    // Subscribe to tool execution updates
    const toolExecutionUpdatedUnsubscribe = subscribe(WebSocketEvent.TOOL_EXECUTION_UPDATED, (data) => {
      console.log('🔄 TOOL_EXECUTION_UPDATED event received:', {
        executionId: data.toolExecution?.id,
        status: data.toolExecution?.status,
        hasPreview: !!data.toolExecution?.preview,
        previewType: data.toolExecution?.preview?.contentType,
        resultAvailable: !!data.toolExecution?.result,
        timestamp: new Date().toISOString()
      });
      
      // Find the existing tool in our state
      setState(prev => {
        const toolId = data.toolExecution?.id;
        if (!toolId) {
          console.warn('⚠️ Tool execution update received without valid tool ID');
          return prev;
        }
        
        const existingTool = prev.toolExecutions[toolId];
        if (!existingTool) {
          console.warn(`⚠️ Tool execution update received for unknown tool: ${toolId}`);
          // Log the current state so we can see what tools exist
          console.log('Current tools in state:', Object.keys(prev.toolExecutions));
          
          // Create a new tool since we don't have it yet
          // This helps with reconnection scenarios where we might have missed TOOL_EXECUTION_RECEIVED
          console.log('⚠️ Creating new tool execution from update event');
          const newTool: ToolExecution = {
            id: toolId,
            tool: data.toolExecution.toolId || 'unknown',
            toolName: data.toolExecution.toolName || 'Unknown Tool',
            status: data.toolExecution.status as any,
            startTime: data.toolExecution.startTime ? new Date(data.toolExecution.startTime).getTime() : Date.now(),
            result: data.toolExecution.result,
            error: data.toolExecution.error,
            endTime: data.toolExecution.endTime ? new Date(data.toolExecution.endTime).getTime() : undefined,
            executionTime: data.toolExecution.executionTime,
            // Create proper preview object if it exists
            preview: data.toolExecution.preview ? {
              contentType: data.toolExecution.preview.contentType,
              briefContent: data.toolExecution.preview.briefContent || '',
              fullContent: data.toolExecution.preview.fullContent,
              metadata: data.toolExecution.preview.metadata || {}
            } : undefined
          };
          
          // Create new tool executions map with the new tool
          const toolExecutions = {
            ...prev.toolExecutions,
            [toolId]: newTool
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
        }
        
        // Log details about incoming update
        console.log('🔄 Processing update for tool execution:', {
          toolId,
          currentStatus: existingTool.status,
          newStatus: data.toolExecution.status,
          hasExistingPreview: !!existingTool.preview,
          hasNewPreview: !!data.toolExecution.preview,
          previewContentType: data.toolExecution.preview?.contentType
        });

        // Update the tool with new data
        const updatedTool: ToolExecution = {
          ...existingTool,
          status: data.toolExecution.status as any,
          tool: data.toolExecution.toolId || existingTool.tool,
          toolName: data.toolExecution.toolName || existingTool.toolName,
          result: data.toolExecution.result || existingTool.result,
          error: data.toolExecution.error || existingTool.error,
          args: data.toolExecution.args || existingTool.args,
          endTime: data.toolExecution.endTime ? 
                  new Date(data.toolExecution.endTime).getTime() : 
                  existingTool.endTime,
          executionTime: data.toolExecution.executionTime || existingTool.executionTime,
          // Important: Handle preview data
          preview: data.toolExecution.preview ? {
            // If we don't have an existing preview, use the new one directly
            ...(existingTool.preview || {}), // Keep existing preview properties if they exist
            // Apply new preview properties, giving them priority - checking for property existence rather than truthiness
            contentType: 'contentType' in data.toolExecution.preview ? data.toolExecution.preview.contentType : existingTool.preview?.contentType,
            briefContent: 'briefContent' in data.toolExecution.preview ? data.toolExecution.preview.briefContent : existingTool.preview?.briefContent,
            fullContent: 'fullContent' in data.toolExecution.preview ? data.toolExecution.preview.fullContent : existingTool.preview?.fullContent,
            metadata: {
              ...(existingTool.preview?.metadata || {}),
              ...(data.toolExecution.preview.metadata || {})
            }
          } : existingTool.preview // Keep existing preview if new is undefined
        };
        
        console.log('Updated tool preview:', {
          toolId: toolId,
          hasPreview: !!updatedTool.preview,
          previewType: updatedTool.preview?.contentType,
          briefContentLength: updatedTool.preview?.briefContent?.length,
          fullContentLength: updatedTool.preview?.fullContent?.length,
          metadataKeys: updatedTool.preview?.metadata ? Object.keys(updatedTool.preview.metadata) : []
        });
        
        // Create new tool executions map with the updated tool
        const toolExecutions = {
          ...prev.toolExecutions,
          [toolId]: updatedTool
        };
        
        // Count active tools (running or awaiting permission)
        const activeToolCount = Object.values(toolExecutions).filter(
          t => t.status === 'running' || t.status === 'awaiting-permission'
        ).length;
        
        console.log('Updated tool execution state:', {
          toolId: updatedTool.id,
          status: updatedTool.status,
          activeTools: activeToolCount
        });
        
        return {
          ...prev,
          toolExecutions,
          activeToolCount,
          isInitialized: true
        };
      });
    });
    unsubscribers.push(toolExecutionUpdatedUnsubscribe);
    
    const timelineHistoryUnsubscribe = subscribe(WebSocketEvent.TIMELINE_HISTORY, (data) => {
      console.log('Timeline history received:', {
        sessionId: data.sessionId,
        itemCount: data.items.length
      });
      
      // Process tool execution items
      const toolItems = data.items.filter(item => item.type === 'tool_execution');
      if (toolItems.length > 0) {
        console.log('Tool execution items found in timeline history:', toolItems.length);
        
        // Process the tools in the timeline items
        setState(prev => {
          // Create map of tool executions
          const toolExecutions = { ...prev.toolExecutions };
          
          // Add each tool from timeline history
          toolItems.forEach(item => {
            const tool = item.toolExecution;
            if (tool && tool.id) {
              toolExecutions[tool.id] = {
                id: tool.id,
                tool: tool.toolId,
                toolName: tool.toolName,
                status: tool.status as any,
                args: tool.args,
                startTime: new Date(tool.startTime).getTime(),
                result: tool.result,
                error: tool.error,
                endTime: tool.endTime ? new Date(tool.endTime).getTime() : undefined,
                executionTime: tool.executionTime,
                // Properly handle preview data
                preview: tool.preview ? {
                  contentType: tool.preview.contentType,
                  briefContent: tool.preview.briefContent || '',
                  fullContent: tool.preview.fullContent,
                  metadata: tool.preview.metadata || {}
                } : undefined,
                // Preserve view mode if already set
                viewMode: prev.toolExecutions[tool.id]?.viewMode || prev.defaultViewMode
              };
            }
          });
          
          // Count active tools
          const activeToolCount = Object.values(toolExecutions).filter(
            t => t.status === 'running' || t.status === 'awaiting-permission'
          ).length;
          
          console.log('Timeline history processed:', {
            totalTools: Object.keys(toolExecutions).length,
            activeTools: activeToolCount
          });
          
          return {
            ...prev,
            toolExecutions,
            activeToolCount,
            isInitialized: true
          };
        });
      }
    });
    unsubscribers.push(timelineHistoryUnsubscribe);
    
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
  }, [subscribe, handleToolStateUpdate]);
  
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