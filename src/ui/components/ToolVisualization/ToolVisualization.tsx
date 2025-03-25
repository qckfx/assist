import React from 'react';
import { cn } from '../../lib/utils';
import { ToolExecution } from '../../hooks/useToolStream';

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
  // Use the status to determine styling - subtle background colors with clear status indication
  const statusStyles = {
    running: 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-sm',
    completed: 'border-green-500 bg-green-50 dark:bg-green-900/30 shadow-sm',
    error: 'border-red-500 bg-red-50 dark:bg-red-900/30 shadow-sm',
    'awaiting-permission': 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 shadow-sm',
  }[tool.status];
  
  // Determine the status indicator text and style
  const statusIndicator = {
    running: { icon: '●', ariaLabel: 'Running', className: 'text-blue-500 animate-pulse' },
    completed: { icon: '✓', ariaLabel: 'Completed', className: 'text-green-500' },
    error: { icon: '✗', ariaLabel: 'Error', className: 'text-red-500' },
    'awaiting-permission': { icon: '?', ariaLabel: 'Waiting for permission', className: 'text-amber-500 animate-pulse' },
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
        'tool-visualization border-l-4 px-2 py-1 my-1 rounded',
        'transition-colors duration-300',
        statusStyles,
        compact ? 'text-sm' : '', // Smaller text for compact view
        className
      )}
      data-testid="tool-visualization"
      data-tool-id={tool.tool}
      data-tool-status={tool.status}
      role="status"
      aria-live={tool.status === 'running' ? 'polite' : 'off'}
      aria-label={`Tool ${tool.toolName} ${tool.status}: ${getToolDescription(tool)}`}
    >
      {/* Header with tool name - simpler display */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <span className="font-semibold text-xs">{tool.toolName}</span>
        </div>
        
        {showExecutionTime && tool.executionTime && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {formattedTime}
          </div>
        )}
      </div>
      
      {/* Parameters - simplified display that always shows what the tool is doing */}
      <div 
        className={cn(
          'mt-1',
          'text-xs',
          showExpandedParams ? 'whitespace-pre-wrap' : 'truncate'
        )}
        onClick={onToggleExpand}
        style={{ cursor: onToggleExpand ? 'pointer' : 'default' }}
      >
        {/* Always show a meaningful description of what the tool is doing */}
        {getToolDescription(tool)}
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
      
      {/* Unified status indicator display */}
      <div className="flex justify-end mt-1">
        <span 
          className={`text-base ${statusIndicator.className}`}
          aria-label={statusIndicator.ariaLabel}
          role="status"
        >
          {statusIndicator.icon}
        </span>
      </div>
      
      {/* Permission request banner - added for permission-required tools */}
      {tool.status === 'awaiting-permission' && tool.requiresPermission && (
        <div 
          className="mt-2 bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-100 px-3 py-2 rounded-md text-sm border border-amber-300 dark:border-amber-700"
          data-testid="permission-banner"
        >
          <div className="font-semibold">Permission Required</div>
          <div className="text-xs mt-1">Type 'y' to allow, anything else to deny</div>
        </div>
      )}
      
      {/* Debug output - only visible in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-2 bg-gray-100 dark:bg-gray-800 p-2 text-xs border border-gray-300 dark:border-gray-600 rounded font-mono">
          <div>status: {tool.status}</div>
          <div>requiresPermission: {tool.requiresPermission ? 'true' : 'false'}</div>
          <div>permissionId: {tool.permissionId || 'none'}</div>
          <div>tool: {tool.tool}</div>
        </div>
      )}
    </div>
  );
}

export default ToolVisualization;