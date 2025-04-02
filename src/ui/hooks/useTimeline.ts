/**
 * Hook for fetching and handling unified timeline data
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { WebSocketEvent } from '../types/api';
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
    if (!sessionId) return;
    
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
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
      
      if (response.success && response.data) {
        const responseData = response.data;
        
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
        throw new Error(
          typeof response.error === 'string' 
            ? response.error 
            : 'Failed to fetch timeline'
        );
      }
    } catch (error) {
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
    if (sessionId && !timelineInitializedRef.current) {
      fetchTimeline();
    }
    
    return () => {
      timelineInitializedRef.current = false;
    };
  }, [sessionId, fetchTimeline]);
  
  // Add state for local items cache
  const [localItems, setLocalItems] = useState<TimelineItem[]>([]);

  // Listen for WebSocket updates
  useEffect(() => {
    if (!sessionId || !isConnected) return;
    
    // Function to handle timeline item received or updated
    const handleTimelineItem = (data: any, isUpdate: boolean) => {
      if (data.sessionId !== sessionId) return;
      
      // Create a timeline item from the data
      let timelineItem: TimelineItem | null = null;
      
      if ('message' in data) {
        // It's a message event
        timelineItem = {
          id: data.message.id,
          type: TimelineItemType.MESSAGE,
          sessionId: data.sessionId,
          timestamp: data.message.timestamp,
          message: data.message
        };
      } else if ('toolExecution' in data) {
        // It's a tool execution event
        timelineItem = {
          id: data.toolExecution.id,
          type: TimelineItemType.TOOL_EXECUTION,
          sessionId: data.sessionId, 
          timestamp: data.toolExecution.startTime,
          toolExecution: data.toolExecution
        };
      } else if ('executionId' in data) {
        // It's a tool execution update
        // Find existing tool in local items
        const existingTool = localItems.find(
          item => item.type === TimelineItemType.TOOL_EXECUTION && item.id === data.executionId
        );
        
        if (existingTool && existingTool.type === TimelineItemType.TOOL_EXECUTION) {
          timelineItem = {
            ...existingTool,
            toolExecution: {
              ...existingTool.toolExecution,
              status: data.status,
              result: data.result,
              error: data.error,
              endTime: data.endTime,
              executionTime: data.executionTime
            },
            preview: data.preview
          };
        }
      } else if ('messageId' in data) {
        // It's a message update
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
        }
      }
      
      if (!timelineItem) return;
      
      setLocalItems(prev => {
        // Check if we already have this item
        const existingIndex = prev.findIndex(item => item.id === timelineItem?.id);
        
        if (existingIndex >= 0 && isUpdate) {
          // Replace existing item for updates
          const newItems = [...prev];
          newItems[existingIndex] = timelineItem!;
          return newItems;
        } else if (existingIndex >= 0) {
          // Item exists but this isn't an update - keep existing
          return prev;
        } else {
          // Add new item
          return [...prev, timelineItem!];
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
      data => handleTimelineItem(data, false));
    
    const unsubscribeToolUpdated = subscribe(WebSocketEvent.TOOL_EXECUTION_UPDATED,
      data => handleTimelineItem(data, true));
    
    // Clear the timeline on session load/reload
    const unsubscribeSessionLoaded = subscribe(WebSocketEvent.SESSION_LOADED, (data: { sessionId: string }) => {
      if (data.sessionId === sessionId) {
        setLocalItems([]);
        timelineInitializedRef.current = false;
        fetchTimeline();
      }
    });
    
    return () => {
      unsubscribeMessageReceived();
      unsubscribeMessageUpdated();
      unsubscribeToolReceived();
      unsubscribeToolUpdated();
      unsubscribeSessionLoaded();
    };
  }, [sessionId, isConnected, subscribe, fetchTimeline, localItems]);
  
  // Force reload the timeline
  const reload = useCallback(() => {
    fetchTimeline();
  }, [fetchTimeline]);
  
  // Combine server state with local state
  const combinedTimeline = useMemo(() => {
    // Create a map to deduplicate items by ID
    const itemMap = new Map<string, TimelineItem>();
    
    // Add server items first (older items)
    state.items.forEach(item => {
      itemMap.set(item.id, item);
    });
    
    // Add local items, which will override server items with same ID
    localItems.forEach(item => {
      itemMap.set(item.id, item);
    });
    
    // Convert back to array and sort by timestamp
    return Array.from(itemMap.values()).sort((a, b) => {
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
      }
      
      return dateA - dateB;
    });
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