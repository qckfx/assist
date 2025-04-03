import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { ToolVisualizationItem } from '../../hooks/useToolVisualization';
import { ToolState } from '../../types/terminal';
import { PreviewMode, PreviewContentType } from '../../../types/preview';
import { ChevronDown, Minimize2 } from 'lucide-react';
import MonacoDiffViewer from '../DiffViewer';

// Helper function to truncate strings
const truncateString = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
};

// Helper function to get a meaningful description of what the tool is doing
const getToolDescription = (tool: ToolVisualizationItem): string => {
  // List of generic descriptions to override
  const genericDescriptions = [
    'Tool execution result', 
    'Tool execution', 
    'Execution result',
    'Result',
    'Complete'
  ];
  
  // If we have a paramSummary that's not generic, use that as the primary source
  if (tool.paramSummary && !genericDescriptions.includes(tool.paramSummary.trim())) {
    return truncateString(tool.paramSummary, 100);
  }
  
  // If we have result object with a pattern field (common in search tools)
  if (tool.result && typeof tool.result === 'object' && 'pattern' in tool.result && typeof tool.result.pattern === 'string') {
    return `Searching for: ${tool.result.pattern}`;
  }
  
  // Check if result contains a displayPath (added by the execution adapters)
  if (tool.result && typeof tool.result === 'object' && 'displayPath' in tool.result && typeof tool.result.displayPath === 'string') {
    if ('success' in tool.result) {
      if (tool.toolName.includes('Read') || tool.toolName.includes('View')) {
        return `Reading file: ${tool.result.displayPath}`;
      } else if (tool.toolName.includes('Edit') || tool.toolName.includes('Write')) {
        return `Editing file: ${tool.result.displayPath}`;
      }
    }
  }
  
  // If we have args, create a meaningful description based on the tool type
  if (tool.args) {
    // For common tools, provide specialized descriptions - check both toolName and tool ID
    const toolInfo = (tool.toolName || '') + '|' + (tool.tool || '');
    
    // Search tools
    if (toolInfo.includes('Glob') || toolInfo.includes('glob')) {
      return `Searching for files: ${tool.args.pattern || 'files'}`;
    }
    if (toolInfo.includes('Grep') || toolInfo.includes('grep')) {
      return `Searching for content: ${tool.args.pattern || 'pattern'}`;
    }
    
    // Command tools
    if (toolInfo.includes('Bash') || toolInfo.includes('bash')) {
      return `Running command: ${truncateString(String(tool.args.command || 'command'), 80)}`;
    }
    
    // File reading tools
    if (toolInfo.includes('View') || toolInfo.includes('Read') || 
        toolInfo.includes('Cat') || toolInfo.includes('file_read')) {
      const path = tool.args.file_path || tool.args.path || tool.args.filePath;
      return path ? `Reading file: ${String(path)}` : `Reading file`;
    }
    
    // File editing tools
    if (toolInfo.includes('Edit') || toolInfo.includes('Write') || 
        toolInfo.includes('file_edit') || toolInfo.includes('file_write')) {
      const path = tool.args.file_path || tool.args.path || tool.args.filePath;
      return path ? `Editing file: ${String(path)}` : `Editing file`;
    }
    
    // Directory listing tools
    if (toolInfo.includes('LS') || toolInfo.includes('List') || toolInfo.includes('ls')) {
      const path = tool.args.path || tool.args.directory || '.';
      return `Listing files in: ${String(path)}`;
    }
    
    // Agent tools
    if (toolInfo.includes('Agent') || toolInfo.includes('agent')) {
      return `Running agent to: ${truncateString(String(tool.args.prompt || 'perform task'), 80)}`;
    }
    
    // Web tools
    if (toolInfo.includes('Web') || toolInfo.includes('Fetch') || 
        toolInfo.includes('web') || toolInfo.includes('fetch')) {
      return `Fetching content from: ${truncateString(String(tool.args.url || 'website'), 80)}`;
    }
    
    // Try to extract any useful parameter
    const argKeys = Object.keys(tool.args);
    if (argKeys.length > 0) {
      // Find the most meaningful parameter (not 'type', 'id', etc.)
      const meaningfulParams = argKeys.filter(k => 
        !['type', 'id', 'name', 'tool', 'timestamp'].includes(k.toLowerCase())
      );
      
      if (meaningfulParams.length > 0) {
        const param = meaningfulParams[0];
        const value = tool.args[param];
        return `${tool.toolName}: ${param} = ${truncateString(String(value), 60)}`;
      }
    }
    
    // For other tools, show a generic message with the tool name
    return `Running ${tool.toolName}`;
  }
  
  // Try to construct description from tool name and any available data
  if (tool.tool && tool.tool.includes('/')) {
    // If tool has a path-like structure, get the last part
    const toolName = tool.tool.split('/').pop() || tool.toolName;
    return `Running ${toolName}`;
  }
  
  // Fallback to a simple message with the tool name
  return `Running ${tool.toolName}`;
};


