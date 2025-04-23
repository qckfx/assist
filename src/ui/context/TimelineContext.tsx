import React, { createContext, useContext, useCallback, ReactNode, useMemo } from 'react';
import { TimelineItem, TimelineItemType } from '../../types/timeline';
import { useTimeline } from '../hooks/useTimeline';

/**
 * Interface for the shared timeline context
 */
interface TimelineContextType {
  /** All timeline items (messages and tools) */
  timeline: TimelineItem[];
  /** Whether timeline data is currently loading */
  isLoading: boolean;
  /** Any error that occurred during timeline loading */
  error: Error | null;
  /** Whether there are more timeline items to load */
  hasMore: boolean;
  /** Total count of timeline items */
  totalCount: number;
  /** Function to load more timeline items */
  loadMore: () => void;
  /** Function to refresh the timeline */
  refreshTimeline: () => void;
  /** Function to find a specific timeline item by ID */
  getItemById: (id: string) => TimelineItem | undefined;
  /** Function to get tool execution items */
  getToolExecutionItems: () => TimelineItem[];
  /** Function to get message items */
  getMessageItems: () => TimelineItem[];
  /** Function to truncate timeline at a specific item (removing it and all items after it) */
  truncateTimelineAt: (itemId: string) => void;
}

// Create the context with undefined default
const TimelineContext = createContext<TimelineContextType | undefined>(undefined);

/**
 * Timeline context provider component
 */
interface TimelineProviderProps {
  /** Session ID for the timeline */
  sessionId: string | null;
  /** React children */
  children: ReactNode;
}

export const TimelineProvider: React.FC<TimelineProviderProps> = ({ 
  children, 
  sessionId 
}) => {
  // Use the existing useTimeline hook
  const {
    timeline,
    isLoading,
    error,
    hasMore,
    totalCount,
    loadMore,
    reload: refreshTimeline,
    truncateTimelineAt
  } = useTimeline(sessionId, {
    limit: 100,
    includeRelated: true
  });
  
  // Utility function to find an item by ID
  const getItemById = useCallback((id: string): TimelineItem | undefined => {
    return timeline.find(item => item.id === id);
  }, [timeline]);
  
  // Get only tool execution items
  const getToolExecutionItems = useCallback((): TimelineItem[] => {
    return timeline.filter(item => item.type === TimelineItemType.TOOL_EXECUTION);
  }, [timeline]);
  
  // Get only message items
  const getMessageItems = useCallback((): TimelineItem[] => {
    return timeline.filter(item => item.type === TimelineItemType.MESSAGE);
  }, [timeline]);
  
  // Combine everything into the context value
  const contextValue = useMemo(() => ({
    timeline,
    isLoading,
    error,
    hasMore,
    totalCount,
    loadMore,
    refreshTimeline,
    getItemById,
    getToolExecutionItems,
    getMessageItems,
    truncateTimelineAt
  }), [
    timeline, 
    isLoading, 
    error, 
    hasMore, 
    totalCount, 
    loadMore, 
    refreshTimeline, 
    getItemById, 
    getToolExecutionItems, 
    getMessageItems,
    truncateTimelineAt
  ]);
  
  return (
    <TimelineContext.Provider value={contextValue}>
      {children}
    </TimelineContext.Provider>
  );
};

/**
 * Hook to access the timeline context
 * @throws Error if used outside of TimelineProvider
 */
export const useTimelineContext = (): TimelineContextType => {
  const context = useContext(TimelineContext);
  
  if (context === undefined) {
    throw new Error('useTimelineContext must be used within a TimelineProvider');
  }
  
  return context;
};