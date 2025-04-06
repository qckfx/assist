/**
 * Hook for fetching and handling unified timeline data
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { WebSocketEvent, WebSocketEventMap } from '../types/api';
import { TimelineItem, TimelineItemType, TimelineResponse } from '../../types/timeline';
import { useTerminalWebSocket } from './useTerminalWebSocket';
import { useWebSocket } from './useWebSocket';
import apiClient from '../services/apiClient';

interface TimelineState {
  items: TimelineItem[];
  isLoading: boolean;
  error: Error | null;
  nextPageToken?: string;
  totalCount: number;
}

interface TimelineOptions {
  limit?: number;
  types?: TimelineItemType[];
  includeRelated?: boolean;
}

export const useTimeline = (sessionId: string | null, options: TimelineOptions = {}) => {
  const { limit = 50, types, includeRelated = true } = options;
  const [state, setState] = useState<TimelineState>({
    items: [],
    isLoading: false,
    error: null,
    totalCount: 0
  });
  
  // Use useWebSocket to get the subscribe function for WebSocket events
  const { subscribe } = useWebSocket();
  const { isConnected } = useTerminalWebSocket();
  const timelineInitializedRef = useRef(false);
  
  // Fetch timeline from API
  const fetchTimeline = useCallback(async (pageToken?: string) => {
    if (!sessionId) {
      console.warn('fetchTimeline called without sessionId');
      return;
    }
    
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      // Log fetchTimeline call for debugging
      console.log(`Fetching timeline for session ${sessionId}`);
      
      const queryParams = new URLSearchParams();
      if (limit) queryParams.append('limit', limit.toString());
      if (pageToken) queryParams.append('pageToken', pageToken);
      if (types && types.length > 0) {
        types.forEach(type => queryParams.append('types[]', type));
      }
      queryParams.append('includeRelated', includeRelated.toString());
      
      // Use the apiClient directly
      const response = await apiClient.fetchTimeline<TimelineResponse>(
        sessionId, 
        queryParams.toString()
      );
      
      // Log the timeline response for debugging
      console.log(`Timeline response for ${sessionId}:`, {
        success: response.success,
        itemCount: response.data?.items?.length || 0,
        hasData: !!response.data
      });
      
      if (response.success && response.data) {
        const responseData = response.data;
        
        // Log the timeline items for debugging
        console.log(`Timeline items for ${sessionId}:`, {
          count: responseData.items.length,
          types: responseData.items.map(item => item.type),
          messageCount: responseData.items.filter(item => item.type === 'message').length,
          toolCount: responseData.items.filter(item => item.type === 'tool_execution').length
        });
        
        if (pageToken) {
          // Append items for pagination
          setState(prev => ({
            ...prev,
            items: [...prev.items, ...responseData.items],
            isLoading: false,
            nextPageToken: responseData.nextPageToken,
            totalCount: responseData.totalCount
          }));
        } else {
          // Replace items for initial load
          setState({
            items: responseData.items,
            isLoading: false,
            error: null,
            nextPageToken: responseData.nextPageToken,
            totalCount: responseData.totalCount
          });
        }
        
        timelineInitializedRef.current = true;
      } else {
        console.error(`Failed to fetch timeline for ${sessionId}:`, response.error);
        throw new Error(
          typeof response.error === 'string' 
            ? response.error 
            : 'Failed to fetch timeline'
        );
      }
    } catch (error) {
      console.error(`Error fetching timeline for ${sessionId}:`, error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Failed to fetch timeline')
      }));
    }
  }, [sessionId, limit, types, includeRelated]);
  
  // Load more items (pagination)
  const loadMore = useCallback(() => {
    if (state.nextPageToken) {
      fetchTimeline(state.nextPageToken);
    }
  }, [state.nextPageToken, fetchTimeline]);
  
  // Initial load
  useEffect(() => {
    if (sessionId) {
      // Log initialization of timeline
      console.log(`Initializing timeline for session ${sessionId}`);
      
      // Force timeline initialization on session ID change or mount
      timelineInitializedRef.current = false;
      
      // Always fetch timeline on session ID change or mount
      fetchTimeline();
      
      // Update initialization flag after fetch is triggered
      timelineInitializedRef.current = true;
    }
    
    return () => {
      timelineInitializedRef.current = false;
    };
  }, [sessionId, fetchTimeline]);
  
  // Add state for local items cache
  const [localItems, setLocalItems] = useState<TimelineItem[]>([]);

  // Listen for WebSocket updates
  useEffect(() => {
    if (!sessionId || !isConnected) {
      console.log(`Not setting up WebSocket listeners because ${!sessionId ? 'no sessionId' : 'not connected'}`);
      return;
    }
    
    console.log(`Setting up WebSocket message listeners for session ${sessionId}`);
    
    // Function to handle timeline item received or updated
    const handleTimelineItem = (data: any, isUpdate: boolean) => {
      if (data.sessionId !== sessionId) {
        console.log(`Ignoring event for different session: ${data.sessionId} (current: ${sessionId})`);
        return;
      }
      
      console.log(`Received ${isUpdate ? 'update for' : 'new'} timeline item:`, {
        sessionId: data.sessionId,
        hasMessage: 'message' in data,
        hasTool: 'toolExecution' in data,
        messageType: data.message?.role
      });
      
      // Create a timeline item from the data
      let timelineItem: TimelineItem | null = null;
      
      if ('message' in data) {
        // It's a message event
        console.log('Processing message event:', {
          id: data.message.id,
          role: data.message.role,
          content: data.message.content,
          timestamp: data.message.timestamp
        });
        
        // Ensure message has a stable ID
        const messageId = data.message.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // For user messages, check if we already have this message by content
        if (data.message.role === 'user') {
          const contentHash = JSON.stringify(data.message.content);
          const existingUserMessage = localItems.find(item => 
            item.type === TimelineItemType.MESSAGE && 
            item.message.role === 'user' &&
            JSON.stringify(item.message.content) === contentHash
          );
          
          if (existingUserMessage) {
            console.log('Found existing user message with same content, updating with server ID');
            // Update the existing message with the server-provided ID
            timelineItem = {
              ...existingUserMessage,
              id: messageId,
              message: {
                ...existingUserMessage.message,
                id: messageId,
                confirmationStatus: 'confirmed' // Mark as confirmed by server
              }
            };
          } else {
            // New user message
            console.log(`Creating new USER timeline item with ID ${messageId}`);
            timelineItem = {
              id: messageId,
              type: TimelineItemType.MESSAGE,
              sessionId: data.sessionId,
              timestamp: data.message.timestamp || new Date().toISOString(),
              message: {
                ...data.message,
                confirmationStatus: 'confirmed' // Mark as confirmed by server
              }
            };
          }
        } else {
          // Assistant message or other type
          console.log(`Creating new ASSISTANT timeline item with ID ${messageId}`);
          timelineItem = {
            id: messageId,
            type: TimelineItemType.MESSAGE,
            sessionId: data.sessionId,
            timestamp: data.message.timestamp || new Date().toISOString(),
            message: data.message
          };
        }
      } else if ('toolExecution' in data) {
        // It's a tool execution event or update
        console.log('Processing tool execution event:', data.toolExecution);
        
        // Check if this is an update to an existing tool
        const existingTool = localItems.find(
          item => item.type === TimelineItemType.TOOL_EXECUTION && item.id === data.toolExecution.id
        );
        
        if (existingTool && existingTool.type === TimelineItemType.TOOL_EXECUTION && isUpdate) {
          // Create a merged toolExecution object with updated properties
          const updatedToolExecution = {
            ...existingTool.toolExecution,
            ...data.toolExecution
          };
          
          // Create the updated timeline item
          timelineItem = {
            ...existingTool,
            toolExecution: updatedToolExecution
            // Let toolExecution object contain the preview, don't store at top level
          };
          
          // Log the timeline item after update
          console.log('Timeline item after update:', {
            id: timelineItem.id,
            toolId: timelineItem.toolExecution.toolId,
            previewInToolExecution: !!timelineItem.toolExecution.preview,
            previewDetails: timelineItem.toolExecution.preview ? {
              contentType: timelineItem.toolExecution.preview.contentType,
              hasBriefContent: !!timelineItem.toolExecution.preview.briefContent,
              briefContentLength: timelineItem.toolExecution.preview.briefContent?.length || 0,
              hasActualContent: timelineItem.toolExecution.preview.hasActualContent === true
            } : null
          });
        } else {
          // New tool execution
          timelineItem = {
            id: data.toolExecution.id || `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: TimelineItemType.TOOL_EXECUTION,
            sessionId: data.sessionId, 
            timestamp: data.toolExecution.startTime || new Date().toISOString(),
            toolExecution: data.toolExecution
            // Let toolExecution object contain the preview, don't store at top level
          };
        }
      } else if ('messageId' in data) {
        // It's a message update
        console.log('Processing message update:', data);
        // Find existing message in local items
        const existingMessage = localItems.find(
          item => item.type === TimelineItemType.MESSAGE && item.id === data.messageId
        );
        
        if (existingMessage && existingMessage.type === TimelineItemType.MESSAGE) {
          timelineItem = {
            ...existingMessage,
            message: {
              ...existingMessage.message,
              content: data.content
            }
          };
        } else {
          console.warn('Message update received but no matching message found:', data.messageId);
        }
      } else {
        console.warn('Unrecognized timeline event format:', data);
      }
      
      if (!timelineItem) return;
      
      console.log('Created timeline item:', timelineItem);
      
      setLocalItems(prev => {
        // Generate a unique item ID if it doesn't exist
        if (!timelineItem!.id) {
          timelineItem!.id = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        
        // Check if we already have this item by role and content for messages
        let existingIndex = -1;
        
        if (timelineItem!.type === TimelineItemType.MESSAGE) {
          // For messages, check if we have a message with the same role and similar content
          // This helps avoid duplicates when the server doesn't provide stable IDs
          const messageRole = timelineItem!.message.role;
          existingIndex = prev.findIndex(item => {
            if (item.type !== TimelineItemType.MESSAGE) return false;
            if (item.message.role !== messageRole) return false;
            return JSON.stringify(item.message.content) === JSON.stringify(timelineItem!.message.content);
          });
        } else {
          // For other items use the ID
          existingIndex = prev.findIndex(item => item.id === timelineItem!.id);
        }
        
        console.log('Updating local items:', {
          currentLocalItems: prev.length,
          existingIndex,
          isUpdate,
          itemType: timelineItem!.type,
          itemId: timelineItem!.id,
          messageRole: timelineItem!.type === TimelineItemType.MESSAGE ? timelineItem!.message.role : undefined
        });
        
        let newItems;
        if (existingIndex >= 0 && isUpdate) {
          // Replace existing item for updates
          newItems = [...prev];
          newItems[existingIndex] = timelineItem!;
          console.log('Updated existing item at index', existingIndex);
          return newItems;
        } else if (existingIndex >= 0) {
          // We found an existing item with same content
          console.log('Found existing item with same content - updating anyway for safety');
          // Always update to ensure we have the latest data
          newItems = [...prev];
          newItems[existingIndex] = timelineItem!;
          return newItems;
        } else {
          // Add new item
          newItems = [...prev, timelineItem!];
          console.log('Added new item, new count:', newItems.length);
          console.log('New item details:', {
            id: timelineItem!.id,
            type: timelineItem!.type,
            timestamp: timelineItem!.timestamp,
            role: timelineItem!.type === TimelineItemType.MESSAGE ? timelineItem!.message.role : undefined
          });
          return newItems;
        }
      });
    };
    
    // Subscribe to message events
    const unsubscribeMessageReceived = subscribe(WebSocketEvent.MESSAGE_RECEIVED, 
      data => handleTimelineItem(data, false));
    
    const unsubscribeMessageUpdated = subscribe(WebSocketEvent.MESSAGE_UPDATED, 
      data => handleTimelineItem(data, true));
    
    // Subscribe to tool execution events
    const unsubscribeToolReceived = subscribe(WebSocketEvent.TOOL_EXECUTION_RECEIVED,
      data => {
        // Log the raw data from WebSocket
        console.log('TOOL_EXECUTION_RECEIVED raw data:', {
          hasToolExecution: !!data.toolExecution,
          hasPreview: !!data.toolExecution.preview,
          hasPreviewFlag: data.toolExecution.hasPreview === true,
          previewContentType: data.toolExecution.previewContentType,
          fullData: JSON.parse(JSON.stringify(data)) // Deep copy for logging
        });
        handleTimelineItem(data, false);
      });
    
    const unsubscribeToolUpdated = subscribe(WebSocketEvent.TOOL_EXECUTION_UPDATED,
      data => {
        // Log the raw data from WebSocket
        console.log('TOOL_EXECUTION_UPDATED raw data:', {
          hasToolExecution: !!data.toolExecution,
          hasPreview: !!data.toolExecution.preview,
          hasPreviewFlag: data.toolExecution.hasPreview === true,
          previewContentType: data.toolExecution.previewContentType,
          previewDetails: data.toolExecution.preview ? {
            contentType: data.toolExecution.preview.contentType,
            hasBriefContent: !!data.toolExecution.preview.briefContent,
            briefContentLength: data.toolExecution.preview.briefContent?.length || 0,
            hasFullContent: !!data.toolExecution.preview.fullContent,
            hasActualContent: data.toolExecution.preview.hasActualContent === true
          } : null,
          fullData: JSON.parse(JSON.stringify(data)) // Deep copy for logging
        });
        handleTimelineItem(data, true);
      });
    
    // Handle session load/reload by refreshing from server
    const unsubscribeSessionLoaded = subscribe(WebSocketEvent.SESSION_LOADED, (data: { sessionId: string }) => {
      if (data.sessionId === sessionId) {
        console.log('SESSION_LOADED - refreshing timeline data from server');
        // Only clear pending local items, not confirmed ones
        setLocalItems(prevItems => 
          prevItems.filter(item => 
            item.type !== TimelineItemType.MESSAGE || 
            (item.message && item.message.confirmationStatus === 'confirmed')
          )
        );
        timelineInitializedRef.current = false;
        fetchTimeline();
      }
    });
    
    // We're planning to remove session state reliance soon
    
    return () => {
      unsubscribeMessageReceived();
      unsubscribeMessageUpdated();
      unsubscribeToolReceived();
      unsubscribeToolUpdated();
      unsubscribeSessionLoaded();
    };
  }, [sessionId, isConnected, subscribe, fetchTimeline]);
  
  // Force reload the timeline
  const reload = useCallback(() => {
    fetchTimeline();
  }, [fetchTimeline]);
  
  // Combine server state with local state
  const combinedTimeline = useMemo(() => {
    console.log('Combining timeline state:', {
      serverItems: state.items.length,
      localItems: localItems.length
    });
    
    // Create a map to deduplicate items by ID
    const itemMap = new Map<string, TimelineItem>();
    
    // Track message IDs from server to avoid showing pending duplicates
    const serverMessageIds = new Set<string>();
    
    // Add server items first (they are the source of truth)
    state.items.forEach(item => {
      itemMap.set(item.id, item);
      if (item.type === TimelineItemType.MESSAGE) {
        // Track that this message came from the server
        serverMessageIds.add(item.id);
        
        // Also track content hash for user messages to detect duplicates
        if (item.message.role === 'user') {
          const contentHash = JSON.stringify(item.message.content);
          serverMessageIds.add(`content:${contentHash}`);
        }
      }
    });
    
    // Add local items
    localItems.forEach(item => {
      // For messages, prioritize local items over server items, since they might contain
      // more recent content from WebSocket updates that haven't been saved to the server yet
      itemMap.set(item.id, item);
    });
    
    // Log the items in the map
    console.log('Timeline items after merging:', Array.from(itemMap.entries()).map(
      ([id, item]) => ({ id, type: item.type, role: item.type === TimelineItemType.MESSAGE ? item.message.role : undefined })
    ));
    
    // Convert back to array and sort by timestamp
    const sortedTimeline = Array.from(itemMap.values()).sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      
      if (dateA === dateB) {
        // If timestamps are the same, prioritize messages over tool executions
        if (a.type === TimelineItemType.MESSAGE && b.type !== TimelineItemType.MESSAGE) {
          return -1;
        }
        if (a.type !== TimelineItemType.MESSAGE && b.type === TimelineItemType.MESSAGE) {
          return 1;
        }
        
        // If both are messages with same timestamp, put user before assistant
        if (a.type === TimelineItemType.MESSAGE && b.type === TimelineItemType.MESSAGE) {
          if (a.message.role === 'user' && b.message.role !== 'user') {
            return -1;
          }
          if (a.message.role !== 'user' && b.message.role === 'user') {
            return 1;
          }
        }
      }
      
      return dateA - dateB;
    });
    
    console.log('Final sorted timeline:', 
      sortedTimeline.map(item => ({
        id: item.id,
        type: item.type,
        timestamp: item.timestamp,
        role: item.type === TimelineItemType.MESSAGE ? item.message.role : undefined
      }))
    );
    
    return sortedTimeline;
  }, [state.items, localItems]);
  
  return {
    timeline: combinedTimeline,
    isLoading: state.isLoading,
    error: state.error,
    hasMore: !!state.nextPageToken,
    totalCount: combinedTimeline.length,
    loadMore,
    reload
  };
};