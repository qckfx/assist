import { useState, useCallback, useMemo } from 'react';
import { PreviewMode } from '../../types/preview';
import { useTimelineContext } from '../context/TimelineContext';
import { TimelineItemType } from '../../types/timeline';

/**
 * Tool execution with UI-specific visualization state
 */
export interface ToolVisualizationItem {
  /** Unique tool execution ID */
  id: string;
  /** Tool identifier */
  tool: string;
  /** User-friendly tool name */
  toolName: string;
  /** Tool execution status */
  status: 'pending' | 'running' | 'completed' | 'error' | 'awaiting-permission' | 'aborted';
  /** Tool arguments */
  args?: Record<string, unknown>;
  /** Parameter summary (user-friendly description) */
  paramSummary?: string;
  /** Tool execution result data */
  result?: unknown;
  /** Error information if tool failed */
  error?: {
    message: string;
    stack?: string;
  };
  /** Timestamp when tool execution started */
  startTime: number;
  /** Timestamp when tool execution completed */
  endTime?: number;
  /** Duration of tool execution in milliseconds */
  executionTime?: number;
  /** Preview data for visualization */
  preview?: {
    contentType: string;
    briefContent: string;
    fullContent?: string;
    metadata?: Record<string, unknown>;
  };
  /** Current view mode for this tool's preview */
  viewMode: PreviewMode;
}

/**
 * Interface for the useToolVisualization hook return value
 */
interface UseToolVisualizationResult {
  /** All tool visualizations */
  tools: ToolVisualizationItem[];
  /** Currently active tools */
  activeTools: ToolVisualizationItem[];
  /** Recently completed tools */
  recentTools: ToolVisualizationItem[];
  /** Get a specific tool by ID */
  getToolById: (id: string) => ToolVisualizationItem | undefined;
  /** Set view mode for a specific tool */
  setToolViewMode: (toolId: string, mode: PreviewMode) => void;
  /** Set default view mode for all tools */
  setDefaultViewMode: (mode: PreviewMode) => void;
  /** Current default view mode */
  defaultViewMode: PreviewMode;
  /** Whether there are any active tools */
  hasActiveTools: boolean;
  /** Count of active tools */
  activeToolCount: number;
}

/**
 * Hook for managing tool visualization state
 * @returns Tool visualization state and methods
 */
export function useToolVisualization(): UseToolVisualizationResult {
  // Get timeline data from context
  const { getToolExecutionItems } = useTimelineContext();
  
  // Visualization state
  const [viewModes, setViewModes] = useState<Record<string, PreviewMode>>({});
  const [defaultViewMode, setDefaultViewMode] = useState<PreviewMode>(PreviewMode.BRIEF);
  
  // Convert timeline tool items to visualization items with view modes
  const toolExecutions = useMemo((): ToolVisualizationItem[] => {
    return getToolExecutionItems().map(item => {
      // Safety check before accessing properties
      if (item.type !== TimelineItemType.TOOL_EXECUTION) {
        throw new Error(`Expected TOOL_EXECUTION type but got ${item.type}`);
      }
      
      // Log the timeline item received from TimelineContext
      console.log(`Timeline item received in useToolVisualization for ${item.id}:`, {
        hasTopLevelPreview: !!item.preview,
        hasToolExecutionPreview: !!item.toolExecution.preview,
        hasPreviewFlag: item.toolExecution.hasPreview === true,
        previewInToolExecution: item.toolExecution.preview ? {
          contentType: item.toolExecution.preview.contentType,
          hasBriefContent: !!item.toolExecution.preview.briefContent,
          briefContentLength: item.toolExecution.preview.briefContent?.length || 0,
          hasActualContent: item.toolExecution.preview.hasActualContent === true
        } : null,
        previewTopLevel: item.preview ? {
          contentType: item.preview.contentType,
          hasBriefContent: !!item.preview.briefContent,
          briefContentLength: item.preview.briefContent?.length || 0
        } : null,
        toolExecutionProps: Object.keys(item.toolExecution)
      });
      
      // The mapping from timeline item to tool visualization item
      return {
        id: item.id,
        tool: item.toolExecution.toolId,
        toolName: item.toolExecution.toolName,
        status: item.toolExecution.status as any, // Type is verified in the timeline
        args: item.toolExecution.args,
        paramSummary: item.toolExecution.summary,
        startTime: new Date(item.toolExecution.startTime).getTime(),
        endTime: item.toolExecution.endTime 
          ? new Date(item.toolExecution.endTime).getTime() 
          : undefined,
        executionTime: item.toolExecution.executionTime,
        result: item.toolExecution.result,
        error: item.toolExecution.error,
        // Use preview directly from toolExecution
        preview: item.toolExecution.preview,
        // Apply view mode: from specific setting, or default
        viewMode: viewModes[item.id] || defaultViewMode
      };
    });
  }, [getToolExecutionItems, viewModes, defaultViewMode]);
  
  // Handler for changing a tool's view mode
  const setToolViewMode = useCallback((toolId: string, mode: PreviewMode): void => {
    setViewModes(prev => ({
      ...prev,
      [toolId]: mode
    }));
  }, []);
  
  // Active tools are those that are running or awaiting permission
  const activeTools = useMemo((): ToolVisualizationItem[] => {
    // Add detailed debug logging to understand tool status
    console.log('Tool execution statuses:', toolExecutions.map(t => ({
      id: t.id,
      toolName: t.toolName,
      status: t.status,
      startTime: t.startTime,
      endTime: t.endTime
    })));
    
    const filteredTools = toolExecutions.filter(t => 
      t.status === 'running' || t.status === 'awaiting-permission'
    );
    
    console.log('Active tools after filtering:', filteredTools.map(t => ({
      id: t.id,
      toolName: t.toolName,
      status: t.status
    })));
    
    return filteredTools;
  }, [toolExecutions]);
  
  // Recent tools are completed, error, or aborted, sorted by end time
  const recentTools = useMemo((): ToolVisualizationItem[] => {
    return toolExecutions
      .filter(t => 
        t.status === 'completed' || t.status === 'error' || t.status === 'aborted'
      )
      .sort((a, b) => (b.endTime || 0) - (a.endTime || 0)); // Sort by end time (most recent first)
  }, [toolExecutions]);
  
  // Utility to get a specific tool by ID
  const getToolById = useCallback((id: string): ToolVisualizationItem | undefined => {
    return toolExecutions.find(t => t.id === id);
  }, [toolExecutions]);
  
  return {
    tools: toolExecutions,
    activeTools,
    recentTools,
    getToolById,
    setToolViewMode,
    setDefaultViewMode,
    defaultViewMode,
    hasActiveTools: activeTools.length > 0,
    activeToolCount: activeTools.length
  };
}