import React from 'react';
import { ToolVisualization } from './ToolVisualization';
import { ToolVisualizationItem, useToolVisualization } from '../../hooks/useToolVisualization';
import { cn } from '../../lib/utils';
import { useTheme } from '@/components/ThemeProvider';
import { PreviewMode } from '../../../types/preview';

export interface ToolVisualizationsProps {
  className?: string;
  maxVisible?: number;
  compact?: boolean;
  showActiveOnly?: boolean;
  isDarkTheme?: boolean;
  onViewModeChange?: (toolId: string, mode: PreviewMode) => void;
}

export function ToolVisualizations({
  className,
  maxVisible = 3,
  compact = false,
  showActiveOnly = false,
  isDarkTheme: isDarkThemeProp,
  onViewModeChange,
}: ToolVisualizationsProps) {
  // Use the new useToolVisualization hook to get tool data
  const { 
    activeTools, 
    recentTools, 
    defaultViewMode,
    setToolViewMode
  } = useToolVisualization();
  
  // Get theme from context if not provided as prop
  const { theme } = useTheme();
  const isDarkTheme = isDarkThemeProp !== undefined ? isDarkThemeProp : theme === 'dark';
  
  // Determine which tools to display based on showActiveOnly prop
  const displayTools: ToolVisualizationItem[] = showActiveOnly 
    ? activeTools
    : [...activeTools, ...recentTools].slice(0, maxVisible + activeTools.length);
  
  // Calculate how many tools are hidden
  const hiddenCount = Math.max(0, (showActiveOnly ? 0 : recentTools.length) - 
    (showActiveOnly ? 0 : maxVisible));
  
  // Handle view mode changes
  const handleViewModeChange = (toolId: string, mode: PreviewMode) => {
    // Update local state
    setToolViewMode(toolId, mode);
    
    // Propagate to parent if callback is provided
    if (onViewModeChange) {
      onViewModeChange(toolId, mode);
    }
  };
  
  return (
    <div 
      className={cn('tool-visualizations', className)}
      data-testid="tool-visualizations"
      aria-label={`Tool executions: ${displayTools.length} tools${hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}`}
    >
      {displayTools.map(tool => (
        <ToolVisualization
          key={tool.id}
          tool={tool}
          compact={compact}
          isDarkTheme={isDarkTheme}
          defaultViewMode={defaultViewMode}
          onViewModeChange={handleViewModeChange}
        />
      ))}
      
      {hiddenCount > 0 && (
        <div className={`text-xs text-center ${isDarkTheme ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
          +{hiddenCount} more tool execution{hiddenCount !== 1 ? 's' : ''}
        </div>
      )}
      
      {displayTools.length === 0 && (
        <div className={`text-sm ${isDarkTheme ? 'text-gray-400' : 'text-gray-500'} italic`}>
          No active tools
        </div>
      )}
    </div>
  );
}

export default ToolVisualizations;