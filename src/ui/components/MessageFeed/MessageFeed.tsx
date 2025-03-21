import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface Message {
  id: string;
  content: string;
  type: 'user' | 'assistant' | 'system' | 'error';
  timestamp: Date;
}

export interface MessageFeedProps {
  messages: Message[];
  className?: string;
  autoScroll?: boolean;
}

export function MessageFeed({
  messages,
  className,
  autoScroll = true
}: MessageFeedProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to the bottom when messages change
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      // Check if scrollIntoView is available (for JSDOM in tests)
      if (typeof messagesEndRef.current.scrollIntoView === 'function') {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages, autoScroll]);

  return (
    <div 
      className={cn(
        'flex flex-col flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-2',
        className
      )}
      data-testid="message-feed"
    >
      {messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <p>No messages yet</p>
        </div>
      ) : (
        messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'px-3 py-2 rounded text-sm',
              message.type === 'user' && 'bg-blue-950 text-blue-100 self-end max-w-[80%]',
              message.type === 'assistant' && 'bg-gray-800 text-gray-100 self-start max-w-[80%]',
              message.type === 'system' && 'bg-gray-700 text-gray-200 self-center max-w-full italic text-xs',
              message.type === 'error' && 'bg-red-900 text-red-100 self-center max-w-full'
            )}
            data-testid={`message-${message.id}`}
          >
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
            <div className="text-xs text-gray-400 mt-1">
              {message.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}

export default MessageFeed;