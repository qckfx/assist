#!/bin/bash
# Script to fix the Docker container issue with directory-mapper.sh

# Navigate to project root
cd "$(dirname "$0")/.."

echo "====== Docker Fix Script ======"
echo "1. Stopping all containers..."
npm run docker:stop

# Clean up old containers
echo "2. Cleaning up lingering containers..."
docker ps -a | grep agent-sandbox | awk '{print $1}' | xargs docker rm -f 2>/dev/null || true

# Rebuild the Docker image
echo "3. Rebuilding Docker image..."
npm run docker:build

# Start a fresh container
echo "4. Starting fresh container..."
npm run docker:start

# Get the container ID
echo "5. Getting running container ID..."
CONTAINER_ID=$(docker ps -q --filter name=qckfx_agent-sandbox)
if [ -z "$CONTAINER_ID" ]; then
    echo "ERROR: No container found! Make sure the qckfx_agent-sandbox_1 container is running."
    echo "Run 'npm run docker:start' first."
    exit 1
fi
echo "Container ID: $CONTAINER_ID"

# Create a direct copy of the script in the container (to handle any possible issues)
echo "6. Ensuring directory-mapper.sh is available in the container..."
docker cp scripts/directory-mapper.sh $CONTAINER_ID:/usr/local/bin/directory-mapper.sh
docker exec $CONTAINER_ID chmod +x /usr/local/bin/directory-mapper.sh
docker exec $CONTAINER_ID chown agent:agent /usr/local/bin/directory-mapper.sh

# Verify the script is now available
echo "7. Verifying script is available..."
docker exec $CONTAINER_ID ls -la /usr/local/bin/directory-mapper.sh
docker exec $CONTAINER_ID /usr/local/bin/directory-mapper.sh /workspace 3 | head -10

echo ""
echo "====== Fix Applied ======"
echo ""
echo "The script has been copied directly to the container."
echo "This container is now the active one for your application."
echo "Run 'npm run dev' to test if it now works correctly."