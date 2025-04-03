import React, { useState } from 'react';
import useSessionManager from '../../hooks/useSessionManager';
import { formatDistanceToNow } from 'date-fns';
import { SessionListEntry } from '../../../types/session';

// Define expected repository info shape based on the WebSocketEvent.SESSION_LIST_UPDATED
interface SessionRepositoryInfo {
  repoName: string;
  commitHash: string;
  branch: string;
  remoteUrl?: string;
  isDirty?: boolean;
  workingDirectory?: string;
}

// Extended session entry with the properties we expect from the websocket
interface ExtendedSessionEntry extends Omit<SessionListEntry, 'repositoryInfo'> {
  lastActiveAt: string;
  initialQuery?: string;
  toolCount: number;
  lastMessage?: {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  };
  repositoryInfo?: SessionRepositoryInfo;
}

interface SessionListProps {
  onSessionSelect?: (sessionId: string) => void;
}

/**
 * Session list component that displays all persisted sessions
 */
export function SessionList({ onSessionSelect }: SessionListProps) {
  const {
    sessions: rawSessions,
    isLoading,
    deleteSession,
    loadSession,
    refreshSessions
  } = useSessionManager();
  
  // Cast sessions to the extended type that includes all the properties we need
  const sessions = rawSessions as ExtendedSessionEntry[];
  
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState<string | null>(null);
  
  // Handle session selection - now uses URL-based navigation
  const handleSessionSelect = (sessionId: string) => {
    // Set this session as loading
    setLoadingSession(sessionId);
    
    // Small delay to show the loading state before navigation
    setTimeout(() => {
      if (onSessionSelect) {
        onSessionSelect(sessionId);
      } else {
        // Use the loadSession function which now uses URL-based navigation
        loadSession(sessionId);
      }
    }, 800); // Slightly longer delay to ensure users see the loading state
  };
  
  // Handle session deletion
  const handleDeleteConfirmation = (sessionId: string) => {
    setConfirmingDelete(sessionId);
  };
  
  const handleDeleteCancel = () => {
    setConfirmingDelete(null);
  };
  
  const handleDeleteConfirm = async (sessionId: string) => {
    await deleteSession(sessionId);
    setConfirmingDelete(null);
  };
  
  // Toggle session details
  const toggleDetails = (sessionId: string) => {
    setExpandedSession(expandedSession === sessionId ? null : sessionId);
  };
  
  // Render repository information
  const renderRepositoryInfo = (repo: SessionRepositoryInfo) => {
    if (!repo) return null;
    
    return (
      <div className="mt-2">
        <div className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Repository</div>
        <div className="bg-gray-800/60 p-2 rounded-sm border-l border-gray-700 text-xs">
          <div className="grid grid-cols-2 gap-1">
            <span className="text-gray-500">Repo:</span>
            <span>{repo.repoName}</span>
            
            <span className="text-gray-500">Commit:</span>
            <span className="font-mono text-[10px]">{repo.commitHash.substring(0, 8)}</span>
            
            <span className="text-gray-500">Branch:</span>
            <span>{repo.branch}</span>
          </div>
          
          {repo.isDirty && (
            <div className="mt-1 text-amber-500 text-[10px] flex items-center">
              <span className="mr-1">⚠️</span> Had uncommitted changes
            </div>
          )}
        </div>
      </div>
    );
  };
  
  // Render session item
  const renderSessionItem = (session: ExtendedSessionEntry) => {
    const isExpanded = expandedSession === session.id;
    const isConfirmingDelete = confirmingDelete === session.id;
    const isLoading = loadingSession === session.id;
    
    return (
      <div
        key={session.id}
        className={`p-2 border-l-2 ${
          isConfirmingDelete 
            ? 'border-red-500' 
            : isLoading 
              ? 'border-blue-400 bg-blue-900/20' 
              : isExpanded 
                ? 'border-blue-500' 
                : 'border-transparent'
        } rounded bg-gray-800/40 hover:bg-gray-800/60 transition-colors ${
          isLoading ? 'opacity-80' : ''
        }`}
      >
        <div className="flex justify-between items-start">
          <div className="flex-grow pr-2 cursor-pointer" onClick={() => toggleDetails(session.id)}>
            <h3 className="text-sm font-medium text-gray-200 truncate w-48">
              {session.initialQuery || 'No initial query'}
            </h3>
            <p className="text-gray-500 text-xs mt-0.5">
              {session.lastActiveAt && typeof session.lastActiveAt === 'string' && session.lastActiveAt !== 'undefined'
                ? `${formatDistanceToNow(new Date(session.lastActiveAt))} ago`
                : 'Recently active'}
            </p>
          </div>
          
          <div className="flex flex-shrink-0">
            <button
              onClick={() => handleSessionSelect(session.id)}
              disabled={isLoading || loadingSession !== null}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-sm bg-transparent border ${
                loadingSession === session.id 
                  ? 'border-blue-500/50 bg-blue-900/20 text-blue-400'
                  : isLoading 
                    ? 'border-gray-700 text-gray-500 cursor-not-allowed' 
                    : 'border-gray-700 text-blue-400 hover:bg-gray-700'
              } transition-colors min-w-[30px] flex items-center justify-center`}
              title="Load this session"
            >
              {loadingSession === session.id ? (
                <span className="inline-block animate-pulse">
                  <span className="inline-block animate-spin">⟳</span>
                </span>
              ) : isLoading ? (
                <span className="inline-block animate-spin">⟳</span>
              ) : (
                'Load'
              )}
            </button>
            
            <button
              onClick={() => handleDeleteConfirmation(session.id)}
              className="ml-1 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-700 transition-colors"
              title="Delete session"
            >
              <span className="text-gray-500 hover:text-red-400 text-xs">🗑</span>
            </button>
          </div>
        </div>
        
        {isExpanded && (
          <div className="mt-2 text-xs text-gray-400 border-t border-gray-700/40 pt-2">
            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
              <span className="text-gray-500">Created:</span>
              <span>{new Date(session.createdAt).toLocaleString()}</span>
              
              <span className="text-gray-500">Last active:</span>
              <span>{new Date(session.lastActiveAt).toLocaleString()}</span>
              
              <span className="text-gray-500">Messages:</span>
              <span>{session.messageCount}</span>
              
              <span className="text-gray-500">Tool executions:</span>
              <span>{session.toolCount}</span>
            </div>
            
            {session.lastMessage && (
              <div className="mt-2">
                <div className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Last message</div>
                <div className="bg-gray-800/80 p-2 rounded-sm border-l border-gray-700">
                  <div className="text-[10px] text-gray-500 mb-1">
                    {session.lastMessage.role} • {new Date(session.lastMessage.timestamp).toLocaleTimeString()}
                  </div>
                  <div className="text-xs">
                    {session.lastMessage.content.length > 80
                      ? `${session.lastMessage.content.substring(0, 80)}...`
                      : session.lastMessage.content}
                  </div>
                </div>
              </div>
            )}
            
            <div className="text-[10px] text-gray-600 mt-2 font-mono overflow-hidden text-ellipsis">
              ID: {session.id}
            </div>
          </div>
        )}
        
        {isConfirmingDelete && (
          <div className="mt-2 p-2 rounded-sm bg-red-900/20 border border-red-800/40 text-xs">
            <p className="text-red-300 mb-2">
              Delete this session? This cannot be undone.
            </p>
            <div className="flex justify-end">
              <button
                onClick={handleDeleteCancel}
                className="px-2 py-0.5 text-[10px] rounded-sm bg-transparent border border-gray-700 text-gray-400 hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteConfirm(session.id)}
                className="ml-2 px-2 py-0.5 text-[10px] rounded-sm border border-red-800/60 bg-red-900/20 text-red-400 hover:bg-red-900/40"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="p-2">
      <div className="flex justify-between items-center mb-2 px-1">
        <div className="text-xs text-gray-400">
          {isLoading ? 'Loading sessions...' : `${sessions.length} saved sessions`}
        </div>
        <button
          onClick={refreshSessions}
          className={`px-1.5 py-0.5 text-[10px] rounded-sm ${
            isLoading 
              ? 'text-blue-400 bg-gray-800/50' 
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
          } transition-colors`}
          disabled={isLoading}
          title="Refresh session list"
        >
          <span className={isLoading ? 'inline-block animate-spin' : ''}>⟳</span>
          {isLoading ? ' Loading' : ' Refresh'}
        </button>
      </div>
      
      <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1 terminal-scrollbar">
        {isLoading ? (
          <div className="text-center py-12 flex flex-col items-center">
            <div className="inline-block text-blue-400 text-xl mb-3 animate-spin">⟳</div>
            <div className="text-sm text-gray-400">Loading saved sessions...</div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 flex flex-col items-center">
            <div className="text-gray-500 mb-2">No saved sessions found</div>
            <div className="text-xs text-gray-600 max-w-[200px]">
              Use the 💾 button in the top bar or press {typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? 'Cmd+.' : 'Ctrl+.'} to save your current session
            </div>
          </div>
        ) : (
          sessions
            .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime())
            .map(renderSessionItem)
        )}
      </div>
    </div>
  );
}