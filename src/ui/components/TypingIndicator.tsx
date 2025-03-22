/**
 * Typing indicator component for real-time agent responses
 */
import React from 'react';
import { useAgentEvents } from '../hooks/useAgentEvents';

/**
 * Props for the TypingIndicator component
 */
interface TypingIndicatorProps {
  sessionId?: string;
  className?: string;
}

/**
 * Animated typing indicator that shows when the agent is processing
 */
export function TypingIndicator({ 
  sessionId,
  className = ''
}: TypingIndicatorProps) {
  const { isProcessing } = useAgentEvents(sessionId);
  
  if (!isProcessing) {
    return null;
  }
  
  return (
    <div 
      className={`flex items-center gap-1 px-2 py-1 ${className}`}
      aria-label="Agent is thinking"
      aria-live="polite"
      role="status"
      data-testid="typing-indicator"
    >
      <div className="text-sm text-gray-500">Agent is thinking</div>
      <div className="flex gap-1">
        <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '200ms' }} />
        <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '400ms' }} />
      </div>
    </div>
  );
}

export default TypingIndicator;