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
    // More detailed debug logs to troubleshoot rendering issues
    console.log("Rendering timeline items:", {
      sessionId,
      isLoading,
      hasError: !!error,
      timelineLength: timeline?.length || 0,
      timelineItems: timeline?.map(item => ({
        id: item.id,
        type: item.type,
        messageType: item.type === TimelineItemType.MESSAGE ? item.message.role : null
      }))
    });
    
    // Log the FULL timeline data for deep inspection
    console.group("FULL TIMELINE DATA");
    if (timeline?.length) {
      const userMessages = timeline.filter(item => 
        item.type === TimelineItemType.MESSAGE && item.message.role === 'user'
      );
      const assistantMessages = timeline.filter(item => 
        item.type === TimelineItemType.MESSAGE && item.message.role === 'assistant'
      );
      const toolExecutions = timeline.filter(item => 
        item.type === TimelineItemType.TOOL_EXECUTION
      );
      
      console.log(`Timeline contains: ${userMessages.length} user messages, ${assistantMessages.length} assistant messages, ${toolExecutions.length} tool executions`);
      
      if (userMessages.length === 0) {
        console.warn("!!! WARNING: No user messages found in timeline !!!");
      }
      
      // Complete timeline dump
      console.log("Complete timeline:", JSON.stringify(timeline, null, 2));
    } else {
      console.log("Timeline is empty");
    }
    console.groupEnd();
    
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
    
    // First pass to collect all tool executions and establish parent-child relationships
    console.log("=== TOOL EXECUTION COLLECTION AND RELATIONSHIP PHASE ===");
    
    // Create a set of all tool execution IDs in the timeline
    const allToolExecutionIds = new Set<string>();
    
    // Map of tool execution IDs to their parent message IDs
    const toolToParentMap = new Map<string, string>();
    
    // Map of messages to their related tool executions
    const messageToToolsMap = new Map<string, string[]>();
    
    // First identify all tool executions
    timeline.forEach(item => {
      if (item.type === TimelineItemType.TOOL_EXECUTION) {
        renderedToolExecutions.add(item.id);
        allToolExecutionIds.add(item.id);
        console.log(`Found tool execution in timeline: ${item.id}`);
        
        // Store parent message ID if available
        if (item.parentMessageId) {
          toolToParentMap.set(item.id, item.parentMessageId);
          
          // Also add to the message's list of tools
          const toolsList = messageToToolsMap.get(item.parentMessageId) || [];
          toolsList.push(item.id);
          messageToToolsMap.set(item.parentMessageId, toolsList);
        }
      }
    });

    // Then look at messages to see if they reference tool executions
    // and establish parent-child relationships
    console.log("=== MESSAGE TOOL CALLS VERIFICATION ===");
    timeline.forEach(item => {
      if (item.type === TimelineItemType.MESSAGE && item.message.toolCalls?.length) {
        console.log(`Message ${item.id} has tool calls:`, {
          role: item.message.role,
          toolCallCount: item.message.toolCalls.length,
          toolCalls: item.message.toolCalls.map(call => ({
            executionId: call.executionId,
            toolName: call.toolName,
            existsInTimeline: allToolExecutionIds.has(call.executionId),
            addedToRenderedSet: renderedToolExecutions.has(call.executionId)
          }))
        });
        
        // Initialize this message's tool list if needed
        if (!messageToToolsMap.has(item.id)) {
          messageToToolsMap.set(item.id, []);
        }
        
        // Establish parent-child relationships for all tool calls
        item.message.toolCalls.forEach(call => {
          if (allToolExecutionIds.has(call.executionId)) {
            // Store the parent-child relationship
            toolToParentMap.set(call.executionId, item.id);
            
            // Add to this message's list of tools
            const toolsList = messageToToolsMap.get(item.id) || [];
            toolsList.push(call.executionId);
            messageToToolsMap.set(item.id, toolsList);
          }
        });
      }
    });
    
    // Group timeline items by conversation turn to ensure proper ordering
    // A conversation turn consists of: user message -> tool executions -> assistant response
    
    // First, identify all messages and their roles
    const userMessages = timeline.filter(item => 
      item.type === TimelineItemType.MESSAGE && item.message.role === 'user'
    );
    const assistantMessages = timeline.filter(item => 
      item.type === TimelineItemType.MESSAGE && item.message.role === 'assistant'
    );
    
    // Create a mapping of tool executions to their parent messages
    userMessages.forEach(userMsg => {
      if (userMsg.message.toolCalls?.length) {
        userMsg.message.toolCalls.forEach(call => {
          if (call.executionId) {
            toolToParentMap.set(call.executionId, userMsg.id);
          }
        });
      }
    });
    
    assistantMessages.forEach(aiMsg => {
      if (aiMsg.message.toolCalls?.length) {
        aiMsg.message.toolCalls.forEach(call => {
          if (call.executionId) {
            toolToParentMap.set(call.executionId, aiMsg.id);
          }
        });
      }
    });
    
    // Force showing ALL user messages by marking them as having content
    userMessages.forEach(userMsg => {
      userMsg._forceShow = true;
    });
    
    // We'll create a flat array of timeline items in order
    const orderedTimelineItems: typeof timeline = [];
    
    // CRITICAL: Create ordered groups of items based on timestamps
    // This ensures PROPER ordering of conversation turns
    const timeGroups: Array<typeof timeline> = [];
    
    // Sort all timeline items by timestamp first
    const timelineSortedByTime = [...timeline].sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
    
    // Group items that are close in time (likely part of same conversation turn)
    let currentGroup: typeof timeline = [];
    let lastTimestamp = 0;
    
    timelineSortedByTime.forEach(item => {
      const itemTime = new Date(item.timestamp).getTime();
      
      // If this item is far from the last one, start a new group
      if (lastTimestamp > 0 && (itemTime - lastTimestamp) > 5000) { // 5 second gap
        if (currentGroup.length > 0) {
          timeGroups.push(currentGroup);
          currentGroup = [];
        }
      }
      
      currentGroup.push(item);
      lastTimestamp = itemTime;
    });
    
    // Don't forget the last group
    if (currentGroup.length > 0) {
      timeGroups.push(currentGroup);
    }
    
    // Within each time group, order as: user message -> tools -> assistant message
    timeGroups.forEach(group => {
      // First sort within the group
      group.sort((a, b) => {
        // User messages come first 
        if (a.type === TimelineItemType.MESSAGE && a.message.role === 'user') {
          return -1;
        }
        if (b.type === TimelineItemType.MESSAGE && b.message.role === 'user') {
          return 1;
        }
        
        // Tool executions come next, sorted by timestamps
        if (a.type === TimelineItemType.TOOL_EXECUTION && b.type === TimelineItemType.TOOL_EXECUTION) {
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        }
        
        // Assistant messages come last
        if (a.type === TimelineItemType.MESSAGE && a.message.role === 'assistant') {
          return 1;
        }
        if (b.type === TimelineItemType.MESSAGE && b.message.role === 'assistant') {
          return -1;
        }
        
        // Default to timestamp order
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });
      
      // Add the sorted group to our final ordered timeline
      orderedTimelineItems.push(...group);
    });
    
    // Replace the original timeline with our ordered version
    timeline.length = 0;
    
    // Apply deduplication for user messages before rendering
    // This handles the case where we have both optimistic client message and confirmed server message
    const dedupedItems: typeof orderedTimelineItems = [];
    const userMessageContents = new Map<string, boolean>();
    
    // First pass: collect user message content signatures for deduplication
    for (const item of orderedTimelineItems) {
      if (item.type === TimelineItemType.MESSAGE && item.message.role === 'user') {
        try {
          // Create a content signature for this message (content + approximate time)
          const contentSignature = JSON.stringify(item.message.content) + 
                                  // Round to nearest 5 seconds to allow for slight time differences
                                  Math.floor(new Date(item.timestamp).getTime() / 5000);
          
          // If we've already seen this content, mark it
          if (userMessageContents.has(contentSignature)) {
            console.log(`Found duplicate user message with content signature: ${contentSignature.substring(0, 40)}...`);
            // Skip this iteration, we'll handle in second pass
          } else {
            // First time seeing this content
            userMessageContents.set(contentSignature, true);
          }
        } catch (e) {
          // If stringify fails, just add the item as-is
          console.warn('Error creating content signature:', e);
        }
      }
    }
    
    // Second pass: only add non-duplicate messages to the final timeline
    for (const item of orderedTimelineItems) {
      if (item.type === TimelineItemType.MESSAGE && item.message.role === 'user') {
        try {
          // Create content signature again
          const contentSignature = JSON.stringify(item.message.content) + 
                                  Math.floor(new Date(item.timestamp).getTime() / 5000);
          
          // Check if we've already added a message with this content
          if (userMessageContents.has(contentSignature)) {
            // Add this item and remove from map so subsequent duplicates are ignored
            dedupedItems.push(item);
            userMessageContents.delete(contentSignature);
          }
        } catch (e) {
          // If stringify fails, just add the item as-is
          dedupedItems.push(item);
        }
      } else {
        // Non-user message, add without deduplication
        dedupedItems.push(item);
      }
    }
    
    // Use the deduplicated items
    timeline.push(...dedupedItems);
    
    // Render each timeline item
    return timeline.map(item => {
      if (item.type === TimelineItemType.MESSAGE) {
        // We should always render user messages, regardless of tool calls
        // For AI messages, we can apply the logic to hide empty ones that only have tool calls
        
        console.log(`=== MESSAGE RENDER DECISION FOR ${item.id} ===`);
        
        // First determine if the message has tool calls
        const hasToolCalls = item.message.toolCalls && item.message.toolCalls.length > 0;
        
        // If there are no tool calls, or the message has actual content, we should always render it
        const hasContent = Array.isArray(item.message.content) && item.message.content.length > 0;
        
        console.log(`Message ${item.id} rendering check:`, {
          role: item.message.role,
          hasToolCalls,
          hasContent,
          toolCallsCount: hasToolCalls ? item.message.toolCalls.length : 0,
          contentCount: hasContent ? item.message.content.length : 0
        });
        
        if (item.message.role === 'user') {
          console.log(`Message ${item.id} is USER message, always RENDERING`);
        }
        // If the message has content, we should always render it regardless of tools
        else if (hasContent) {
          console.log(`Message ${item.id} has content, RENDERING`);
        }
        // If there are no tool calls, we should render it (unless it has no content)
        else if (!hasToolCalls) {
          console.log(`Message ${item.id} has no tool calls, RENDERING (empty message)`);
        }
        // If we get here, message is AI message with tool calls but no content
        // Check if ALL tool calls have corresponding tool executions that will be rendered
        else {
          const allToolsRendered = item.message.toolCalls.every(call => {
            const toolInRenderedSet = renderedToolExecutions.has(call.executionId);
            console.log(`Tool call ${call.executionId} in message ${item.id}: in rendered set = ${toolInRenderedSet}`);
            return toolInRenderedSet;
          });
          
          if (allToolsRendered) {
            console.log(`Message ${item.id} SKIPPED - all tools rendered separately`);
            return null;
          } else {
            console.log(`Message ${item.id} RENDERED - some tools not found in timeline`);
          }
        }
        
        // Convert the stored message to the format expected by Message component
        // Safely handle the timestamp conversion
        let timestamp: number;
        try {
          timestamp = new Date(item.timestamp).getTime();
          // Check if the timestamp is valid
          if (isNaN(timestamp)) {
            console.warn(`Invalid timestamp in message ${item.id}: "${item.timestamp}"`);
            timestamp = Date.now(); // Use current time as fallback
          }
        } catch (e) {
          console.warn(`Error parsing timestamp in message ${item.id}: "${item.timestamp}"`, e);
          timestamp = Date.now(); // Use current time as fallback
        }
        
        const message = {
          id: item.message.id,
          type: item.message.role as 'user' | 'assistant' | 'system' | 'error',
          content: item.message.content,
          timestamp: timestamp
        };
        
        // Add debugging info for each message
        const timestampStr = typeof message.timestamp === 'number' ? 
          new Date(message.timestamp).toISOString() : 
          'Invalid timestamp';
        
        console.log(`Rendering message ${item.id}:`, {
          role: message.type,
          content: message.content,
          timestamp: timestampStr,
          hasToolCalls: !!item.message.toolCalls?.length,
          toolCallCount: item.message.toolCalls?.length || 0
        });

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
        // Log the timeline item to see what we're getting from the server
        console.log(`[DEBUG] MessageFeed timeline item for tool ${item.id}:`, {
          hasTopLevelPreview: !!item.preview,
          hasToolExecutionPreview: !!item.toolExecution.preview,
          hasPreviewFlag: item.toolExecution.hasPreview === true,
          previewDetails: item.preview ? {
            contentType: item.preview.contentType,
            hasBriefContent: !!item.preview.briefContent,
            briefContentLength: item.preview.briefContent?.length || 0,
          } : null,
          toolExecutionPreviewDetails: item.toolExecution.preview ? {
            contentType: item.toolExecution.preview.contentType,
            hasBriefContent: !!item.toolExecution.preview.briefContent,
            briefContentLength: item.toolExecution.preview.briefContent?.length || 0,
          } : null,
          itemProps: Object.keys(item),
          toolExecutionProps: Object.keys(item.toolExecution)
        });
        
        // Log the tool execution being rendered
        console.log(`=== RENDERING TOOL EXECUTION ${item.id} ===`);
        
        // Check if any message references this tool execution
        const referencingMessages = timeline
          .filter(t => t.type === TimelineItemType.MESSAGE)
          .filter(t => t.message.toolCalls?.some(call => call.executionId === item.id));
          
        console.log(`Tool execution ${item.id} is referenced by ${referencingMessages.length} messages:`, 
          referencingMessages.map(m => ({
            messageId: m.id,
            role: m.message.role,
            toolCalls: m.message.toolCalls?.map(call => call.executionId).join(', ')
          }))
        );
        
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
          // Use preview from the timeline item (if available) or from toolExecution
          preview: item.preview ? {
            contentType: item.preview.contentType,
            briefContent: item.preview.briefContent,
            fullContent: item.preview.fullContent,
            metadata: item.preview.metadata
          } : (item.toolExecution.preview ? {
            contentType: item.toolExecution.preview.contentType,
            briefContent: item.toolExecution.preview.briefContent,
            fullContent: item.toolExecution.preview.fullContent,
            metadata: item.toolExecution.preview.metadata
          } : undefined),
          // Add the explicit hasPreview flag
          hasPreview: item.toolExecution.hasPreview === true || !!item.preview,
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