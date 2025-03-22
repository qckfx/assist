/**
 * Hook for managing streaming messages
 */
import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { WebSocketEvent } from '@/types/api';
import { useTerminal } from '@/context/TerminalContext';

interface UseStreamingMessagesOptions {
  sessionId?: string;
  bufferInterval?: number;
  maxBufferLength?: number;
}

/**
 * Hook that manages real-time streaming of message content from WebSocket events
 */
export function useStreamingMessages({
  sessionId,
  bufferInterval = 100, // Update buffer every 100ms
  maxBufferLength = 1000 // Limit buffer size to avoid excess rendering
}: UseStreamingMessagesOptions = {}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentBuffer, setCurrentBuffer] = useState<string[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  
  const { subscribe, subscribeToBatch } = useWebSocket(sessionId);
  const { state, dispatch } = useTerminal();
  
  // Flush buffer at regular intervals to avoid excessive re-renders
  useEffect(() => {
    if (!isStreaming) return;
    
    const interval = setInterval(() => {
      if (currentBuffer.length > 0) {
        const content = currentBuffer.join('');
        setStreamingContent(prev => prev + content);
        setCurrentBuffer([]);
      }
    }, bufferInterval);
    
    return () => clearInterval(interval);
  }, [isStreaming, currentBuffer, bufferInterval]);
  
  // Subscribe to streaming content events
  useEffect(() => {
    // Handle processing started
    const unsubscribeStart = subscribe(WebSocketEvent.PROCESSING_STARTED, () => {
      setIsStreaming(true);
      setStreamingContent('');
      setCurrentBuffer([]);
      dispatch({ type: 'SET_STREAMING', payload: true });
    });
    
    // Handle processing completed
    const unsubscribeComplete = subscribe(WebSocketEvent.PROCESSING_COMPLETED, (data) => {
      const finalResult = data.result || '';
      // Use the final result to replace any streaming content
      setStreamingContent('');
      setCurrentBuffer([]);
      setIsStreaming(false);
      dispatch({ type: 'SET_STREAMING', payload: false });
    });
    
    // Handle aborted processing
    const unsubscribeAbort = subscribe(WebSocketEvent.PROCESSING_ABORTED, () => {
      setStreamingContent('');
      setCurrentBuffer([]);
      setIsStreaming(false);
      dispatch({ type: 'SET_STREAMING', payload: false });
    });
    
    // Handle processing errors
    const unsubscribeError = subscribe(WebSocketEvent.PROCESSING_ERROR, () => {
      setStreamingContent('');
      setCurrentBuffer([]);
      setIsStreaming(false);
      dispatch({ type: 'SET_STREAMING', payload: false });
    });
    
    // Handle streaming content
    const unsubscribeStream = subscribe('stream_content', (data: any) => {
      // Add to buffer, limiting size
      setCurrentBuffer(prev => {
        // If too large, concat and update streaming content directly
        if (prev.length >= maxBufferLength) {
          setStreamingContent(sc => sc + prev.join(''));
          return [data.content];
        }
        return [...prev, data.content];
      });
    });
    
    // Handle streaming content batches for better performance
    const unsubscribeStreamBatch = subscribeToBatch('stream_content', (events: any[]) => {
      if (events.length === 0) return;
      
      const contents = events.map(e => e.data.content);
      
      // Add to buffer, limiting size
      setCurrentBuffer(prev => {
        // If too large, concat and update streaming content directly
        if (prev.length + contents.length >= maxBufferLength) {
          setStreamingContent(sc => sc + prev.join('') + contents.join(''));
          return [];
        }
        return [...prev, ...contents];
      });
    });
    
    return () => {
      unsubscribeStart();
      unsubscribeComplete();
      unsubscribeAbort();
      unsubscribeError();
      unsubscribeStream();
      unsubscribeStreamBatch();
    };
  }, [subscribe, subscribeToBatch, dispatch, maxBufferLength]);
  
  // Clear streaming state when unmounting
  useEffect(() => {
    return () => {
      dispatch({ type: 'SET_STREAMING', payload: false });
    };
  }, [dispatch]);
  
  const clearStreamingContent = useCallback(() => {
    setStreamingContent('');
    setCurrentBuffer([]);
  }, []);
  
  return {
    isStreaming,
    streamingContent,
    clearStreamingContent,
  };
}

export default useStreamingMessages;