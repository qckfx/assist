# Session Architecture Refactoring

## Proposed Architecture

The architecture should follow these principles:

1. **Agent as Shared Infrastructure**: The agent (LLM run loop) should be a stateless processor shared across all sessions.

2. **Session-Specific Configuration**: Each session maintains its own configuration, including:
   - Tool set
   - Permission manager
   - LLM model configuration
   - Fast Edit Mode and other session-specific settings

3. **Architecture Flow**:
   ```
   AgentService
   ├── Session A
   │   └── Session Config A
   │       ├── ToolRegistry A
   │       ├── PermissionManager A
   │       └── ModelConfig A
   ├── Session B
   │   └── Session Config B
   │       ├── ToolRegistry B
   │       ├── PermissionManager B
   │       └── ModelConfig B
   └── Shared Agent Infrastructure (stateless run loop)
   ```

4. **Processing Flow**:
   - Receive query for a specific session
   - Load that session's configuration
   - Pass configuration to the shared Agent infrastructure
   - Return results to the session

## Cross-Agent Communication

For enabling communication between agents:

1. **Shared Resources Registry**: A central registry for resources that should be shared across sessions:
   - Common memory
   - Message board
   - Shared file storage
   - Database connectors

2. **Tool Access Pattern**: Tools would have access to:
   - Session-specific state
   - Shared resources (with appropriate permissions)

3. **Communication Pattern**:
   - Tools write to shared resources
   - Other agents' tools read from shared resources
   - Optional notification system for real-time updates

## Implementation Strategy

1. **Session Configuration Container**:
   - Create a SessionConfig class that encapsulates all session-specific settings
   - Initialize this when a session is created

2. **Agent Refactoring**:
   - Refactor Agent to be stateless
   - Accept SessionConfig when processing queries
   - Return results without storing state

3. **AgentService Updates**:
   - Store and manage SessionConfig objects
   - Handle session lifecycle events
   - Pass the right config to the Agent when processing queries

## Benefits

1. **Clear Separation of Concerns**:
   - Agent = Processing Logic
   - Session = Configuration and State

2. **Flexibility**: Each session can have completely different tools, models, and permissions.

3. **Scalability**: Stateless Agent makes horizontal scaling easier.

4. **Multi-Agent Scenarios**: Enables complex multi-agent scenarios through shared resources.

5. **Simplicity**: Configuration lifecycle is tied directly to session lifecycle.

## Current Workarounds

Until this refactoring is implemented, we're using manual synchronization:
- Fast Edit Mode state is tracked in AgentService
- Before each query, we manually sync this state to the Agent's PermissionManager
- Permission state is managed separately from tool configuration