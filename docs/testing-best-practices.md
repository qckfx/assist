# Testing Best Practices

This document outlines best practices for testing components in the QckFx codebase, especially those that involve WebSockets, React hooks, and singletons.

## React Component and Hook Testing

### Centralised Provider Wrapper (`TestProviders`)

Most UI components rely on a deep chain of React Context providers

```
ThemeProvider → WebSocketProvider → TerminalProvider → WebSocketTerminalProvider → ModelProvider → TimelineProvider → ToolPreferencesProvider → YourComponent
```

Mounting this stack by hand in every test was tedious and error–prone ("dependency-hell").

We now expose a **single** wrapper that contains the full hierarchy with safe defaults:

```tsx
import { render } from '@/test/utils';

// automatically wrapped with TestProviders
render(<MyComponent />);

// optional overrides
render(<MyComponent />, {
  wrapper: ({ children }) => (
    <TestProviders websocketTestMode={false} sessionId="abc123">
      {children}
    </TestProviders>
  )
});
```

Location: `src/ui/test/TestProviders.tsx`

Props you can tweak:

* **websocketTestMode** (default `true`) – keeps `WebSocketProvider` in stub mode, so no actual network traffic is made inside tests.
* **sessionId** – forwards a predictable session id to providers that accept one (`ModelProvider`, `WebSocketTerminalProvider`, `TimelineProvider`). Leave blank for most situations.

If you add a new top-level provider in the app, remember to include it in `TestProviders` so tests continue to work out of the box.


### 1. Centralized Mock Controllers

For components or hooks that interact with services or contexts, use centralized mock controllers:

```typescript
// Mock state with getters/setters for reactive updates
let _mockConnectionStatus = ConnectionStatus.CONNECTED;
let _mockIsConnected = true;

// Create an API for tests to modify behavior
const mockController = {
  // Getters
  get connectionStatus() { return _mockConnectionStatus; },
  get isConnected() { return _mockIsConnected; },
  
  // Function references
  handleCommand: vi.fn(),
  
  // Setters for convenient state updates
  setConnectionStatus(status: ConnectionStatus) {
    _mockConnectionStatus = status;
    _mockIsConnected = status === ConnectionStatus.CONNECTED;
  },
  
  // Reset to initial state
  reset() {
    _mockConnectionStatus = ConnectionStatus.CONNECTED;
    _mockIsConnected = true;
    // Clear mocks
    this.handleCommand.mockClear();
  }
};

// Mock the context or service using the controller
vi.mock('@/context/SomeContext', () => ({
  useSomeContext: () => ({
    // Use getters to always reference the current values
    get connectionStatus() { return mockController.connectionStatus; },
    get isConnected() { return mockController.isConnected; },
    handleCommand: mockController.handleCommand
  })
}));
```

### 2. Avoid Dynamic Requires

Instead of using dynamic `require()` calls in tests:

```typescript
// ❌ BAD: Dynamic require that might not resolve path aliases
const { useSomeHook } = require('@/hooks/someHook');
useSomeHook.mockReturnValueOnce({ /* ... */ });
```

Use static imports and the controller pattern:

```typescript
// ✅ GOOD: Static imports after mocks are established
import { MyComponent } from '../MyComponent';

// Test state changes via the controller
test('shows loading state', () => {
  mockController.setLoading(true);
  render(<MyComponent />);
  expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
});
```

### 3. Clean Setup and Teardown

Always reset state between tests:

```typescript
beforeEach(() => {
  // Reset all mock state to defaults
  mockController.reset();
});

afterEach(() => {
  // Clean up renders
  cleanup();
});
```

### 4. One Assertion Per Render

Avoid multiple renders in a single test:

```typescript
// ❌ BAD: Multiple renders in one test
test('handles different states', () => {
  mockController.setState('loading');
  render(<MyComponent />);
  expect(screen.getByTestId('loading')).toBeInTheDocument();
  
  mockController.setState('error');
  render(<MyComponent />); // Creates a second component instance
  expect(screen.getByTestId('error')).toBeInTheDocument();
});
```

Better approach:

```typescript
// ✅ GOOD: One test per state
test('shows loading state', () => {
  mockController.setState('loading');
  render(<MyComponent />);
  expect(screen.getByTestId('loading')).toBeInTheDocument();
});

test('shows error state', () => {
  mockController.setState('error');
  render(<MyComponent />);
  expect(screen.getByTestId('error')).toBeInTheDocument();
});
```

### 5. Use Parameterized Tests

For testing similar behavior with different inputs:

```typescript
test.each([
  ['connected', true],
  ['disconnected', false],
  ['error', false]
])('isConnected is %s when status is %s', (status, expected) => {
  mockController.setConnectionStatus(status);
  const { result } = renderHook(() => useMyHook());
  expect(result.current.isConnected).toBe(expected);
});
```

