import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { ToolExecution } from '../../hooks/useToolStream';
import { ToolState } from '../../types/terminal';
import { PreviewMode, PreviewContentType } from '../../../types/preview';
import { ChevronDown, ChevronRight, Maximize2 } from 'lucide-react';

// Helper function to truncate strings
const truncateString = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
};

// Helper function to get a meaningful description of what the tool is doing
const getToolDescription = (tool: ToolExecution): string => {
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
      return path ? `Reading file: ${truncateString(String(path), 80)}` : `Reading file`;
    }
    
    // File editing tools
    if (toolInfo.includes('Edit') || toolInfo.includes('Write') || 
        toolInfo.includes('file_edit') || toolInfo.includes('file_write')) {
      const path = tool.args.file_path || tool.args.path || tool.args.filePath;
      return path ? `Editing file: ${truncateString(String(path), 80)}` : `Editing file`;
    }
    
    // Directory listing tools
    if (toolInfo.includes('LS') || toolInfo.includes('List') || toolInfo.includes('ls')) {
      const path = tool.args.path || tool.args.directory || '.';
      return `Listing files in: ${truncateString(String(path), 80)}`;
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

// New helper to get appropriate icon for the current view mode
const getViewModeIcon = (mode: PreviewMode) => {
  switch (mode) {
    case PreviewMode.RETRACTED:
      return <ChevronRight size={14} />;
    case PreviewMode.BRIEF:
      return <ChevronDown size={14} />;
    case PreviewMode.COMPLETE:
      return <Maximize2 size={14} />;
    default:
      return <ChevronRight size={14} />;
  }
};

export interface ToolVisualizationProps {
  tool: ToolExecution;
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
  // Determine the tool state from the status
  const toolState = 
    tool.status === 'running' ? ToolState.RUNNING :
    tool.status === 'completed' ? ToolState.COMPLETED :
    tool.status === 'error' ? ToolState.ERROR :
    tool.status === 'aborted' ? ToolState.ABORTED :
    tool.status === 'awaiting-permission' ? 'awaiting-permission' as ToolState :
    ToolState.PENDING;
  
  // Track view mode locally with the provided default
  const [viewMode, setViewMode] = useState<PreviewMode>(
    tool.viewMode || defaultViewMode
  );
  
  // Update local state when tool's viewMode changes
  useEffect(() => {
    if (tool.viewMode && tool.viewMode !== viewMode) {
      setViewMode(tool.viewMode);
    }
  }, [tool.viewMode, viewMode]);
  
  // Handle cycling through view modes
  const cycleViewMode = useCallback(() => {
    // If tool is not completed or has no preview, do nothing
    if (toolState !== ToolState.COMPLETED || !tool.preview) {
      return;
    }
    
    const nextMode = 
      viewMode === PreviewMode.RETRACTED ? PreviewMode.BRIEF :
      viewMode === PreviewMode.BRIEF ? PreviewMode.COMPLETE :
      PreviewMode.RETRACTED;
    
    setViewMode(nextMode);
    
    // Notify parent component of view mode change
    if (onViewModeChange) {
      onViewModeChange(tool.id, nextMode);
    }
  }, [viewMode, tool.id, toolState, tool.preview, onViewModeChange]);
  
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
  
  // Determine if we should show a preview
  const hasPreview = !!tool.preview;
  const canExpandCollapse = hasPreview && toolState === ToolState.COMPLETED;
  
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
        maxWidth: viewMode === PreviewMode.COMPLETE ? '90%' : '30%',
        width: viewMode === PreviewMode.COMPLETE ? 'auto' : '300px',
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
        
        {/* View mode toggle button */}
        {canExpandCollapse && (
          <button
            onClick={cycleViewMode}
            className={cn(
              'p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700',
              'transition-colors duration-200'
            )}
            aria-label={`Toggle view mode (currently ${viewMode})`}
          >
            {getViewModeIcon(viewMode)}
          </button>
        )}
      </div>
      
      {/* Tool description */}
      <div className="truncate mb-1">
        {getToolDescription(tool)}
      </div>
      
      {/* Preview content - only show if there's preview data and tool is completed */}
      {hasPreview && toolState === ToolState.COMPLETED && viewMode !== PreviewMode.RETRACTED && (
        <div 
          className={cn(
            'mt-2 preview-container',
            'border rounded',
            isDarkTheme ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50',
            'transition-all duration-300 overflow-hidden'
          )}
        >
          <PreviewContent 
            tool={tool} 
            viewMode={viewMode} 
            isDarkTheme={isDarkTheme}
          />
        </div>
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
      {tool.status === 'awaiting-permission' && tool.requiresPermission && toolState !== ToolState.ABORTED && (
        <div 
          className={`mt-1 ${isDarkTheme ? 'bg-amber-900 text-amber-100 border-amber-700' : 'bg-amber-100 text-amber-800 border-amber-300'} px-2 py-1 rounded-md text-xs border`}
          data-testid="permission-banner"
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
  tool: ToolExecution;
  viewMode: PreviewMode;
  isDarkTheme: boolean;
}

function PreviewContent({ tool, viewMode, isDarkTheme }: PreviewContentProps) {
  if (!tool.preview) {
    return null;
  }
  
  const { contentType, briefContent } = tool.preview;
  // Cast preview to unknown first for type safety
  const fullContent = (tool.preview as unknown as { fullContent?: string }).fullContent;
  
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
  
  // Render based on content type
  switch (contentType) {
    case PreviewContentType.TEXT:
    case PreviewContentType.CODE:
      return (
        <div 
          className={baseStyles}
          style={{ maxHeight }}
          data-testid="preview-content-code"
        >
          {content}
        </div>
      );
      
    case PreviewContentType.DIFF:
      return (
        <div 
          className={baseStyles}
          style={{ maxHeight }}
          data-testid="preview-content-diff"
        >
          {/* Show diff with highlighting */}
          {content.split('\n').map((line: string, i: number) => {
            const lineClass = line.startsWith('+') 
              ? (isDarkTheme ? 'bg-green-900/30 text-green-300' : 'bg-green-50 text-green-800') 
              : line.startsWith('-') 
                ? (isDarkTheme ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-800')
                : '';
                
            return (
              <div key={i} className={lineClass}>
                {line}
              </div>
            );
          })}
        </div>
      );
      
    case PreviewContentType.DIRECTORY: {
      // Extract entries from metadata if available
      const entries = 
        (tool.preview.metadata?.entries as Array<{name: string; isDirectory: boolean; size?: number}>) ||
        [];
      
      return (
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
      );
    }
      
    default:
      // Fallback for other content types
      return (
        <div 
          className={baseStyles}
          style={{ maxHeight }}
          data-testid="preview-content-default"
        >
          {content}
        </div>
      );
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