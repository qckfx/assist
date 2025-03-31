/**
 * Hook for managing tool visualization preferences
 */
import { useState, useEffect, useCallback } from 'react';
import { PreviewMode } from '../../types/preview';

// Interface for tool preferences
export interface ToolPreferences {
  defaultViewMode: PreviewMode;
  persistPreferences: boolean;
  toolOverrides: Record<string, { viewMode: PreviewMode }>;
}

// Default preferences
const defaultPreferences: ToolPreferences = {
  defaultViewMode: PreviewMode.BRIEF,
  persistPreferences: true,
  toolOverrides: {}
};

// Local storage key
const STORAGE_KEY = 'qckfx-tool-preferences';

export function useToolPreferences() {
  // Initialize state with default preferences
  const [preferences, setPreferences] = useState<ToolPreferences>(defaultPreferences);
  const [initialized, setInitialized] = useState(false);
  
  // Load preferences from local storage on mount
  useEffect(() => {
    try {
      const storedPreferences = localStorage.getItem(STORAGE_KEY);
      if (storedPreferences) {
        const parsed = JSON.parse(storedPreferences) as Partial<ToolPreferences>;
        
        // Merge with defaults to ensure all properties exist
        setPreferences({
          ...defaultPreferences,
          ...parsed,
          // Ensure toolOverrides exists
          toolOverrides: {
            ...defaultPreferences.toolOverrides,
            ...(parsed.toolOverrides || {})
          }
        });
      }
      setInitialized(true);
    } catch (error) {
      console.error('Error loading tool preferences:', error);
      setInitialized(true);
    }
  }, []);
  
  // Save preferences to local storage when they change
  useEffect(() => {
    if (!initialized) return;
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.error('Error saving tool preferences:', error);
    }
  }, [preferences, initialized]);
  
  // Set default view mode for all tools
  const setDefaultViewMode = useCallback((mode: PreviewMode) => {
    setPreferences(prev => ({
      ...prev,
      defaultViewMode: mode
    }));
  }, []);
  
  // Set view mode for a specific tool
  const setToolViewMode = useCallback((toolId: string, mode: PreviewMode) => {
    setPreferences(prev => ({
      ...prev,
      toolOverrides: {
        ...prev.toolOverrides,
        [toolId]: { viewMode: mode }
      }
    }));
  }, []);
  
  // Toggle whether to persist preferences
  const togglePersistPreferences = useCallback(() => {
    setPreferences(prev => ({
      ...prev,
      persistPreferences: !prev.persistPreferences
    }));
  }, []);
  
  // Reset all preferences to defaults
  const resetPreferences = useCallback(() => {
    setPreferences(defaultPreferences);
  }, []);
  
  // Get view mode for a specific tool
  const getToolViewMode = useCallback((toolId: string): PreviewMode => {
    // Check for tool-specific override
    const override = preferences.toolOverrides[toolId];
    if (override) {
      return override.viewMode;
    }
    
    // Fall back to default view mode
    return preferences.defaultViewMode;
  }, [preferences.toolOverrides, preferences.defaultViewMode]);
  
  // Clear overrides for a specific tool
  const clearToolOverride = useCallback((toolId: string) => {
    setPreferences(prev => {
      const { [toolId]: _, ...remainingOverrides } = prev.toolOverrides;
      return {
        ...prev,
        toolOverrides: remainingOverrides
      };
    });
  }, []);
  
  return {
    preferences,
    initialized,
    setDefaultViewMode,
    setToolViewMode,
    togglePersistPreferences,
    resetPreferences,
    getToolViewMode,
    clearToolOverride
  };
}