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
  
  // Handle session selection
  const handleSessionSelect = (sessionId: string) => {
    if (onSessionSelect) {
      onSessionSelect(sessionId);
    } else {
      loadSession(sessionId);
    }
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
      <div className="p-3 bg-gray-100 rounded dark:bg-gray-800 mt-2 text-sm">
        <div className="flex justify-between">
          <span className="font-semibold">Repository:</span>
          <span>{repo.repoName}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="font-semibold">Commit:</span>
          <span className="font-mono">{repo.commitHash.substring(0, 8)}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="font-semibold">Branch:</span>
          <span>{repo.branch}</span>
        </div>
        
        {repo.isDirty && (
          <div className="mt-2 text-amber-600 dark:text-amber-400">
            <span className="font-bold">⚠️ Warning:</span> This session had uncommitted changes,
            which may affect session replay.
          </div>
        )}
      </div>
    );
  };
  
  // Render session item
  const renderSessionItem = (session: ExtendedSessionEntry) => {
    const isExpanded = expandedSession === session.id;
    const isConfirmingDelete = confirmingDelete === session.id;
    
    return (
      <div
        key={session.id}
        className="p-4 border border-gray-300 dark:border-gray-700 rounded mb-3"
      >
        <div className="flex justify-between items-center">
          <div className="flex-grow">
            <h3 className="text-lg font-medium">
              {session.initialQuery || 'No initial query'}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {formatDistanceToNow(new Date(session.lastActiveAt))} ago
            </p>
          </div>
          
          <div className="flex">
            <button
              onClick={() => toggleDetails(session.id)}
              className="ml-2 px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
            >
              {isExpanded ? 'Hide' : 'Details'}
            </button>
            
            <button
              onClick={() => handleSessionSelect(session.id)}
              className="ml-2 px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600"
            >
              Load
            </button>
            
            <button
              onClick={() => handleDeleteConfirmation(session.id)}
              className="ml-2 px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600"
            >
              Delete
            </button>
          </div>
        </div>
        
        {isExpanded && (
          <div className="mt-3">
            <div className="flex justify-between">
              <span className="font-semibold">Session ID:</span>
              <span className="font-mono">{session.id}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="font-semibold">Created:</span>
              <span>{new Date(session.createdAt).toLocaleString()}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="font-semibold">Last active:</span>
              <span>{new Date(session.lastActiveAt).toLocaleString()}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="font-semibold">Messages:</span>
              <span>{session.messageCount}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="font-semibold">Tool executions:</span>
              <span>{session.toolCount}</span>
            </div>
            
            {session.lastMessage && (
              <div className="mt-2">
                <div className="font-semibold">Last message:</div>
                <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded mt-1">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    {session.lastMessage.role} • {new Date(session.lastMessage.timestamp).toLocaleTimeString()}
                  </div>
                  <div className="text-sm">
                    {session.lastMessage.content.length > 100
                      ? `${session.lastMessage.content.substring(0, 100)}...`
                      : session.lastMessage.content}
                  </div>
                </div>
              </div>
            )}
            
            {session.repositoryInfo && renderRepositoryInfo(session.repositoryInfo)}
          </div>
        )}
        
        {isConfirmingDelete && (
          <div className="mt-3 p-3 bg-red-100 dark:bg-red-900 rounded">
            <p className="text-red-800 dark:text-red-200 mb-2">
              Are you sure you want to delete this session? This action cannot be undone.
            </p>
            <div className="flex justify-end">
              <button
                onClick={handleDeleteCancel}
                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteConfirm(session.id)}
                className="ml-2 px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Saved Sessions</h2>
        <button
          onClick={refreshSessions}
          className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      
      {isLoading ? (
        <div className="text-center p-4">Loading sessions...</div>
      ) : sessions.length === 0 ? (
        <div className="text-center p-4 text-gray-500 dark:text-gray-400">
          No saved sessions found.
        </div>
      ) : (
        sessions
          .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime())
          .map(renderSessionItem)
      )}
    </div>
  );
}