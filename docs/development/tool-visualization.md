# Tool Visualization Implementation

This document describes the implementation of the tool visualization feature and how to extend or customize it.

## Architecture

The tool visualization feature consists of the following components:

1. **AgentService Events**: Backend events that track tool execution stages
2. **WebSocketService**: Forwards tool events to clients
3. **useToolStream Hook**: Manages tool execution state and provides utility functions
4. **ToolVisualization Component**: Renders individual tool visualizations
5. **ToolVisualizations Component**: Container for multiple tool visualizations
6. **Terminal Integration**: Integrates tool visualizations into the Terminal UI

## Event Flow

1. Agent initiates tool execution
2. AgentService emits `TOOL_EXECUTION_STARTED` event
3. WebSocketService forwards event to clients
4. useToolStream hook processes the event and updates state
5. ToolVisualizations component renders the running tool
6. Tool completes, AgentService emits `TOOL_EXECUTION_COMPLETED` event
7. WebSocketService forwards the completion event
8. useToolStream updates state with completion information
9. ToolVisualizations component updates to show completed status

## Component Structure

### ToolVisualization Component

The `ToolVisualization` component renders a single tool execution with:

- Visual status indicator (running, completed, error)
- Tool name and parameter summary
- Execution time (when available)
- Error message (for failed tools)

```tsx
export interface ToolVisualizationProps {
  tool: ToolExecution;
  className?: string;
  compact?: boolean;
  showExecutionTime?: boolean;
  showExpandedParams?: boolean;
  onToggleExpand?: () => void;
}
```

### ToolVisualizations Component

The `ToolVisualizations` component manages multiple tool visualizations:

- Renders a list of ToolVisualization components
- Implements maxVisible limit to prevent UI clutter
- Handles expanding/collapsing parameter details
- Shows placeholder when no tools are available

```tsx
export interface ToolVisualizationsProps {
  tools: ToolExecution[];
  className?: string;
  maxVisible?: number;
  compact?: boolean;
}
```

### useToolStream Hook

The `useToolStream` hook is the core state manager:

- Subscribes to WebSocket events for tool execution
- Tracks running, completed, and failed tools
- Provides utility methods for accessing tool state
- Handles tool execution history

```tsx
export interface ToolExecution {
  id: string;
  tool: string;
  toolName: string;
  status: 'running' | 'completed' | 'error';
  args?: Record<string, unknown>;
  paramSummary?: string;
  result?: any;
  error?: {
    message: string;
    stack?: string;
  };
  startTime: number;
  endTime?: number;
  executionTime?: number;
}
```

## Extending the Feature

### Adding New Tool Status Types

To add a new tool status type (e.g., "paused" or "waiting"):

1. Update the `ToolExecution` interface in useToolStream.ts:

```tsx
export interface ToolExecution {
  // ...existing fields
  status: 'running' | 'completed' | 'error' | 'paused' | 'waiting';
  // ...
}
```

2. Add styling for the new status in ToolVisualization.tsx:

```tsx
const statusStyles = {
  running: 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-sm',
  completed: 'border-green-500 bg-green-50 dark:bg-green-900/30 shadow-sm',
  error: 'border-red-500 bg-red-50 dark:bg-red-900/30 shadow-sm',
  paused: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/30 shadow-sm',
  waiting: 'border-gray-500 bg-gray-50 dark:bg-gray-900/30 shadow-sm',
}[tool.status];
```

3. Update the WebSocket events in the backend to emit events with the new status.

### Customizing Appearance

The tool visualization styling uses utility classes and can be customized by:

1. Modifying the CSS in globals.css or terminal.css
2. Adding props to the ToolVisualization component
3. Using the className prop to apply custom styles

Example of adding a custom theme:

```tsx
<ToolVisualization 
  tool={tool} 
  className="custom-theme border-purple-500 bg-purple-50"
/>
```

### Adding Advanced Features

Some ideas for extending the tool visualization:

1. **Tool Grouping**: Group related tool executions together

```tsx
// Group tools by type
const toolGroups = tools.reduce((groups, tool) => {
  const groupKey = tool.toolName;
  if (!groups[groupKey]) groups[groupKey] = [];
  groups[groupKey].push(tool);
  return groups;
}, {});
```

2. **Tool Filtering**: Allow users to filter which tools are shown

```tsx
const [filterType, setFilterType] = useState<string | null>(null);
const filteredTools = filterType 
  ? tools.filter(tool => tool.toolName === filterType)
  : tools;
```

3. **Detailed Timeline**: Show a timeline of tool executions

```tsx
// Sort tools by start time
const sortedTools = [...tools].sort((a, b) => a.startTime - b.startTime);

// Render timeline
return (
  <div className="timeline">
    {sortedTools.map(tool => (
      <div 
        key={tool.id}
        className="timeline-item"
        style={{ 
          left: `${getTimePosition(tool.startTime)}%`,
          width: `${getTimeWidth(tool.startTime, tool.endTime)}%`
        }}
      >
        {tool.toolName}
      </div>
    ))}
  </div>
);
```

4. **Expandable Results**: Allow viewing full tool results inline

```tsx
<div 
  className={expanded ? 'results-expanded' : 'results-collapsed'}
  onClick={() => setExpanded(!expanded)}
>
  {expanded 
    ? <pre>{JSON.stringify(tool.result, null, 2)}</pre>
    : <span>Click to view results</span>
  }
</div>
```

## Testing

The tool visualization components include comprehensive tests:

1. **Unit tests** for both `ToolVisualization` and `ToolVisualizations` components
2. **Integration tests** for Terminal + tool visualization interaction 
3. **Visual tests** to ensure proper styling based on tool status
4. **Accessibility tests** to verify ARIA compliance

## Performance Considerations

The tool visualization system is designed with performance in mind:

- Uses throttled updates for high-frequency tools
- Implements a limit on visible tools to prevent rendering too many at once
- Keeps a capped history of recent tools to prevent memory leaks

## Common Issues and Solutions

### Issue: Tool status doesn't update

**Solution**: Ensure the WebSocket connection is active and that the tool is emitting the correct events.

### Issue: Tool visualizations flicker or reset

**Solution**: Check for React key issues or verify that the tool IDs are consistent across updates.

### Issue: Tool visualizations don't appear

**Solution**: Verify that `showToolVisualizations` is set to `true` on the Terminal component.

## Future Improvements

1. Add drag-and-drop reordering of tools
2. Implement collapsible tool groups by type
3. Create a standalone tool dashboard view
4. Add tool execution metrics and statistics