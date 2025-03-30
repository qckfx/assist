# Docker Integration Development

This guide explains the Docker integration architecture and development workflow for qckfx.

## Architecture Overview

The Docker integration consists of several components:

1. **DockerContainerManager** - Handles container lifecycle operations
2. **DockerExecutionAdapter** - Implements the execution adapter interface for Docker 
3. **ExecutionAdapterFactory** - Creates the appropriate adapter based on environment settings
4. **UI Components** - Display execution environment information

### Component Responsibilities

#### DockerContainerManager (`src/utils/DockerContainerManager.ts`)

Responsible for:
- Checking Docker availability
- Starting and stopping the container
- Managing container lifecycle
- Executing commands inside the container

#### DockerExecutionAdapter (`src/utils/DockerExecutionAdapter.ts`) 

Implements the `ExecutionAdapter` interface for Docker:
- Translates file operations to work inside Docker
- Handles path mapping between host and container
- Manages execution of commands in the container
- Implements all required tool adapter methods

#### ExecutionAdapterFactory (`src/utils/ExecutionAdapterFactory.ts`)

Creates the appropriate execution adapter:
- Selects adapter type based on configuration
- Handles fallback logic when preferred adapter isn't available
- Initializes adapters with correct configuration

#### UI Components (`src/ui/components/EnvironmentConnectionIndicator.tsx`)

Displays environment information:
- Shows current execution environment type
- Displays connection status
- Provides hover details

## Docker Configuration

### Container Setup

The Docker container is defined in:
- `docker/Dockerfile` - Base image and environment setup
- `docker/docker-compose.yml` - Container configuration and volume mounts

Key configuration aspects:
- Read-only mount of the workspace directory
- Non-root user for improved security
- Limited container capabilities
- Network isolation

### WebSocket Communication

The execution environment information is communicated to the UI through:
1. The WebSocket server sends an `init` event containing environment information
2. The `SocketConnectionManager` receives and stores this information
3. The `useExecutionEnvironment` hook accesses this data
4. UI components display the environment information

## Development Workflow

### Prerequisites

For Docker development, you need:
- Docker installed and running
- Docker Compose available
- Node.js and npm for running the application

### Running with Docker

When starting qckfx, Docker is used by default if available:

```bash
# Start qckfx with Docker (default)
npm run dev
```

### Testing Docker Integration

To test the Docker integration during development:

1. Verify that the container starts correctly:
   ```bash
   docker ps | grep qckfx
   ```

2. Check logs for any startup issues:
   ```bash
   docker logs qckfx_agent-sandbox_1
   ```

3. Verify UI shows "Docker" in the environment indicator

4. Use commands that test file system access and command execution

### Common Changes

When developing features for Docker integration:

#### Modifying Container Configuration

1. Edit `docker/docker-compose.yml` to change container settings
2. Restart qckfx to apply changes
3. Test with relevant file or command operations

#### Changing Path Translation

If you need to change how paths are translated between host and container:

1. Modify `DockerExecutionAdapter.toContainerPath()` and `toHostPath()`
2. Test with file operations to ensure paths resolve correctly

#### Adding New Command Operations

To support new types of command operations:

1. Implement the required method in `DockerExecutionAdapter`
2. Add proper path translation
3. Consider security implications
4. Add error handling
5. Test with appropriate commands

## UI Components

### Environment Connection Indicator

The `EnvironmentConnectionIndicator` component displays:
- A colored circle indicating connection status
- Text showing the current environment type

Key implementation details:

```tsx
// Get environment information
const { isDocker, isE2B } = useExecutionEnvironment();

// Determine environment name
const environmentName = isDocker ? 'Docker' : isE2B ? 'E2B' : 'Local';

// Render appropriate indicator
<div className="indicator">
  <div className="status-circle"></div>
  <span>{environmentName}</span>
</div>
```

### useExecutionEnvironment Hook

The custom hook for accessing environment information:

```tsx
// Import in components that need environment info
import { useExecutionEnvironment } from '../hooks/useExecutionEnvironment';

// Use in your component
const { environment, isDocker, isLocal, isE2B } = useExecutionEnvironment();
```

## Testing Guidelines

When testing Docker integration:

1. **Test with Docker Available**:
   - Verify container starts successfully
   - Check command execution inside container
   - Verify file operations work correctly
   - Test path translation edge cases

2. **Test with Docker Unavailable**:
   - Verify graceful fallback to local execution
   - Check appropriate error messages
   - Ensure UI shows "Local" environment

3. **Test UI Components**:
   - Verify environment indicator shows correct environment
   - Check connection status updates properly
   - Test hover details display correctly

## Debugging Tips

1. **Container Issues**:
   - Check container logs: `docker logs qckfx_agent-sandbox_1`
   - Verify container is running: `docker ps`
   - Inspect container config: `docker inspect qckfx_agent-sandbox_1`

2. **Path Translation Issues**:
   - Add debug logging in `toContainerPath()` and `toHostPath()`
   - Test with absolute and relative paths
   - Check edge cases (root paths, symbolic links)

3. **WebSocket Communication**:
   - Check browser console for WebSocket events
   - Verify `init` event includes correct environment information
   - Check `SocketConnectionManager` state for environment data

4. **UI Rendering**:
   - Inspect component state using React DevTools
   - Check `useExecutionEnvironment` hook return values
   - Verify component renders with correct environment data