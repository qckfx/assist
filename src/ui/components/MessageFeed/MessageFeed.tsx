import React, { useRef, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import Message from '@/components/Message';
import { TerminalMessage } from '@/types/terminal';
import { ToolExecution } from '@/hooks/useToolStream';
import ToolVisualization from '@/components/ToolVisualization/ToolVisualization';
import { PreviewMode } from '../../../types/preview';
import { TimelineItem, TimelineItemType } from '../../../types/timeline';
import { useTimeline } from '@/hooks/useTimeline';
import { ContentPart, TextContentPart } from '../../../types/message';

export interface MessageFeedProps {
  sessionId: string | null;
  messages: TerminalMessage[]; // For backwards compatibility 
  toolExecutions?: Record<string, ToolExecution>; // For backwards compatibility
  className?: string;
  autoScroll?: boolean;
  enableAnsiColors?: boolean;
  ariaLabelledBy?: string;
  showToolsInline?: boolean;
  isDarkTheme?: boolean;
  onToolViewModeChange?: (toolId: string, mode: PreviewMode) => void;
  defaultToolViewMode?: PreviewMode;
  onNewSession?: () => void;
  showNewSessionMessage?: boolean;
}

export function MessageFeed({
  sessionId,
  messages,
  toolExecutions = {},
  className,
  autoScroll = true,
  enableAnsiColors = true,
  ariaLabelledBy,
  showToolsInline = true,
  isDarkTheme = false,
  onToolViewModeChange,
  defaultToolViewMode,
  onNewSession,
  showNewSessionMessage = false
}: MessageFeedProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Get the unified timeline
  const {
    timeline,
    isLoading,
    error
  } = useTimeline(sessionId, {
    limit: 100,
    includeRelated: true
  });
  
  // Auto-scroll effect for new messages and new tool executions
  useEffect(() => {
    // Scroll on changes to message count or tool execution count or timeline length
    if (autoScroll && messagesEndRef.current) {
      // Check if scrollIntoView is available (for JSDOM in tests)
      if (typeof messagesEndRef.current.scrollIntoView === 'function') {
        // Use 'auto' instead of 'smooth' for a snappier response
        messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
      }
    }
  }, [
    messages.length, 
    Object.keys(toolExecutions).length, 
    timeline?.length,
    autoScroll
  ]);

  // Keep toolItems for backward compatibility with other components
  const { messageItems, toolItems } = useMemo(() => {
    return {
      messageItems: messages,
      toolItems: []
    };
  }, [messages]);

  // This is now removed as we only use the unified timeline

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
    return timeline.map((item: TimelineItem) => {
      if (item.type === TimelineItemType.MESSAGE) {
        // Convert the stored message to the terminal message format
        const message = {
          id: item.message.id,
          type: item.message.role as 'user' | 'assistant' | 'system' | 'error',
          content: item.message.content,
          timestamp: new Date(item.message.timestamp)
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
          id: item.toolExecution.id,
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
          } : undefined
        };

        return (
          <div
            key={`tool-${item.id}`}
            className="w-4/5 self-start mt-2 mb-2 ml-2" // Left-aligned, not centered
            data-testid={`tool-${toolExecution.id}`}
            role="listitem"
            aria-label={`Tool execution: ${toolExecution.toolName || toolExecution.id}`}
          >
            <ToolVisualization
              tool={toolExecution}
              showExecutionTime={true}
              compact={true} // Always use compact view
              className="mx-0" // Remove horizontal margin
              isDarkTheme={isDarkTheme} // Pass terminal theme
              defaultViewMode={defaultToolViewMode}
              onViewModeChange={onToolViewModeChange}
            />
          </div>
        );
      } else if (item.type === TimelineItemType.PERMISSION_REQUEST) {
        // For now, we don't render permission requests directly
        // They are shown as part of tool execution visualizations
        return null;
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