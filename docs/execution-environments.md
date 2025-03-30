# Execution Environments

qckfx supports multiple execution environments for running commands, each with different security properties and isolation levels.

## Available Environments

### Docker (Default)

**Docker** is the default execution environment when Docker is available on the system. It provides a secure, isolated environment for running commands.

#### Benefits
- Isolated file system access
- Restricted network access
- Limited system capabilities
- Resource constraints
- Runs with non-root user

#### Requirements
- Docker must be installed and available on your system
- Docker Compose must be available

Docker is automatically used if available, but you can explicitly use it with:
```bash
# Use Docker explicitly (default if available)
npm run dev
```

### Local

The **Local** execution environment runs commands directly on the host system with no isolation.

#### Characteristics
- Direct access to the file system
- No network restrictions
- Full system capabilities
- Uses host system resources

To force using the local environment even when Docker is available:
```bash
# Force local execution
npm run dev -- --local
```

### E2B

The **E2B** execution environment uses cloud-based sandboxes for maximum isolation.

#### Benefits
- Complete isolation from local system
- Managed cloud sandbox environment
- Consistent environment across sessions

To use E2B:
```bash
# Use E2B with a specific sandbox ID
npm run dev -- -e <sandbox-id>
```

## UI Environment Indicator

The web interface includes an environment indicator that shows:

1. The current execution environment (Docker, Local, or E2B)
2. The connection status

The indicator appears in the top-right corner of the interface and consists of:

- A colored circle that indicates connection status:
  - Green: Connected
  - Yellow (pulsing): Connecting
  - Red: Disconnected or error
- A label showing the environment type ("Docker", "Local", or "E2B")

Hovering over the indicator displays additional details about the environment and connection.

## Environment Security Considerations

### Docker Security

When using Docker:
- Commands run inside an isolated container
- The container has read-only access to the project directory
- Network access is restricted by default
- System capabilities are limited
- The container runs with a non-root user

### Local Security

When using local execution:
- Commands have the same access as the user running qckfx
- Full file system access (within user permissions)
- Full network access
- No resource constraints

### E2B Security

When using E2B:
- Commands run in a remote cloud sandbox
- Complete isolation from the local system
- Environment is reset between sessions

## Environment Detection Flow

On startup, qckfx determines the execution environment in this order:

1. If `-e <sandbox-id>` is provided, use E2B
2. If `--local` flag is provided, use Local
3. If Docker is available and no other flags override it, use Docker (default)
4. If Docker is not available, fall back to Local

## Troubleshooting

### Docker Not Available

If Docker is specified but not available:
1. Ensure Docker is installed and running: `docker --version`
2. Verify Docker Compose is available: `docker-compose --version`
3. Check Docker daemon status: `docker info`
4. Ensure your user has permissions to use Docker

### UI Shows Wrong Environment

If the UI shows "Local" when Docker is configured:
1. Check WebSocket connection status (indicator should be green)
2. Verify Docker is running: `docker ps`
3. Check server logs for Docker-related errors
4. Check browser console for WebSocket connection issues

### Container Fails to Start

If the Docker container fails to start:
1. Look for specific errors in qckfx logs
2. Check Docker logs: `docker logs qckfx_agent-sandbox_1`
3. Verify Docker Compose file syntax
4. Check for port conflicts or resource constraints