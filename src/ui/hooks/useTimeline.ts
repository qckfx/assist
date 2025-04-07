/**
 * Hook for fetching and handling unified timeline data
 */
import { useState, useEffect, useCallback } from 'react';
import { WebSocketEvent } from '../types/api';
import { 
  TimelineItem, 
  TimelineItemType, 
  TimelineResponse
} from '../../types/timeline';
import { useTerminalWebSocket } from './useTerminalWebSocket';
import { useWebSocket } from './useWebSocket';
import apiClient from '../services/apiClient';

interface TimelineOptions {
  limit?: number;
  types?: TimelineItemType[];
  includeRelated?: boolean;
}

export const useTimeline = (sessionId: string | null, options: TimelineOptions = {}) => {
  const { limit = 50, types, includeRelated = true } = options;
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [totalCount, setTotalCount] = useState(0);
  
  // Use useWebSocket to get the subscribe function for WebSocket events
  const { subscribe } = useWebSocket();
  const { isConnected } = useTerminalWebSocket();
  
  // Fetch timeline from API
  const fetchTimeline = useCallback(async (pageToken?: string) => {
    if (!sessionId) {
      console.warn('fetchTimeline called without sessionId');
      return;
    }
    
    try {
      setIsLoading(true);
      
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
          setTimeline(prev => [...prev, ...responseData.items]);
        } else {
          // Replace items for initial load
          setTimeline(responseData.items);
        }
        
        setNextPageToken(responseData.nextPageToken);
        setHasMore(!!responseData.nextPageToken);
        setTotalCount(responseData.totalCount);
      } else {
        throw new Error(
          typeof response.error === 'string' 
            ? response.error 
            : 'Failed to fetch timeline'
        );
      }
    } catch (error) {
      console.error(`Error fetching timeline for ${sessionId}:`, error);
      setError(error instanceof Error ? error : new Error('Failed to fetch timeline'));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, limit, types, includeRelated]);
  
  // Load more items (pagination)
  const loadMore = useCallback(() => {
    if (nextPageToken) {
      fetchTimeline(nextPageToken);
    }
  }, [nextPageToken, fetchTimeline]);
  
  // Initial load
  useEffect(() => {
    if (sessionId) {
      fetchTimeline();
      
      // Emit a SESSION_LOADED event to ensure other components refresh their data
      if (isConnected && typeof window !== 'undefined') {
        const webSocketService = window.webSocketService;
        if (webSocketService?.emit) {
          webSocketService.emit(WebSocketEvent.SESSION_LOADED, { sessionId });
        }
      }
    }
  }, [sessionId, fetchTimeline, isConnected]);
  
  // Listen for WebSocket updates - INCREMENTAL UPDATES instead of refetching
  useEffect(() => {
    if (!sessionId || !isConnected) {
      return;
    }
    
    // Handle received message events
    const handleMessageReceived = (data: any) => {
      if (data.sessionId === sessionId && data.message) {
        console.log('[useTimeline] Received message:', data.message.role);
        
        // Directly update the timeline with the new message
        setTimeline(prev => {
          // Check for duplicates by ID
          const existingByIdIndex = prev.findIndex(item => 
            item.type === TimelineItemType.MESSAGE && item.id === data.message.id
          );
          
          // Also look for pending user messages with the same content (optimistic vs confirmed)
          // This handles the case of optimistic updates where the client has already added a message
          // with a different ID but the same content
          const isPendingUserMessage = data.message.role === 'user' && 
                                     data.message.confirmationStatus === 'confirmed';
          
          let existingByContentIndex = -1;
          
          if (isPendingUserMessage) {
            existingByContentIndex = prev.findIndex(item => 
              item.type === TimelineItemType.MESSAGE && 
              item.message.role === 'user' &&
              item.message.confirmationStatus === 'pending' &&
              JSON.stringify(item.message.content) === JSON.stringify(data.message.content)
            );
            
            if (existingByContentIndex >= 0) {
              console.log('[useTimeline] Found duplicate user message with pending status - deduping');
            }
          }
          
          // Check if we found either type of duplicate
          if (existingByIdIndex >= 0) {
            // Update existing message by ID
            const updatedTimeline = [...prev];
            updatedTimeline[existingByIdIndex] = {
              ...updatedTimeline[existingByIdIndex],
              message: data.message,
              timestamp: data.message.timestamp || new Date().toISOString()
            };
            return updatedTimeline;
          } else if (existingByContentIndex >= 0) {
            // Update existing message by content (replace pending with confirmed)
            const updatedTimeline = [...prev];
            updatedTimeline[existingByContentIndex] = {
              ...updatedTimeline[existingByContentIndex],
              id: data.message.id, // Update with server-assigned ID
              message: data.message,
              timestamp: data.message.timestamp || new Date().toISOString()
            };
            return updatedTimeline;
          } else {
            // Add new message
            return [...prev, {
              id: data.message.id,
              type: TimelineItemType.MESSAGE,
              timestamp: data.message.timestamp || new Date().toISOString(),
              sessionId,
              message: data.message,
              toolExecutions: data.message.toolCalls?.map(call => call.executionId)
            }];
          }
        });
      }
    };
    
    // Handle tool execution events
    const handleToolExecution = (data: any) => {
      if (data.sessionId === sessionId && data.toolExecution) {
        console.log('[useTimeline] Received tool execution:', data.toolExecution.id);
        
        setTimeline(prev => {
          // Check if this tool execution already exists in the timeline
          const existingIndex = prev.findIndex(item => 
            item.type === TimelineItemType.TOOL_EXECUTION && item.id === data.toolExecution.id
          );
          
          if (existingIndex >= 0) {
            // Update existing tool execution
            const updatedTimeline = [...prev];
            updatedTimeline[existingIndex] = {
              ...updatedTimeline[existingIndex],
              toolExecution: data.toolExecution,
              preview: data.toolExecution.preview,
              timestamp: data.toolExecution.startTime || new Date().toISOString()
            };
            return updatedTimeline;
          } else {
            // Add new tool execution
            return [...prev, {
              id: data.toolExecution.id,
              type: TimelineItemType.TOOL_EXECUTION,
              timestamp: data.toolExecution.startTime || new Date().toISOString(),
              sessionId,
              toolExecution: data.toolExecution,
              preview: data.toolExecution.preview,
              parentMessageId: data.toolExecution.parentMessageId
            }];
          }
        });
      }
    };
    
    // For session loaded events, we do need a full refresh since we're loading a new session
    const handleSessionLoaded = (data: any) => {
      if (data.sessionId === sessionId) {
        console.log('[useTimeline] Session loaded, refreshing timeline');
        fetchTimeline();
      }
    };
    
    // Set up event subscriptions with specific handlers
    const unsubscribers = [
      subscribe(WebSocketEvent.MESSAGE_RECEIVED, handleMessageReceived),
      subscribe(WebSocketEvent.MESSAGE_UPDATED, handleMessageReceived),
      subscribe(WebSocketEvent.TOOL_EXECUTION_RECEIVED, handleToolExecution),
      subscribe(WebSocketEvent.TOOL_EXECUTION_UPDATED, handleToolExecution),
      subscribe(WebSocketEvent.SESSION_LOADED, handleSessionLoaded)
    ];
    
    // Return cleanup function
    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [sessionId, isConnected, subscribe, fetchTimeline]);
  
  // Force reload the timeline
  const reload = useCallback(() => {
    fetchTimeline();
  }, [fetchTimeline]);
  
  return {
    timeline,
    isLoading,
    error,
    hasMore,
    totalCount,
    loadMore,
    reload
  };
};