## Testing Singletons and Services

### 1. Dependency Injection

When possible, design services to accept dependencies:

```typescript
// ✅ GOOD: Accept dependencies for easier testing
class WebSocketService {
  constructor(socketClient = io) {
    this.socket = socketClient();
  }
}
```

### 2. Mutable Mock State

For singletons that can't be easily injected:

```typescript
// Create mutable state that mocks can reference
let mockIsConnected = true;
let eventCallbacks = {};

// Mock the singleton
vi.mock('@/services/WebSocketService', () => ({
  WebSocketService: {
    // Use getters to always return current mock state
    get isConnected() { return mockIsConnected; },
    
    // Store callbacks for simulating events
    on: vi.fn((event, callback) => {
      eventCallbacks[event] = callback;
      return () => { delete eventCallbacks[event]; };
    }),
    
    // Helper for tests to trigger events
    _emitEvent(event, data) {
      if (eventCallbacks[event]) {
        eventCallbacks[event](data);
      }
    }
  }
}));
```

### 3. Clean References for Each Test

Reset all state before each test:

```typescript
beforeEach(() => {
  mockIsConnected = true;
  eventCallbacks = {};
  WebSocketService.on.mockClear();
});
```

## Testing Asynchronous Code

### 1. Explicit Event Simulation

Use explicit helper methods to simulate events:

```typescript
// Helper to simulate WebSocket events
function simulateEvent(event, data) {
  if (mockCallbacks[event]) {
    mockCallbacks[event](data);
  }
}

test('handles data events', async () => {
  const { result } = renderHook(() => useDataHook());
  
  // Simulate an event
  act(() => {
    simulateEvent('data', { id: 123, value: 'test' });
  });
  
  // Check the result after event simulation
  expect(result.current.data).toEqual({ id: 123, value: 'test' });
});
```

### 2. Always Use `act()` for State Changes

Wrap all state changes in `act()`:

```typescript
test('updates state on event', async () => {
  const { result } = renderHook(() => useMyHook());
  
  // Wrap in act
  act(() => {
    mockController.triggerEvent('change', { value: 'new' });
  });
  
  expect(result.current.value).toBe('new');
});
```

## Testing Session Management

### 1. Unique Session IDs

When testing code that manages sessions:

```typescript
test('joins session when provided', () => {
  // Use unique session ID with timestamp to avoid conflicts
  const uniqueSessionId = `test-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  renderHook(() => useSessionHook(uniqueSessionId));
  
  expect(mockJoinSession).toHaveBeenCalledWith(uniqueSessionId);
});
```

### 2. Honor Join/Leave Session Optimizations

If your code optimizes by only joining new sessions:

```typescript
// Component optimizes by only joining if session changes
useEffect(() => {
  if (sessionId && sessionId !== currentRef.current) {
    currentRef.current = sessionId;
    joinSession(sessionId);
    return () => leaveSession(sessionId);
  }
}, [sessionId]);

// In tests, ensure each test gets a unique session ID
test('joins new session', () => {
  const uniqueId = `session-${Date.now()}`;
  renderHook(() => useSessionHook(uniqueId));
  expect(mockJoinSession).toHaveBeenCalledWith(uniqueId);
});
```

## Path Alias Resolution

### 1. Static Imports After Mocks

Always define all mocks first, then import the component/hook under test:

```typescript
// 1. Define mocks first (Vitest hoists these)
vi.mock('@/services/api', () => ({ /* ... */ }));
vi.mock('@/hooks/useAuth', () => ({ /* ... */ }));

// 2. Import the component after all mocks are defined
import { MyComponent } from '../MyComponent';

// Now tests can import properly
describe('MyComponent', () => {
  // Tests...
});
```

### 2. Avoid Mixing Import Styles

Don't mix static imports and dynamic requires:

```typescript
// ❌ BAD: Mixing static imports and dynamic requires
import { render } from '@testing-library/react';
// In test:
const { useAuthContext } = require('@/context/AuthContext');

// ✅ GOOD: Consistent static imports with proper mocking
vi.mock('@/context/AuthContext', () => ({ /* ... */ }));
import { useAuthContext } from '@/context/AuthContext';
```

## Examples from Our Codebase

### WebSocketTerminal Tests

See `/src/ui/components/__tests__/WebSocketTerminal.test.tsx` for a comprehensive example of:
- Centralized mock controller
- Getter/setter pattern for reactive updates
- Clean test separation
- Proper test cleanup

### useTerminalWebSocket Tests

See `/src/ui/hooks/__tests__/useTerminalWebSocket.test.tsx` for examples of:
- Event simulation helpers
- Unique session IDs
- Clean session management testing