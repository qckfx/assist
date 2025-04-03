# Timeline and Tool Visualization Architecture

## Overview

This document describes the refactored architecture for timeline and tool visualization in the qckfx UI. The main goal of the refactoring was to eliminate redundancy and establish a single source of truth for all timeline data, while separating concerns between data management and UI state.

## Architecture

### Core Components

1. **TimelineContext**
   - Central provider for all timeline data
   - Wraps the existing `useTimeline` hook
   - Provides filtered access to timeline items (messages, tool executions)
   - Located at `src/ui/context/TimelineContext.tsx`

2. **useToolVisualization Hook**
   - Manages UI-specific state for tool visualizations
   - Consumes data from TimelineContext rather than subscribing directly to events
   - Provides state for tool preview view modes (brief, complete, retracted)
   - Located at `src/ui/hooks/useToolVisualization.ts`

3. **MessageFeed Component**
   - Consumes timeline data from TimelineContext
   - Renders messages and tool visualizations
   - No longer needs to implement timeline logic directly
   - Located at `src/ui/components/MessageFeed/MessageFeed.tsx`

4. **ToolVisualization Component**
   - Displays individual tool executions with previews
   - Updated to use new ToolVisualizationItem type
   - Located at `src/ui/components/ToolVisualization/ToolVisualization.tsx`

5. **ToolVisualizations Component**
   - Displays multiple tool visualizations
   - Gets data directly from useToolVisualization hook
   - Located at `src/ui/components/ToolVisualization/ToolVisualizations.tsx`

### Data Flow

```
WebSocket Events → TimelineContext → useToolVisualization → Components (MessageFeed, ToolVisualizations)
```

1. WebSocket events update the timeline state through the existing `useTimeline` hook
2. TimelineContext provides access to filtered timeline data
3. Components consume timeline data through TimelineContext
4. UI-specific state (like view modes) is managed by useToolVisualization

## Benefits

1. **Single Source of Truth**: All timeline data comes from TimelineContext, eliminating duplication
2. **Separation of Concerns**: Data management and UI state are properly separated
3. **Less WebSocket Overhead**: Only one component subscribes to WebSocket events
4. **Simpler Component API**: Components receive data through context, reducing prop drilling
5. **Easier Testing**: Components can be tested with mocked context

## Migration from Previous Architecture

The previous architecture had two parallel implementations:
- `useTimeline` hook for messages and timeline events
- `useToolStream` hook specifically for tool executions

This led to duplication in WebSocket event handling and state management. The refactoring:
1. Established TimelineContext as the single source of truth
2. Created useToolVisualization to replace useToolStream
3. Updated components to use the new hooks/context
4. Removed the legacy useToolStream implementation

## How to Use the New Architecture

### 1. Accessing Timeline Data

```tsx
import { useTimelineContext } from '@/context/TimelineContext';

function MyComponent() {
  const { 
    timeline,
    isLoading,
    error,
    getMessageItems,
    getToolExecutionItems
  } = useTimelineContext();
  
  // Access all timeline items
  const allItems = timeline;
  
  // Access only message items
  const messages = getMessageItems();
  
  // Access only tool execution items
  const tools = getToolExecutionItems();
  
  return (
    // Render component using timeline data
  );
}
```

### 2. Working with Tool Visualizations

```tsx
import { useToolVisualization } from '@/hooks/useToolVisualization';
import { PreviewMode } from '@/types/preview';

function MyComponent() {
  const { 
    tools,
    activeTools,
    recentTools,
    setToolViewMode,
    defaultViewMode
  } = useToolVisualization();
  
  // Handler for view mode changes
  const handleViewModeChange = (toolId: string, mode: PreviewMode) => {
    setToolViewMode(toolId, mode);
  };
  
  return (
    <div>
      {/* Show active tools */}
      {activeTools.map(tool => (
        <ToolVisualization
          key={tool.id}
          tool={tool}
          defaultViewMode={defaultViewMode}
          onViewModeChange={handleViewModeChange}
        />
      ))}
    </div>
  );
}
```

### 3. Providing the Context in App.tsx

```tsx
import { TimelineProvider } from '@/context/TimelineContext';

function App() {
  return (
    <TimelineProvider sessionId={sessionId}>
      <YourComponents />
    </TimelineProvider>
  );
}
```