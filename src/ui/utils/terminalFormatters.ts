/**
 * Formatters for terminal output
 */

/**
 * Format a tool execution result for display in the terminal
 */
export function formatToolResult(toolName: string, result: unknown): string {
  if (result === null || result === undefined) {
    return 'No result';
  }
  
  // Check if result is an error
  if (result instanceof Error || (result && result.name && result.message)) {
    return `Error: ${result.message || 'Unknown error'}`;
  }
  
  // Handle different tool types
  switch (toolName) {
    case 'BashTool':
    case 'Bash':
      return typeof result === 'string'
        ? result
        : JSON.stringify(result, null, 2);
    
    case 'View':
    case 'ReadTool':
    case 'FileReadTool':
      return typeof result === 'string'
        ? result
        : JSON.stringify(result, null, 2);
    
    case 'GlobTool':
    case 'GrepTool':
    case 'LSTool':
      // For list results, format as a list
      if (Array.isArray(result)) {
        return result.join('\n');
      }
      return JSON.stringify(result, null, 2);
    
    case 'FileEditTool':
    case 'FileWriteTool':
    case 'Replace':
    case 'Edit':
      return typeof result === 'string'
        ? result
        : 'File operation completed successfully';
        
    default:
      // Default formatting
      if (typeof result === 'object') {
        try {
          return JSON.stringify(result, null, 2);
        } catch {
          return 'Complex object (cannot display)';
        }
      }
      return String(result);
  }
}

/**
 * Format ANSI color codes for display in HTML
 * This is a simplified version that handles basic color codes
 */
export function formatAnsiToHtml(text: string): string {
  // Map of ANSI color codes to CSS classes
  const colorMap: Record<string, string> = {
    '30': 'text-black',
    '31': 'text-red-500',
    '32': 'text-green-500',
    '33': 'text-yellow-500',
    '34': 'text-blue-500',
    '35': 'text-purple-500',
    '36': 'text-cyan-500',
    '37': 'text-white',
    '90': 'text-gray-500',
    '91': 'text-red-300',
    '92': 'text-green-300',
    '93': 'text-yellow-300',
    '94': 'text-blue-300',
    '95': 'text-purple-300',
    '96': 'text-cyan-300',
    '97': 'text-gray-100',
  };
  
  // Replace ANSI color codes with span elements
  let formatted = text;
  
  // Replace color codes
  // eslint-disable-next-line no-control-regex
  formatted = formatted.replace(/\x1b\[(\d+)m(.*?)(\x1b\[0m|\x1b\[\d+m)/g, 
    (_, colorCode, content, _end) => {
      const cssClass = colorMap[colorCode] || '';
      return `<span class="${cssClass}">${content}</span>`;
    });
  
  // Handle remaining reset codes
  // eslint-disable-next-line no-control-regex
  formatted = formatted.replace(/\x1b\[0m/g, '</span>');
  
  return formatted;
}

/**
 * Format a terminal command for display
 */
export function formatCommand(command: string): string {
  // Add syntax highlighting or other formatting as needed
  return command;
}

/**
 * Format a timestamp for display
 */
export function formatTimestamp(timestamp: Date): string {
  return timestamp.toLocaleTimeString();
}