export interface ToolVisualizationProps {
  tool: ToolVisualizationItem;
  className?: string;
  compact?: boolean;
  showExecutionTime?: boolean;
  isDarkTheme?: boolean;
  defaultViewMode?: PreviewMode;
  onViewModeChange?: (toolId: string, mode: PreviewMode) => void;
}

export function ToolVisualization({
  tool,
  className,
  compact: _compact = false,
  showExecutionTime = true,
  isDarkTheme = false,
  defaultViewMode = PreviewMode.BRIEF,
  onViewModeChange,
}: ToolVisualizationProps) {
  // Add detailed component lifecycle logging
  console.log('🔍 ToolVisualization RENDER', { 
    id: tool.id, 
    status: tool.status, 
    hasPreview: !!tool.preview,
    previewType: tool.preview?.contentType,
    toolName: tool.toolName,
    executionTime: tool.executionTime,
    hasResult: !!tool.result,
    hasError: !!tool.error,
    timestamp: new Date().toISOString(),
    startTime: tool.startTime ? new Date(tool.startTime).toISOString() : undefined,
    endTime: tool.endTime ? new Date(tool.endTime).toISOString() : undefined
  });
  // Determine the tool state from the status
  const toolState = 
    tool.status === 'running' ? ToolState.RUNNING :
    tool.status === 'completed' ? ToolState.COMPLETED :
    tool.status === 'error' ? ToolState.ERROR :
    tool.status === 'aborted' ? ToolState.ABORTED :
    tool.status === 'awaiting-permission' ? 'awaiting-permission' as ToolState :
    ToolState.PENDING;
    
  // Log detailed tool state for debugging
  console.log(`Tool state calculation for ${tool.id} (${tool.toolName}):`, {
    currentStatus: tool.status,
    calculatedState: toolState,
    hasPreview: !!tool.preview,
    previewContentType: tool.preview?.contentType,
    briefContentExists: !!tool.preview?.briefContent,
    fullContentExists: !!tool.preview?.fullContent
  });
  
  // Track view mode locally with the provided default
  const [viewMode, setViewMode] = useState<PreviewMode>(
    tool.viewMode || defaultViewMode
  );
  
  // Update local state when tool's viewMode changes, but only once on initial render or explicit change
  useEffect(() => {
    // Only update if tool.viewMode is defined and different from current viewMode
    if (tool.viewMode !== undefined) {
      setViewMode(tool.viewMode);
    }
  }, [tool.viewMode]); // Remove viewMode from dependency array to prevent immediate reversion
  
  // Handle changes to view modes
  const setViewModeWithCallback = useCallback((nextMode: PreviewMode, e?: React.MouseEvent) => {
    // If event was provided, prevent default and stop propagation
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    console.log('setViewModeWithCallback called:', {
      toolId: tool.id,
      currentMode: viewMode,
      nextMode,
      hasPreview: !!tool.preview
    });
    
    // If tool has no preview or is in a state that can't show previews, do nothing
    if (!tool.preview || (
        toolState !== ToolState.COMPLETED && 
        toolState !== ToolState.RUNNING && 
        tool.status !== 'awaiting-permission')) {
      console.log('setViewModeWithCallback early return - condition not met:', { 
        toolState, 
        status: tool.status,
        hasPreview: !!tool.preview 
      });
      return;
    }
    
    setViewMode(nextMode);
    
    // Notify parent component of view mode change
    if (onViewModeChange) {
      onViewModeChange(tool.id, nextMode);
    }
  }, [viewMode, tool.id, toolState, tool.status, tool.preview, onViewModeChange]);
  
  // Handlers for specific view mode changes
  const minimizePreview = useCallback((e?: React.MouseEvent) => {
    setViewModeWithCallback(PreviewMode.RETRACTED, e);
  }, [setViewModeWithCallback]);
  
  const showFullPreview = useCallback((e?: React.MouseEvent) => {
    setViewModeWithCallback(PreviewMode.COMPLETE, e);
  }, [setViewModeWithCallback]);

  const showBriefPreview = useCallback((e?: React.MouseEvent) => {
    setViewModeWithCallback(PreviewMode.BRIEF, e);
  }, [setViewModeWithCallback]);
  
  // Get appropriate styles for the current state
  const getStatusStyles = () => {
    const baseStyle = {
      [ToolState.RUNNING]: `border-blue-500 ${isDarkTheme ? 'bg-blue-900/30' : 'bg-blue-50'} shadow-sm`,
      [ToolState.COMPLETED]: `border-green-500 ${isDarkTheme ? 'bg-green-900/30' : 'bg-green-50'} shadow-sm`,
      [ToolState.ERROR]: `border-red-500 ${isDarkTheme ? 'bg-red-900/30' : 'bg-red-50'} shadow-sm`,
      [ToolState.ABORTED]: `border-gray-500 ${isDarkTheme ? 'bg-gray-800/20' : 'bg-gray-50'} opacity-75 tool-aborted`,
      'awaiting-permission': `border-amber-500 ${isDarkTheme ? 'bg-amber-900/30' : 'bg-amber-50'} shadow-sm`,
    };
    
    const currentState = toolState === ToolState.PENDING 
      ? (tool.status === 'awaiting-permission' ? 'awaiting-permission' : ToolState.RUNNING) 
      : toolState;
      
    return baseStyle[currentState as keyof typeof baseStyle];
  };
  
  const statusStyles = getStatusStyles();
  
  // Determine the status indicator text and style
  const statusIndicator = {
    [ToolState.RUNNING]: { icon: '●', ariaLabel: 'Running', className: 'text-blue-500 animate-pulse' },
    [ToolState.COMPLETED]: { icon: '✓', ariaLabel: 'Completed', className: 'text-green-500' },
    [ToolState.ERROR]: { icon: '✗', ariaLabel: 'Error', className: 'text-red-500' },
    [ToolState.ABORTED]: { icon: '■', ariaLabel: 'Aborted', className: 'text-gray-500' },
    'awaiting-permission': { icon: '?', ariaLabel: 'Waiting for permission', className: 'text-amber-500 animate-pulse' },
  }[toolState === ToolState.PENDING ? (tool.status === 'awaiting-permission' ? 'awaiting-permission' : ToolState.RUNNING) : toolState];
  
  // Format execution time if available
  const formattedTime = tool.executionTime 
    ? `${(tool.executionTime / 1000).toFixed(2)}s` 
    : 'In progress...';
  
  // Format timestamp - unused for now but keeping for future reference
  const _timestamp = new Date(tool.startTime).toLocaleTimeString();
  
  // Determine if we should show a preview - use multiple detection methods for robustness
  // Log the exact tool preview data to diagnose the issue
  console.log(`[DEBUG] ToolVisualization preview data for ${tool.id}:`, {
    preview: tool.preview,
    toolProps: Object.keys(tool),
    explicitHasPreview: tool.hasPreview === true,
    previewDetails: tool.preview ? {
      contentType: tool.preview.contentType,
      briefContentLength: tool.preview?.briefContent?.length,
      fullContentLength: tool.preview?.fullContent?.length,
      hasActualContent: tool.preview.hasActualContent === true
    } : null
  });

  // Use multiple methods to detect valid preview
  const hasPreview = (
    // Check for explicit flags
    tool.hasPreview === true ||
    // Or check for actual preview content
    (!!tool.preview && (
      !!tool.preview.briefContent || 
      !!tool.preview.fullContent || 
      tool.preview.hasActualContent === true
    ))
  );
  
  // Can expand/collapse if there's a preview and tool is complete, running, or awaiting permission
  const canExpandCollapse = hasPreview && (
    toolState === ToolState.COMPLETED || 
    toolState === ToolState.RUNNING || 
    tool.status === 'awaiting-permission'
  );
  
  console.log(`Preview availability check for ${tool.id}:`, {
    hasPreviewObject: !!tool.preview,
    hasActualPreviewContent: hasPreview,
    previewContentType: tool.preview?.contentType,
    briefContent: tool.preview?.briefContent ? 
      tool.preview.briefContent.substring(0, 50) + (tool.preview.briefContent.length > 50 ? '...' : '') : undefined,
    briefContentType: typeof tool.preview?.briefContent,
    briefContentLength: tool.preview?.briefContent?.length || 0,
    fullContentLength: tool.preview?.fullContent?.length || 0,
    canExpandCollapse,
    toolState,
    contentSizes: tool.preview ? {
      briefLength: tool.preview.briefContent?.length || 0,
      fullLength: tool.preview.fullContent?.length || 0
    } : null
  });
  
  return (
    <div 
      className={cn(
        'tool-visualization border-l-4 px-1 py-0.5 my-1 rounded',
        'transition-colors duration-300',
        statusStyles,
        'text-[0.8em]',
        className
      )}
      style={{ 
        maxWidth: viewMode === PreviewMode.COMPLETE ? '90%' : '90%',
        width: viewMode === PreviewMode.COMPLETE ? 'auto' : '450px',
        transition: 'width 0.3s ease-in-out, max-width 0.3s ease-in-out'
      }}
      data-testid="tool-visualization"
      data-tool-id={tool.tool}
      data-tool-status={toolState}
      data-view-mode={viewMode}
      role="status"
      aria-live={toolState === ToolState.RUNNING ? 'polite' : 'off'}
      aria-label={`Tool ${tool.toolName} ${toolState}: ${getToolDescription(tool)}`}
    >
      {/* Tool header with status, name, and controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {/* Status indicator */}
          <span 
            className={statusIndicator.className}
            aria-label={statusIndicator.ariaLabel}
            role="status"
          >
            {statusIndicator.icon}
          </span>
          
          {/* Tool name */}
          <span className="font-semibold">{tool.toolName}</span>
          
          {/* Execution time */}
          {showExecutionTime && tool.executionTime && (
            <span className={`${isDarkTheme ? 'text-gray-400' : 'text-gray-500'} ml-1`}>
              ({formattedTime})
            </span>
          )}
        </div>
        
        {/* Minimize button - only shown when preview is not retracted */}
        {canExpandCollapse && viewMode !== PreviewMode.RETRACTED && (
          <button
            onClick={minimizePreview}
            className={cn(
              'p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700',
              'transition-colors duration-200'
            )}
            aria-label="Minimize preview"
            data-testid="tool-minimize-button"
          >
            <Minimize2 size={14} />
          </button>
        )}
      </div>
      
      {/* Tool description - using break-all for paths */}
      <div className="mb-1 break-words overflow-hidden">
        {getToolDescription(tool)}
      </div>
      
      {/* Preview content - show if preview data exists for completed, running, or awaiting permission tools */}
      {hasPreview && viewMode !== PreviewMode.RETRACTED && (
        <div 
          className={cn(
            'mt-2 preview-container',
            'border rounded',
            isDarkTheme ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50',
            'transition-all duration-300 overflow-hidden'
          )}
        >
          <PreviewContent 
            toolId={tool.id}
            toolStatus={tool.status}
            viewMode={viewMode}
            contentType={tool.preview?.contentType}
            briefContent={tool.preview?.briefContent}
            fullContent={tool.preview?.fullContent}
            metadata={tool.preview?.metadata}
            isDarkTheme={isDarkTheme}
            onShowMore={viewMode === PreviewMode.BRIEF && tool.preview?.fullContent !== tool.preview?.briefContent ? showFullPreview : undefined}
            onShowLess={viewMode === PreviewMode.COMPLETE ? showBriefPreview : undefined}
          />
        </div>
      )}
      
      {/* Show button to expand preview when in RETRACTED mode */}
      {hasPreview && viewMode === PreviewMode.RETRACTED && (
        <button
          onClick={(e) => setViewModeWithCallback(PreviewMode.BRIEF, e)}
          className={cn(
            'mt-1 w-full text-xs py-1 rounded',
            isDarkTheme ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700',
            'transition-colors duration-200 flex items-center justify-center gap-1'
          )}
          aria-label="Show preview"
          data-testid="tool-show-preview-button"
        >
          <ChevronDown size={12} />
          <span>Show Preview</span>
        </button>
      )}
      
      {/* Error message if status is error */}
      {toolState === ToolState.ERROR && tool.error && (
        <div className={isDarkTheme ? 'text-red-400' : 'text-red-600'}>
          {tool.error.message}
        </div>
      )}
      
      {/* Aborted message if status is aborted */}
      {toolState === ToolState.ABORTED && (
        <div className={isDarkTheme ? 'text-gray-400' : 'text-gray-600'}>
          Operation aborted
        </div>
      )}
      
      {/* Permission request banner */}
      {tool.status === 'awaiting-permission' && toolState !== ToolState.ABORTED && (
        <div 
          className={`mt-1 ${isDarkTheme ? 'bg-amber-900 text-amber-100 border-amber-700' : 'bg-amber-100 text-amber-800 border-amber-300'} px-2 py-1 rounded-md text-xs border`}
          data-testid="permission-banner"
          data-execution-id={tool.id}
        >
          <div className="font-semibold">Permission Required - Type 'y' to allow</div>
        </div>
      )}
      
      {/* Debug output - only visible in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className={`mt-2 p-2 text-xs border rounded font-mono ${
          isDarkTheme 
            ? 'bg-gray-800 border-gray-600' 
            : 'bg-gray-100 border-gray-300'
        }`}>
          <div>status: {tool.status}</div>
          <div>viewMode: {viewMode}</div>
          <div>hasPreview: {hasPreview ? 'true' : 'false'}</div>
          <div>tool: {tool.tool}</div>
        </div>
      )}
    </div>
  );
}

// Create a new PreviewContent component
interface PreviewContentProps {
  toolId: string;
  toolStatus: string;
  viewMode: PreviewMode;
  contentType?: string;
  briefContent?: string;
  fullContent?: string;
  metadata?: Record<string, unknown>;
  isDarkTheme: boolean;
  onShowMore?: (e: React.MouseEvent) => void;
  onShowLess?: (e: React.MouseEvent) => void;
}

function PreviewContent({ 
  toolId,
  toolStatus,
  viewMode,
  contentType,
  briefContent,
  fullContent,
  metadata,
  isDarkTheme,
  onShowMore,
  onShowLess
}: PreviewContentProps) {
  // Enhanced validation that handles missing content better
  if (!contentType) {
    console.warn(`Missing content type for preview in tool ${toolId}`);
    return null;
  }
  
  // If we don't have any content at all, show a placeholder
  if (!briefContent && !fullContent) {
    console.warn(`Missing content for preview in tool ${toolId} with type ${contentType}`);
    return (
      <div className={`p-2 text-center italic ${isDarkTheme ? 'text-gray-400' : 'text-gray-600'}`}>
        Preview loading...
      </div>
    );
  }
  
  // Log preview content info for debugging
  console.log('PreviewContent component render:', {
    toolId,
    toolStatus,
    viewMode,
    contentType,
    hasBriefContent: !!briefContent,
    briefContentLength: briefContent?.length,
    hasFullContent: !!fullContent,
    fullContentLength: fullContent?.length,
    areContentsDifferent: fullContent !== briefContent,
  });
  
  // Determine content to show based on view mode
  const content = viewMode === PreviewMode.BRIEF ? briefContent : (fullContent || briefContent) as string;
  
  // Base styles for all preview types
  const baseStyles = cn(
    'p-2 overflow-auto',
    'font-mono text-xs whitespace-pre-wrap',
    isDarkTheme ? 'text-gray-300' : 'text-gray-800'
  );
  
  // Max height based on view mode
  const maxHeight = viewMode === PreviewMode.BRIEF ? '200px' : '500px';
  
  // Check if there is more content to show
  const hasMoreContent = fullContent && fullContent !== briefContent;
  
  // Render based on content type
  switch (contentType) {
    case PreviewContentType.TEXT:
    case PreviewContentType.CODE: {
      return (
        <>
          <div 
            className={baseStyles}
            style={{ maxHeight }}
            data-testid="preview-content-code"
          >
            {content}
          </div>
          
          {/* Show More/Less buttons */}
          <div className="text-center p-1 border-t">
            {/* Show More button for BRIEF mode when there's more content */}
            {viewMode === PreviewMode.BRIEF && hasMoreContent && onShowMore && (
              <button
                onClick={onShowMore}
                className={cn(
                  'text-xs px-3 py-1 rounded',
                  isDarkTheme ? 'hover:bg-gray-700 text-blue-300' : 'hover:bg-gray-200 text-blue-600',
                  'transition-colors duration-200'
                )}
                aria-label="Show more content"
                data-testid="preview-show-more-button"
              >
                Show More
              </button>
            )}
            
            {/* Show Less button for COMPLETE mode */}
            {viewMode === PreviewMode.COMPLETE && onShowLess && (
              <button
                onClick={onShowLess}
                className={cn(
                  'text-xs px-3 py-1 rounded',
                  isDarkTheme ? 'hover:bg-gray-700 text-blue-300' : 'hover:bg-gray-200 text-blue-600',
                  'transition-colors duration-200'
                )}
                aria-label="Show less content"
                data-testid="preview-show-less-button"
              >
                Show Less
              </button>
            )}
          </div>
        </>
      );
    }
      
    case PreviewContentType.DIFF: {
      // Extract file path and changes from metadata if available
      const filePath = metadata?.filePath as string || '';
      const changesSummary = metadata?.changesSummary as { additions: number, deletions: number } || { additions: 0, deletions: 0 };
      const isEmptyFile = metadata?.isEmptyFile === true;
      const isFileEdit = metadata?.isFileEdit === true;
      const isPlaceholder = metadata?.isPlaceholder === true;
      
      // Log all metadata to help debug
      console.log('Diff preview metadata details:', {
        filePath,
        contentType,
        isEmptyFile,
        isFileEdit,
        isPlaceholder,
        changesSummary,
        metadataKeys: metadata ? Object.keys(metadata) : [],
        fullMetadata: metadata
      });
      
      // Extract original and modified text from metadata
      const oldString = metadata?.oldString as string || '';
      const newString = metadata?.newString as string || '';
      
      console.log('Diff strings:', {
        oldStringExists: !!oldString,
        newStringExists: !!newString,
        oldStringLength: oldString?.length,
        newStringLength: newString?.length,
        oldStringEmpty: oldString === '',
        newStringEmpty: newString === ''
      });
      
      // Handle empty file or placeholder cases
      if (isEmptyFile || (isPlaceholder && isFileEdit)) {
        // This is a special case for file edits with placeholder content
        if (isFileEdit) {
          console.log('Rendering file edit placeholder for:', filePath);
          
          // For file edits, if we have placeholder strings, try to use Monaco diff viewer
          if (oldString && newString && oldString !== newString) {
            console.log('Using Monaco diff viewer for placeholder content');
            return (
              <div 
                className={baseStyles}
                style={{ maxHeight: 'none' }}
                data-testid="preview-content-diff-placeholder"
              >
                <div className={`mb-2 font-medium ${isDarkTheme ? 'text-yellow-300' : 'text-yellow-700'}`}>
                  {filePath} (Preview)
                </div>
                <MonacoDiffViewer
                  originalText={oldString}
                  modifiedText={newString}
                  fileName={filePath}
                  isDarkTheme={isDarkTheme}
                  height={viewMode === PreviewMode.COMPLETE ? '500px' : '150px'}
                />
              </div>
            );
          }
          
          // Fallback to simple message
          return (
            <div 
              className={`${baseStyles} text-center italic`}
              style={{ maxHeight }}
              data-testid="preview-content-diff-empty"
            >
              <div className={isDarkTheme ? 'text-gray-300' : 'text-gray-700'}>
                {filePath ? `Editing file: ${filePath}` : 'Editing file'}
              </div>
            </div>
          );
        }
        
        // For empty file creation
        return (
          <div 
            className={`${baseStyles} text-center italic`}
            style={{ maxHeight }}
            data-testid="preview-content-diff-empty"
          >
            <div className={isDarkTheme ? 'text-gray-300' : 'text-gray-700'}>
              {filePath ? `Creating empty file: ${filePath}` : 'Creating empty file'}
            </div>
          </div>
        );
      }
      
      // Determine if we can get original and modified content
      const hasOriginalAndModified = !!(oldString || newString);
      
      // Regular diff content with Monaco diffing for better visualization
      return (
        <>
          <div 
            className={baseStyles}
            style={{ maxHeight: 'none' }}  // Allow Monaco editor to control height
            data-testid="preview-content-diff"
          >
            {/* File info header */}
            {filePath && (
              <div className={`mb-2 font-medium ${isDarkTheme ? 'text-yellow-300' : 'text-yellow-700'}`}>
                {filePath}
                <span className="ml-2 text-xs">
                  <span className={isDarkTheme ? 'text-green-300' : 'text-green-700'}>
                    +{changesSummary.additions}
                  </span>
                  <span className="mx-1">|</span>
                  <span className={isDarkTheme ? 'text-red-300' : 'text-red-700'}>
                    -{changesSummary.deletions}
                  </span>
                </span>
              </div>
            )}
            
            {/* Use Monaco diff viewer for all cases - with unified diff fallback */}
            <MonacoDiffViewer
              originalText={oldString}
              modifiedText={newString}
              unifiedDiff={hasOriginalAndModified ? '' : content}
              fileName={filePath}
              isDarkTheme={isDarkTheme}
              height={viewMode === PreviewMode.COMPLETE ? '500px' : '200px'}
            />
          </div>
          
          {/* Show More/Less buttons */}
          <div className="text-center p-1 border-t">
            {/* Show More button for BRIEF mode when there's more content */}
            {viewMode === PreviewMode.BRIEF && hasMoreContent && onShowMore && (
              <button
                onClick={onShowMore}
                className={cn(
                  'text-xs px-3 py-1 rounded',
                  isDarkTheme ? 'hover:bg-gray-700 text-blue-300' : 'hover:bg-gray-200 text-blue-600',
                  'transition-colors duration-200'
                )}
                aria-label="Show more content"
                data-testid="preview-show-more-button"
              >
                Show More
              </button>
            )}
            
            {/* Show Less button for COMPLETE mode */}
            {viewMode === PreviewMode.COMPLETE && onShowLess && (
              <button
                onClick={onShowLess}
                className={cn(
                  'text-xs px-3 py-1 rounded',
                  isDarkTheme ? 'hover:bg-gray-700 text-blue-300' : 'hover:bg-gray-200 text-blue-600',
                  'transition-colors duration-200'
                )}
                aria-label="Show less content"
                data-testid="preview-show-less-button"
              >
                Show Less
              </button>
            )}
          </div>
        </>
      );
    }
      
    case PreviewContentType.DIRECTORY: {
      // Extract entries from metadata if available
      const entries = 
        (metadata?.entries as Array<{name: string; isDirectory: boolean; size?: number}>) ||
        [];
      
      return (
        <>
          <div 
            className={baseStyles}
            style={{ maxHeight }}
            data-testid="preview-content-directory"
          >
            {/* Show directory entries with icons */}
            {content}
            
            {/* If we have structured entries, show them with icons */}
            {entries.length > 0 && viewMode === PreviewMode.COMPLETE && (
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1">
                {entries.map((entry, i) => (
                  <div key={i} className="flex items-center">
                    <span className="mr-1">
                      {entry.isDirectory ? '📁' : '📄'}
                    </span>
                    <span className="truncate">
                      {entry.name}
                    </span>
                    {entry.size !== undefined && (
                      <span className="ml-1 text-gray-500 text-xs">
                        ({formatSize(entry.size)})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Show More/Less buttons */}
          <div className="text-center p-1 border-t">
            {/* Show More button for BRIEF mode when there's more content */}
            {viewMode === PreviewMode.BRIEF && hasMoreContent && onShowMore && (
              <button
                onClick={onShowMore}
                className={cn(
                  'text-xs px-3 py-1 rounded',
                  isDarkTheme ? 'hover:bg-gray-700 text-blue-300' : 'hover:bg-gray-200 text-blue-600',
                  'transition-colors duration-200'
                )}
                aria-label="Show more content"
                data-testid="preview-show-more-button"
              >
                Show More
              </button>
            )}
            
            {/* Show Less button for COMPLETE mode */}
            {viewMode === PreviewMode.COMPLETE && onShowLess && (
              <button
                onClick={onShowLess}
                className={cn(
                  'text-xs px-3 py-1 rounded',
                  isDarkTheme ? 'hover:bg-gray-700 text-blue-300' : 'hover:bg-gray-200 text-blue-600',
                  'transition-colors duration-200'
                )}
                aria-label="Show less content"
                data-testid="preview-show-less-button"
              >
                Show Less
              </button>
            )}
          </div>
        </>
      );
    }
      
    default: {
      // Fallback for other content types
      return (
        <>
          <div 
            className={baseStyles}
            style={{ maxHeight }}
            data-testid="preview-content-default"
          >
            {content}
          </div>
          
          {/* Show More/Less buttons */}
          <div className="text-center p-1 border-t">
            {/* Show More button for BRIEF mode when there's more content */}
            {viewMode === PreviewMode.BRIEF && hasMoreContent && onShowMore && (
              <button
                onClick={onShowMore}
                className={cn(
                  'text-xs px-3 py-1 rounded',
                  isDarkTheme ? 'hover:bg-gray-700 text-blue-300' : 'hover:bg-gray-200 text-blue-600',
                  'transition-colors duration-200'
                )}
                aria-label="Show more content"
                data-testid="preview-show-more-button"
              >
                Show More
              </button>
            )}
            
            {/* Show Less button for COMPLETE mode */}
            {viewMode === PreviewMode.COMPLETE && onShowLess && (
              <button
                onClick={onShowLess}
                className={cn(
                  'text-xs px-3 py-1 rounded',
                  isDarkTheme ? 'hover:bg-gray-700 text-blue-300' : 'hover:bg-gray-200 text-blue-600',
                  'transition-colors duration-200'
                )}
                aria-label="Show less content"
                data-testid="preview-show-less-button"
              >
                Show Less
              </button>
            )}
          </div>
        </>
      );
    }
  }
}

// Helper to format file size
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default ToolVisualization;