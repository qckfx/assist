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

    // Keep track of tool executions we've rendered
    const renderedToolExecutions = new Set<string>();
    
    // Map of tool execution IDs to their parent message IDs
    const toolToParentMap = new Map<string, string>();
    
    // First identify all tool executions
    timeline.forEach(item => {
      if (item.type === TimelineItemType.TOOL_EXECUTION) {
        renderedToolExecutions.add(item.id);
        
        // Store parent message ID if available
        if (item.parentMessageId) {
          toolToParentMap.set(item.id, item.parentMessageId);
        }
      }
    });

    // Then look at messages to see if they reference tool executions
    // and establish parent-child relationships
    timeline.forEach(item => {
      if (item.type === TimelineItemType.MESSAGE && item.message.toolCalls?.length) {
        // Establish parent-child relationships for all tool calls
        item.message.toolCalls.forEach(call => {
          if (renderedToolExecutions.has(call.executionId)) {
            // Store the parent-child relationship
            toolToParentMap.set(call.executionId, item.id);
          }
        });
      }
    });
    
    // Render each timeline item
    return timeline.map(item => {
      if (item.type === TimelineItemType.MESSAGE) {
        // We should always render user messages, regardless of tool calls
        // For AI messages, we can apply the logic to hide empty ones that only have tool calls
        
        // First determine if the message has tool calls
        const hasToolCalls = item.message.toolCalls && item.message.toolCalls.length > 0;
        
        // If there are no tool calls, or the message has actual content, we should always render it
        const hasContent = Array.isArray(item.message.content) && item.message.content.length > 0;
        
        if (item.message.role === 'user') {
          // Always render user messages
        }
        // If the message has content, we should always render it regardless of tools
        else if (hasContent) {
          // Render messages with content
        }
        // If there are no tool calls, we should render it (unless it has no content)
        else if (!hasToolCalls) {
          // Render messages without tool calls
        }
        // If we get here, message is AI message with tool calls but no content
        // Check if ALL tool calls have corresponding tool executions that will be rendered
        else if (item.message.toolCalls) {
          const allToolsRendered = item.message.toolCalls.every(call => {
            return renderedToolExecutions.has(call.executionId);
          });
          
          if (allToolsRendered) {
            return null;
          }
        }
        
        // Convert the stored message to the format expected by Message component
        // Safely handle the timestamp conversion
        let timestamp: number;
        try {
          timestamp = new Date(item.timestamp).getTime();
          // Check if the timestamp is valid
          if (isNaN(timestamp)) {
            timestamp = Date.now(); // Use current time as fallback
          }
        } catch (e) {
          timestamp = Date.now(); // Use current time as fallback
        }
        
        const message = {
          id: item.message.id,
          type: item.message.role as 'user' | 'assistant' | 'system' | 'error',
          content: item.message.content,
          timestamp: timestamp
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
          // Use preview from the timeline item if available
          preview: item.preview ? {
            contentType: item.preview.contentType,
            briefContent: item.preview.briefContent,
            fullContent: item.preview.fullContent,
            metadata: item.preview.metadata
          } : undefined,
          // Add the explicit hasPreview flag
          hasPreview: !!item.preview,
          // Add the missing viewMode property 
          viewMode: defaultViewMode
        };

        // Check if this tool has a parent message for proper positioning
        const parentMessageId = toolToParentMap.get(item.id);
        
        // Assign CSS class based on parent message relationship
        // This is critical for proper positioning of tools relative to messages
        const toolClasses = parentMessageId 
          ? "w-4/5 self-start mt-2 mb-4 ml-8" // Indent for tools with parent message
          : "w-4/5 self-start mt-2 mb-4 ml-2"; // Default positioning

        return (
          <div
            key={`tool-${item.id}`}
            className={toolClasses}
            data-testid={`tool-${toolExecution.id}`}
            data-parent-message={parentMessageId || "none"}
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