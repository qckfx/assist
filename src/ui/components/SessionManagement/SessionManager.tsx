import React, { useState } from 'react';
import useSessionManager from '../../hooks/useSessionManager';
import { SessionList } from './SessionList';

/**
 * Session manager component with save/load functionality
 */
export function SessionManager() {
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
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden">
      <div className="p-4 border-b border-gray-300 dark:border-gray-700">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Session Management</h2>
          <button
            onClick={handleSaveSession}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Current Session'}
          </button>
        </div>
        
        {saveResult && (
          <div
            className={`mt-2 p-2 rounded ${
              saveResult.success
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
            }`}
          >
            {saveResult.message}
          </div>
        )}
      </div>
      
      <SessionList />
    </div>
  );
}