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
  
  // Listen for WebSocket updates
  useEffect(() => {
    if (!sessionId || !isConnected) return;
    
    // Listen for timeline updates
    const unsubscribeUpdate = subscribe(WebSocketEvent.TIMELINE_UPDATE, (data: {
      sessionId: string;
      item: TimelineItem;
    }) => {
      if (data.sessionId !== sessionId) return;
      
      // Update the state with the new/updated item
      setState(prev => {
        const existingIndex = prev.items.findIndex(
          item => item.id === data.item.id && item.type === data.item.type
        );
        
        let newItems = [...prev.items];
        
        if (existingIndex >= 0) {
          // Update existing item
          newItems[existingIndex] = data.item;
        } else {
          // Add new item
          newItems = [...newItems, data.item];
          
          // Sort items by timestamp
          newItems.sort((a, b) => {
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
        }
        
        return {
          ...prev,
          items: newItems,
          totalCount: prev.totalCount + (existingIndex >= 0 ? 0 : 1)
        };
      });
    });
    
    // Listen for timeline history updates
    const unsubscribeHistory = subscribe(WebSocketEvent.TIMELINE_HISTORY, (data: {
      sessionId: string;
      items: TimelineItem[];
      nextPageToken?: string;
      totalCount: number;
    }) => {
      if (data.sessionId !== sessionId) return;
      
      // Replace the entire timeline with the new history
      setState({
        items: data.items,
        isLoading: false,
        error: null,
        nextPageToken: data.nextPageToken,
        totalCount: data.totalCount
      });
      
      timelineInitializedRef.current = true;
    });
    
    // Listen for session updates and refresh timeline if needed
    const unsubscribeSessionUpdated = subscribe(WebSocketEvent.SESSION_UPDATED, () => {
      if (timelineInitializedRef.current) {
        fetchTimeline();
      }
    });
    
    // Listen for session load events
    const unsubscribeSessionLoaded = subscribe(WebSocketEvent.SESSION_LOADED, (data: { sessionId: string }) => {
      if (data.sessionId === sessionId) {
        timelineInitializedRef.current = false;
        fetchTimeline();
      }
    });
    
    return () => {
      unsubscribeUpdate();
      unsubscribeHistory();
      unsubscribeSessionUpdated();
      unsubscribeSessionLoaded();
    };
  }, [sessionId, isConnected, subscribe, fetchTimeline]);
  
  // Force reload the timeline
  const reload = useCallback(() => {
    fetchTimeline();
  }, [fetchTimeline]);
  
  return {
    timeline: state.items,
    isLoading: state.isLoading,
    error: state.error,
    hasMore: !!state.nextPageToken,
    totalCount: state.totalCount,
    loadMore,
    reload
  };
};