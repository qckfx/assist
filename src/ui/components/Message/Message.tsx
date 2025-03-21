import React from 'react';
import { cn } from '@/lib/utils';

export type MessageType = 'user' | 'assistant' | 'system' | 'error' | 'tool';

export interface MessageProps {
  content: string;
  type: MessageType;
  timestamp?: Date;
  className?: string;
  showTimestamp?: boolean;
  enableAnsiColors?: boolean;
}

// Simple ANSI escape code parser
// This is a basic implementation - for a full implementation, consider using a library
function parseAnsi(text: string): React.ReactNode {
  if (!text) return '';
  
  // Replace common ANSI color codes with spans
  // This is a simplified version that handles basic colors
  const parts: React.ReactNode[] = [];
  const regex = /\u001b\[(\d+)m(.*?)(?=\u001b|\u0000|$)/g;
  let lastIndex = 0;
  let match;
  
  // Map ANSI color codes to Tailwind classes
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
    '1': 'font-bold',
    '3': 'italic',
    '4': 'underline',
    '0': '', // Reset
  };
  
  while ((match = regex.exec(text)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    
    const [_, code, content] = match;
    const className = colorMap[code] || '';
    
    if (code === '0') {
      // Reset - just add the content
      parts.push(content);
    } else {
      // Add styled content
      parts.push(
        <span key={match.index} className={className}>
          {content}
        </span>
      );
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add any remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : text;
}

export function Message({
  content,
  type,
  timestamp,
  className,
  showTimestamp = true,
  enableAnsiColors = true,
}: MessageProps) {
  // Process content for ANSI colors if enabled
  const processedContent = enableAnsiColors ? parseAnsi(content) : content;
  
  return (
    <div
      className={cn(
        'px-3 py-2 rounded text-sm',
        type === 'user' && 'bg-blue-950 text-blue-100',
        type === 'assistant' && 'bg-gray-800 text-gray-100',
        type === 'system' && 'bg-gray-700 text-gray-200 italic text-xs',
        type === 'error' && 'bg-red-900 text-red-100',
        type === 'tool' && 'bg-gray-850 text-gray-200 font-mono text-xs',
        className
      )}
      data-testid="message"
      data-message-type={type}
    >
      <div className="whitespace-pre-wrap break-words">{processedContent}</div>
      {showTimestamp && timestamp && (
        <div className="text-xs text-gray-400 mt-1">
          {timestamp.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

export default Message;