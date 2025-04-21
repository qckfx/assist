import { useState, useCallback, useEffect } from 'react';
import { useWebSocket } from './useWebSocket';
import { SessionListEntry } from '../../types/session';
import apiClient from '../services/apiClient';

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
  
  // Fetch initial sessions on mount
  useEffect(() => {
    let isMounted = true;
    const fetchInitialSessions = async () => {
      setIsLoading(true);
      
      // Try socket first if available
      if (socket) {
        console.log('Attempting to fetch sessions via WebSocket');
        socket.emit('list_sessions', {}, (response: { success: boolean; sessions?: SessionListEntry[] }) => {
          if (!isMounted) return;
          
          if (response.success && response.sessions) {
            console.log('Received sessions via WebSocket:', response.sessions);
            setSessions(response.sessions);
          } else {
            // If WebSocket fails, try REST API
            console.log('WebSocket session list failed, falling back to REST API');
            fetchSessionsViaRest();
          }
          setIsLoading(false);
        });
        
        // Set a timeout to fall back to REST API if socket doesn't respond
        setTimeout(() => {
          if (!isMounted) return;
          
          // Check if we're still loading (no WebSocket response yet)
          console.log('WebSocket session list timeout, falling back to REST API');
          fetchSessionsViaRest();
        }, 2000);
      } else {
        // If no socket, use REST API directly
        console.log('No WebSocket available, using REST API for sessions');
        await fetchSessionsViaRest();
      }
    };
    
    fetchInitialSessions();
    
    return () => {
      isMounted = false;
    };
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
    return new Promise<boolean>(async (resolve) => {
      const sessionId = localStorage.getItem('sessionId');
      if (!sessionId) {
        resolve(false);
        return;
      }
      
      // Try WebSocket method first if available
      if (socket) {
        try {
          socket.emit('save_session', { sessionId }, (response: { success: boolean }) => {
            if (response.success) {
              // Ensure sessionId is stored in localStorage
              localStorage.setItem('sessionId', sessionId);
              console.log('Session saved via WebSocket and stored in localStorage:', sessionId);
              resolve(true);
              return;
            } else {
              // Fall back to REST API if WebSocket fails
              fallbackToRestApi();
            }
          });
          
          // Set a timeout in case the WebSocket never responds
          setTimeout(() => {
            fallbackToRestApi();
          }, 1000);
          
          return;
        } catch (err) {
          console.error('WebSocket save failed:', err);
          // Continue to REST API fallback
        }
      }
      
      // Fallback to REST API using apiClient
      async function fallbackToRestApi() {
        try {
          console.log('Falling back to REST API for saving session');
          
          // Check if sessionId is null before proceeding
          if (!sessionId) {
            console.error('Cannot save session: sessionId is null');
            resolve(false);
            return;
          }
          
          // Use the apiClient to save session
          const response = await apiClient.saveSession(sessionId);
          console.log('REST API save response:', response);
          
          if (response.success) {
            // Store session ID in localStorage for persistence
            localStorage.setItem('sessionId', sessionId);
            console.log('Stored session ID in localStorage:', sessionId);
          }
          
          resolve(response.success === true);
        } catch (err) {
          console.error('REST API save failed:', err);
          resolve(false);
        }
      }
      
      // If we don't have socket, directly use REST API
      if (!socket) {
        fallbackToRestApi();
      }
    });
  }, [socket]);
  
  // Delete a session
  const deleteSession = useCallback((sessionId: string) => {
    return new Promise<boolean>(async (resolve) => {
      // Try WebSocket method first if available
      if (socket) {
        try {
          socket.emit('delete_session', { sessionId }, (response: { success: boolean }) => {
            if (response.success) {
              // Update local state on success
              setSessions(prev => prev.filter(s => s.id !== sessionId));
              resolve(true);
              return;
            } else {
              // Fall back to REST API if WebSocket fails
              deleteSessionViaRest(sessionId).then(resolve);
            }
          });
          
          // Set a timeout in case the WebSocket never responds
          setTimeout(() => {
            deleteSessionViaRest(sessionId).then(resolve);
          }, 1000);
          
          return;
        } catch (err) {
          console.error('WebSocket delete failed:', err);
          // Continue to REST API fallback
        }
      }
      
      // If we don't have socket, directly use REST API
      const success = await deleteSessionViaRest(sessionId);
      resolve(success);
    });
  }, [socket]);
  
  // Helper function to delete a session via REST API
  const deleteSessionViaRest = async (sessionId: string) => {
    try {
      console.log('Deleting session via REST API');
      
      // Use the apiClient to delete session - this uses the standard API handling patterns
      const response = await apiClient.deleteSession(sessionId);
      console.log('Session delete response:', response);
      
      // Update local state on successful deletion
      if (response.success) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
      }
      
      return response.success === true;
    } catch (error) {
      console.error('Error deleting session from API:', error);
      return false;
    }
  };
  
  // Load a session - calls the API to reconnect to the existing session
  const loadSession = useCallback(async (sessionId: string) => {
    console.log('Loading session:', sessionId);
    
    try {
      // Call API to reconnect to the existing session
      const response = await apiClient.startSession({ sessionId });
      
      if (response.success) {
        console.log('Successfully reconnected to session:', sessionId);
        
        // Set the session ID in local storage for backup/fallback
        localStorage.setItem('sessionId', sessionId);
        console.log('Stored session ID in localStorage:', sessionId);
        
        // Also store in sessionStorage to maintain consistency
        sessionStorage.setItem('currentSessionId', sessionId);
        console.log('Stored session ID in sessionStorage:', sessionId);
        
        // Navigate to the session URL
        window.location.href = `/sessions/${sessionId}`;
        
        return true;
      } else {
        console.error('Failed to reconnect to session:', sessionId);
        return false;
      }
    } catch (error) {
      console.error('Error reconnecting to session:', error);
      return false;
    }
  }, []);
  
  // Refresh session list
  const refreshSessions = useCallback(async () => {
    setIsLoading(true);
    
    try {
      // Try WebSocket method first if available
      if (socket) {
        socket.emit('list_sessions');
        
        // Set a timeout to fall back to REST API if the WebSocket doesn't respond
        setTimeout(() => {
          fetchSessionsViaRest();
        }, 2000);
      } else {
        await fetchSessionsViaRest();
      }
    } catch (error) {
      console.error("Failed to refresh sessions:", error);
      setIsLoading(false);
    }
  }, [socket]);
  
  // Helper function to fetch sessions via REST API
  const fetchSessionsViaRest = async () => {
    try {
      console.log('Fetching sessions via REST API');
      
      // Use the apiClient to fetch sessions - this uses the standard API handling patterns
      const response = await apiClient.listSessions();
      console.log('Sessions from API client:', response);
      
      if (response.success && response.data && 'sessions' in response.data) {
        setSessions(response.data.sessions);
      } else {
        // If the API doesn't return sessions, just set empty array
        console.warn('API returned no sessions');
        setSessions([]);
      }
    } catch (error) {
      console.error('Error fetching sessions from API:', error);
      
      // Just set empty array on error
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  };
  
  return {
    sessions,
    isLoading,
    saveCurrentSession,
    deleteSession,
    loadSession,
    refreshSessions
  };
}