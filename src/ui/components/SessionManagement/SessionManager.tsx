import React, { useState } from 'react';
import useSessionManager from '../../hooks/useSessionManager';
import { SessionList } from './SessionList';

interface SessionManagerProps {
  onClose?: () => void;
}

/**
 * Session manager component with save/load functionality
 */
export function SessionManager({ onClose }: SessionManagerProps) {
  const { saveCurrentSession } = useSessionManager();
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  
  const handleSaveSession = async () => {
    setIsSaving(true);
    setSaveResult(null);
    
    try {
      const success = await saveCurrentSession();
      
      setSaveResult({
        success,
        message: success
          ? 'Session saved successfully'
          : 'Failed to save session'
      });
    } catch (error) {
      setSaveResult({
        success: false,
        message: `Error: ${(error as Error).message}`
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <div className="bg-black/90 dark:bg-gray-900/95 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden">
      <div className="py-2 px-3 border-b border-gray-700/50 dark:border-gray-700/30 flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-gray-400 mr-1">📂</span>
          <h2 className="text-sm font-medium text-gray-200">Sessions</h2>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={handleSaveSession}
            disabled={isSaving}
            className="px-2 py-0.5 text-xs bg-transparent hover:bg-gray-800 text-gray-300 border border-gray-700/50 rounded transition-colors disabled:opacity-50"
            title="Save current session"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="ml-1 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-700/50 transition-colors"
              aria-label="Close session manager"
            >
              <span className="text-gray-400 text-xs">✕</span>
            </button>
          )}
        </div>
      </div>
      
      {saveResult && (
        <div className="p-1.5 mx-3 mt-2 text-xs rounded-sm bg-gray-800/80 border-l-2 border-r-0 border-t-0 border-b-0 border-solid border-blue-500">
          {saveResult.message}
        </div>
      )}
      
      <SessionList />
    </div>
  );
}