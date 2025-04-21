import React, { useEffect, useState } from 'react';
import { StructuredContent, TextContentPart } from '../../../types/content';

interface AnnouncerProps {
  messages: { id: string; content: StructuredContent; role?: string }[];
  assertive?: boolean;
}

/**
 * Helper function to extract text from structured content
 */
function getTextFromStructuredContent(content: StructuredContent): string {
  return content
    .filter(part => part.type === 'text')
    .map(part => (part as TextContentPart).text)
    .join(' ');
}

/**
 * Component for announcing messages to screen readers
 */
export function Announcer({ messages, assertive = false }: AnnouncerProps) {
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  
  useEffect(() => {
    // Only announce if there are messages and the last message changed
    if (messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      const textContent = getTextFromStructuredContent(latestMessage.content);
      
      // Check for abort-related system messages
      if (latestMessage.role === 'system' && 
          (textContent.includes('aborted') || 
           textContent.includes('Aborting'))) {
        setLastMessage('Operation aborted');
      }
      // Standard announcement behavior
      else if (textContent !== lastMessage) {
        setLastMessage(textContent);
      }
    }
  }, [messages, lastMessage]);
  
  if (!lastMessage) return null;
  
  return (
    <div 
      className="sr-only" 
      aria-live={assertive ? 'assertive' : 'polite'} 
      aria-atomic="true"
    >
      {lastMessage}
    </div>
  );
}

export default Announcer;