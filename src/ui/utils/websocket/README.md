# WebSocket Architecture for qckfx

This document explains how WebSocket connections are managed in qckfx, particularly regarding session management and React integration.

## Key Components

### 1. SocketConnectionManager (Singleton)

**Role**: The central manager for WebSocket connections and sessions, operating independently from React's render cycle.

**Key Features**:
- Singleton pattern ensures only one connection exists across the application
- Maintains connection and session state outside of React's render cycle
- Provides idempotent operations for joining/leaving sessions
- Emits events when connection or session state changes
- Automatically handles reconnection and session rejoining

**Important Methods**:
- `joinSession(sessionId)`: Join a session (idempotent - only joins once)
- `leaveSession(sessionId)`: Leave a session (idempotent - safe to call multiple times)
- `getCurrentSessionId()`: Get the currently joined session ID
- `getSessionState()`: Get detailed session state information

### 2. WebSocketContext (React Context)

**Role**: Provides React components with access to WebSocket functionality through React's Context API.

**Key Features**:
- Wraps the SocketConnectionManager for React component use
- Maintains reactive state that reflects the current connection status
- Provides event subscription methods
- Does not handle session management (deferred to SocketConnectionManager)

### 3. useWebSocket Hook (Basic Hook)

**Role**: Thin wrapper around WebSocketContext for convenient use in React components.

**Key Features**:
- Provides connection status information
- Offers event subscription methods
- No longer manages sessions directly
- Does not create cleanup functions that join/leave sessions on render

### 4. useTerminalWebSocket Hook (UI-specific Hook)

**Role**: Connects WebSocket events to Terminal UI updates.

**Key Features**:
- Observes connection and session state changes
- Provides UI feedback through terminal messages
- Manages UI state based on WebSocket events
- Requests sessions from SocketConnectionManager when needed

## Architecture Principles

1. **Separation of Concerns**:
   - Connection management is handled by SocketConnectionManager
   - React components observe and react to state changes
   - Session state is maintained independently from React render cycle

2. **Idempotent Operations**:
   - `joinSession` and `leaveSession` are safe to call multiple times
   - Prevents unnecessary WebSocket traffic during React re-renders

3. **Unidirectional Data Flow**:
   - SocketConnectionManager is the source of truth for session state
   - React components observe this state but don't directly manage it
   - Events flow from SocketConnectionManager to React components

4. **Event-Based Communication**:
   - Components subscribe to events rather than polling for state
   - Reduces coupling between components and WebSocket logic

## Common Patterns

### Joining a Session:

```typescript
import { getSocketConnectionManager } from '@/utils/websocket';

// Get the singleton connection manager
const connectionManager = getSocketConnectionManager();

// Request to join a session
// This is idempotent - calling multiple times has no effect
connectionManager.joinSession(sessionId);

// Listen for session events if UI feedback is needed
connectionManager.on('session_change', handleSessionChange);
```

### Observing Session State:

```typescript
import { useEffect } from 'react';
import { getSocketConnectionManager } from '@/utils/websocket';

// In a React component
useEffect(() => {
  const connectionManager = getSocketConnectionManager();
  
  // Get current session state
  const sessionState = connectionManager.getSessionState();
  
  // Subscribe to session changes
  const handleSessionChange = (newSessionId) => {
    // Update UI based on session change
  };
  
  connectionManager.on('session_change', handleSessionChange);
  
  // Clean up subscriptions
  return () => {
    connectionManager.off('session_change', handleSessionChange);
  };
}, []);
```

## Best Practices

1. **Never Join/Leave Sessions in Effect Cleanup Functions**:
   - React's effect cleanup functions run on re-renders
   - This can cause unwanted session disconnects
   - Instead, only clean up event subscriptions

2. **Use the SocketConnectionManager Directly for Session Management**:
   - Don't use the hooks for session management
   - Get the singleton instance and call methods directly

3. **Handle Connection Status Changes Gracefully**:
   - Listen for connection status events
   - Provide UI feedback for important status changes
   - Debounce status messages to prevent spamming

4. **Let the Connection Manager Handle Reconnection**:
   - SocketConnectionManager automatically handles reconnection
   - It will rejoin sessions automatically when reconnected

## Troubleshooting

### Common Issues:

1. **Unexpected Disconnects**:
   - Check if cleanup functions are leaving sessions
   - Ensure effects have proper dependency arrays
   - Verify that WebSocket is properly configured

2. **Multiple Join/Leave Messages**:
   - Check for unnecessary re-renders
   - Ensure components are properly memoized
   - Verify that context values are stable

3. **Session State Inconsistency**:
   - Always get the latest state from SocketConnectionManager
   - Don't cache session state in component state

## Implementation History

This architecture was implemented to fix issues with session management in React:

1. Previous implementation tied session lifecycle to React component lifecycle
2. This caused issues with unnecessary join/leave calls during re-renders
3. The new implementation separates connection management from React rendering
4. Session state is now maintained independently from React's render cycle