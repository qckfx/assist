/**
 * Context for tool visualization preferences
 */
import React, { createContext, useContext, ReactNode } from 'react';
import { useToolPreferences, ToolPreferences } from '../hooks/useToolPreferences';
import { PreviewMode } from '../../types/preview';

// Interface for the context value
interface ToolPreferencesContextValue {
  preferences: ToolPreferences;
  initialized: boolean;
  setDefaultViewMode: (mode: PreviewMode) => void;
  setToolViewMode: (toolId: string, mode: PreviewMode) => void;
  togglePersistPreferences: () => void;
  resetPreferences: () => void;
  getToolViewMode: (toolId: string) => PreviewMode;
  clearToolOverride: (toolId: string) => void;
}

// Create context with a default value
const ToolPreferencesContext = createContext<ToolPreferencesContextValue | undefined>(undefined);

// Provider component
export function ToolPreferencesProvider({ children }: { children: ReactNode }) {
  const toolPreferences = useToolPreferences();
  
  return (
    <ToolPreferencesContext.Provider value={toolPreferences}>
      {children}
    </ToolPreferencesContext.Provider>
  );
}

// Hook to use the context
export function useToolPreferencesContext() {
  const context = useContext(ToolPreferencesContext);
  
  if (context === undefined) {
    throw new Error('useToolPreferencesContext must be used within a ToolPreferencesProvider');
  }
  
  return context;
}