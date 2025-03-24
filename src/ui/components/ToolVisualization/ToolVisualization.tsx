import React from 'react';
import { cn } from '../../lib/utils';
import { ToolExecution } from '../../hooks/useToolStream';

export interface ToolVisualizationProps {
  tool: ToolExecution;
  className?: string;
  compact?: boolean;
  showExecutionTime?: boolean;
  showExpandedParams?: boolean;
  onToggleExpand?: () => void;
}

export function ToolVisualization({
  tool,
  className,
  compact = false,
  showExecutionTime = true,
  showExpandedParams = false,
  onToggleExpand,
}: ToolVisualizationProps) {
  // Use the status to determine styling
  const statusStyles = {
    running: 'border-blue-500 bg-blue-50 dark:bg-blue-900/30',
    completed: 'border-green-500 bg-green-50 dark:bg-green-900/30',
    error: 'border-red-500 bg-red-50 dark:bg-red-900/30',
  }[tool.status];
  
  // Format execution time if available
  const formattedTime = tool.executionTime 
    ? `${(tool.executionTime / 1000).toFixed(2)}s` 
    : 'In progress...';
  
  // Format timestamp
  const timestamp = new Date(tool.startTime).toLocaleTimeString();
  
  return (
    <div 
      className={cn(
        'tool-visualization border-l-4 px-3 py-2 my-2 rounded',
        'transition-all duration-200',
        statusStyles,
        className
      )}
      data-testid="tool-visualization"
      data-tool-id={tool.tool}
      data-tool-status={tool.status}
      role="status"
      aria-label={`Tool ${tool.toolName} ${tool.status}, ${tool.paramSummary}`}
    >
      {/* Header with tool name and status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <span className="font-semibold">{tool.toolName}</span>
          {!compact && (
            <span 
              className={cn(
                'ml-2 px-2 py-0.5 text-xs rounded-full',
                tool.status === 'running' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                tool.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              )}
            >
              {tool.status === 'running' ? 'Running' : 
               tool.status === 'completed' ? 'Completed' : 'Error'}
            </span>
          )}
        </div>
        
        {showExecutionTime && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {formattedTime}
          </div>
        )}
      </div>
      
      {/* Parameters */}
      <div 
        className={cn(
          'mt-1 text-sm',
          showExpandedParams ? 'whitespace-pre-wrap' : 'truncate'
        )}
        onClick={onToggleExpand}
        style={{ cursor: onToggleExpand ? 'pointer' : 'default' }}
      >
        {showExpandedParams && tool.args 
          ? JSON.stringify(tool.args, null, 2)
          : tool.paramSummary}
      </div>
      
      {/* Error message if status is error */}
      {tool.status === 'error' && tool.error && (
        <div className="mt-1 text-sm text-red-600 dark:text-red-400">
          {tool.error.message}
        </div>
      )}
      
      {/* Footer with timestamp */}
      {!compact && (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {timestamp}
        </div>
      )}
      
      {/* Show a spinner for running tools */}
      {tool.status === 'running' && (
        <div className="w-full flex justify-center mt-1">
          <div className="h-1 w-24 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
            <div className="h-full bg-blue-500 animate-pulse" style={{ width: '100%' }}></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ToolVisualization;