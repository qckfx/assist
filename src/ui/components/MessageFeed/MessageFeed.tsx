import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import Message from '@/components/Message';
import ToolVisualization from '@/components/ToolVisualization/ToolVisualization';
import { TimelineItemType } from '../../../types/timeline';
import { useTimelineContext } from '../../context/TimelineContext';
import { useToolVisualization } from '../../hooks/useToolVisualization';

export interface MessageFeedProps {
  sessionId: string | null;
  className?: string;
  autoScroll?: boolean;
  enableAnsiColors?: boolean;
  ariaLabelledBy?: string;
  isDarkTheme?: boolean;
  onNewSession?: () => void;
  showNewSessionMessage?: boolean;
}

export function MessageFeed({
  sessionId,
  className,
  autoScroll = true,
  enableAnsiColors = true,
  ariaLabelledBy,
  isDarkTheme = false,
  onNewSession,
  showNewSessionMessage = false
}: MessageFeedProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Use the timeline context to access timeline data
  const { timeline, isLoading, error } = useTimelineContext();
  
  // Use the tool visualization hook for view mode management
  const { setToolViewMode, defaultViewMode } = useToolVisualization();
  
  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      // Check if scrollIntoView is available (for JSDOM in tests)
      if (typeof messagesEndRef.current.scrollIntoView === 'function') {
        // Use 'auto' instead of 'smooth' for a snappier response
        messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
      }
    }
  }, [timeline?.length, autoScroll]);

  // Render timeline items
  const renderTimelineItems = () => {
    if (isLoading && (!timeline || timeline.length === 0)) {
      return (
        <div 
          className="flex-1 flex items-center justify-center text-gray-500 min-h-[200px]"
          role="status"
          aria-live="polite"
        >
          <p>Loading timeline...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div 
          className="flex-1 flex items-center justify-center text-red-500 min-h-[200px]"
          role="status"
          aria-live="polite"
        >
          <p>Error loading timeline: {error.message}</p>
        </div>
      );
    }

    if (!timeline || timeline.length === 0) {
      return (
        <div 
          className="flex-1 flex items-center justify-center text-gray-500 min-h-[200px]"
          role="status"
          aria-live="polite"
        >
          <p>No messages yet</p>
        </div>
      );
    }

    // Render each timeline item
    return timeline.map(item => {
      if (item.type === TimelineItemType.MESSAGE) {
        // Convert the stored message to the format expected by Message component
        const message = {
          id: item.message.id,
          type: item.message.role as 'user' | 'assistant' | 'system' | 'error',
          content: item.message.content,
          timestamp: new Date(item.timestamp).getTime()
        };

        return (
          <div
            key={`message-${item.id}`}
            className={cn(
              message.type === 'user' && 'self-end max-w-[80%]',
              message.type === 'assistant' && 'self-start max-w-[80%]',
              (message.type === 'system' || message.type === 'error') && 'self-center max-w-full'
            )}
            data-testid={`message-${message.id}`}
            role="listitem"
            aria-label={`${message.type} message`}
          >
            <Message
              content={message.content}
              type={message.type}
              timestamp={message.timestamp}
              enableAnsiColors={enableAnsiColors && message.type === 'assistant'}
              ariaLabel={`${message.type} message content`}
            />
          </div>
        );
      } else if (item.type === TimelineItemType.TOOL_EXECUTION) {
        // Convert the stored tool execution to the format expected by ToolVisualization
        const toolExecution = {
          id: item.id,
          tool: item.toolExecution.toolId,
          toolName: item.toolExecution.toolName,
          status: item.toolExecution.status,
          args: item.toolExecution.args,
          startTime: new Date(item.toolExecution.startTime).getTime(),
          endTime: item.toolExecution.endTime ? new Date(item.toolExecution.endTime).getTime() : undefined,
          executionTime: item.toolExecution.executionTime,
          result: item.toolExecution.result,
          error: item.toolExecution.error,
          permissionId: item.toolExecution.permissionId,
          preview: item.preview ? {
            contentType: item.preview.contentType,
            briefContent: item.preview.briefContent,
            fullContent: item.preview.fullContent,
            metadata: item.preview.metadata
          } : undefined,
          // Add the missing viewMode property
          viewMode: defaultViewMode
        };

        return (
          <div
            key={`tool-${item.id}`}
            className="w-4/5 self-start mt-2 mb-2 ml-2"
            data-testid={`tool-${toolExecution.id}`}
            role="listitem"
            aria-label={`Tool execution: ${toolExecution.toolName || toolExecution.id}`}
          >
            <ToolVisualization
              tool={toolExecution}
              showExecutionTime={true}
              compact={true}
              className="mx-0"
              isDarkTheme={isDarkTheme}
              defaultViewMode={defaultViewMode}
              onViewModeChange={setToolViewMode}
            />
          </div>
        );
      }

      return null;
    });
  };

  return (
    <div 
      className={cn(
        'flex flex-col flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-2',
        'min-h-[300px]', // Add minimum height to prevent layout shifts
        'max-h-[70vh]', // Add maximum height to constrain growth
        'h-full flex-grow', // Fill available space
        className
      )}
      data-testid="message-feed"
      aria-labelledby={ariaLabelledBy}
      role="list"
    >
      {renderTimelineItems()}
      
      {/* New session message at the bottom */}
      {showNewSessionMessage && onNewSession && (
        <div 
          className="self-center w-full my-3 bg-gray-800/40 rounded-md px-4 py-3 border border-gray-700/30 text-sm text-center"
          role="status"
          aria-live="polite"
          data-testid="new-session-hint"
        >
          <div className="flex flex-col gap-2 items-center">
            <div>
              <button 
                onClick={onNewSession}
                className="text-blue-400 hover:text-blue-300 transition-colors cursor-pointer inline-flex items-center"
              >
                <span className="mr-1">+</span> Start a new session
              </button>
              <span className="ml-2 text-gray-500 text-xs">
                (or press {navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? 'Cmd' : 'Ctrl'}+.)
              </span>
            </div>
            <div className="text-gray-400 text-sm">
              <span>Or just type a message to continue this session</span>
            </div>
          </div>
        </div>
      )}
      
      <div ref={messagesEndRef} />
    </div>
  );
}

export default MessageFeed;