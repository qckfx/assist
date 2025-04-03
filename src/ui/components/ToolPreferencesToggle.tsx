/**
 * Component for toggling tool visualization preferences
 */
import React from 'react';
import { useToolPreferencesContext } from '../context/ToolPreferencesContext';
import { PreviewMode } from '../../types/preview';

export interface ToolPreferencesToggleProps {
  className?: string;
}

export function ToolPreferencesToggle({ className = '' }: ToolPreferencesToggleProps) {
  const { 
    preferences, 
    setDefaultViewMode, 
    togglePersistPreferences,
    resetPreferences
  } = useToolPreferencesContext();
  
  return (
    <div className={`tool-preferences-toggle ${className}`}>
      <div className="flex items-center gap-2 text-sm">
        <label className="flex items-center">
          <span className="mr-2">Default View:</span>
          <select
            value={preferences.defaultViewMode}
            onChange={(e) => setDefaultViewMode(e.target.value as PreviewMode)}
            className="p-1 rounded border text-xs"
            data-testid="default-view-mode-select"
          >
            <option value={PreviewMode.RETRACTED}>Retracted</option>
            <option value={PreviewMode.BRIEF}>Brief</option>
            <option value={PreviewMode.COMPLETE}>Complete</option>
          </select>
        </label>
        
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={preferences.persistPreferences}
            onChange={togglePersistPreferences}
            className="mr-2"
            data-testid="persist-preferences-checkbox"
          />
          <span>Remember preferences</span>
        </label>
        
        <button
          onClick={resetPreferences}
          className="px-2 py-0.5 rounded border text-xs hover:bg-gray-100 dark:hover:bg-gray-700"
          data-testid="reset-preferences-button"
        >
          Reset
        </button>
      </div>
    </div>
  );
}