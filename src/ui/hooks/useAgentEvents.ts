/**
 * React hook for agent-related WebSocket events
 */
import { useState, useEffect } from 'react';
import { useWebSocket } from './useWebSocket';
import { WebSocketEvent, SessionData } from '../types/api';

/**
 * Hook for subscribing to agent-related events
 */
export function useAgentEvents(sessionId?: string) {
  const { subscribe } = useWebSocket(sessionId);
  const [isProcessing, setIsProcessing] = useState(false);
  const [session, setSession] = useState<SessionData | null>(null);
  const [lastError, setLastError] = useState<{ 
    name: string; 
    message: string; 
    stack?: string;
  } | null>(null);

  // Subscribe to agent processing events
  useEffect(() => {
    // Processing started
    const unsubscribeStart = subscribe(
      WebSocketEvent.PROCESSING_STARTED, 
      () => {
        setIsProcessing(true);
        setLastError(null);
      }
    );
    
    // Processing completed
    const unsubscribeComplete = subscribe(
      WebSocketEvent.PROCESSING_COMPLETED, 
      () => {
        setIsProcessing(false);
      }
    );
    
    // Processing error
    const unsubscribeError = subscribe(
      WebSocketEvent.PROCESSING_ERROR, 
      (data: { error: { name: string; message: string; stack?: string } }) => {
        setIsProcessing(false);
        setLastError(data.error);
      }
    );
    
    // Processing aborted
    const unsubscribeAbort = subscribe(
      WebSocketEvent.PROCESSING_ABORTED, 
      () => {
        setIsProcessing(false);
      }
    );
    
    // Session updated
    const unsubscribeSession = subscribe(
      WebSocketEvent.SESSION_UPDATED, 
      (data: SessionData) => {
        setSession(data);
      }
    );
    
    // Clean up event listeners
    return () => {
      unsubscribeStart();
      unsubscribeComplete();
      unsubscribeError();
      unsubscribeAbort();
      unsubscribeSession();
    };
  }, [subscribe]);
  
  return {
    isProcessing,
    session,
    lastError,
  };
}

export default useAgentEvents;