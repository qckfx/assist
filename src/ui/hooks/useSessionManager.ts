import { useState, useCallback, useEffect } from 'react';
import { useWebSocket } from './useWebSocket';
import { WebSocketEvent } from '../../types/websocket';
import { SessionListEntry } from '../../types/session';

/**
 * React hook for managing persisted sessions
 */
export default function useSessionManager() {
  // Get context, but handle socket potentially being undefined
  // as WebSocketContextValue might not have socket property
  const context = useWebSocket();
  const socket = (context as any).socket;
  const subscribe = context.subscribe;
  const [sessions, setSessions] = useState<SessionListEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Fetch initial sessions when socket is available
  useEffect(() => {
    if (!socket) return;
    
    setIsLoading(true);
    socket.emit('list_sessions', {}, (response: { success: boolean; sessions?: SessionListEntry[] }) => {
      if (response.success && response.sessions) {
        setSessions(response.sessions);
      }
      setIsLoading(false);
    });
  }, [socket]);
  
  // Subscribe to session list updates
  useEffect(() => {
    const unsubscribe = subscribe('session:list:updated' as any, (data: any) => {
      setSessions(data.sessions);
      setIsLoading(false);
    });
    
    return unsubscribe;
  }, [subscribe]);
  
  // Subscribe to individual session events
  useEffect(() => {
    const unsubscribers = [
      subscribe('session:saved' as any, () => {
        // Refresh the session list when a session is saved
        if (socket) {
          socket.emit('list_sessions');
        }
      }),
      subscribe('session:deleted' as any, () => {
        // Refresh the session list when a session is deleted
        if (socket) {
          socket.emit('list_sessions');
        }
      })
    ];
    
    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [socket, subscribe]);
  
  // Save current session
  const saveCurrentSession = useCallback(() => {
    if (!socket) return Promise.reject(new Error('No socket connection'));
    
    return new Promise<boolean>((resolve) => {
      const sessionId = localStorage.getItem('sessionId');
      if (!sessionId) {
        resolve(false);
        return;
      }
      
      socket.emit('save_session', { sessionId }, (response: { success: boolean }) => {
        resolve(response.success);
      });
    });
  }, [socket]);
  
  // Delete a session
  const deleteSession = useCallback((sessionId: string) => {
    if (!socket) return Promise.reject(new Error('No socket connection'));
    
    return new Promise<boolean>((resolve) => {
      socket.emit('delete_session', { sessionId }, (response: { success: boolean }) => {
        resolve(response.success);
      });
    });
  }, [socket]);
  
  // Load a session
  const loadSession = useCallback((sessionId: string) => {
    if (!socket) return Promise.reject(new Error('No socket connection'));
    
    // For loading a session, we'll use the existing session management
    // by setting the session ID in local storage and reloading the page
    localStorage.setItem('sessionId', sessionId);
    window.location.reload();
    
    return Promise.resolve(true);
  }, [socket]);
  
  // Refresh session list
  const refreshSessions = useCallback(() => {
    if (!socket) return;
    
    setIsLoading(true);
    socket.emit('list_sessions');
  }, [socket]);
  
  return {
    sessions,
    isLoading,
    saveCurrentSession,
    deleteSession,
    loadSession,
    refreshSessions
  };
}