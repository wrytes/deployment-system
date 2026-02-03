#!/bin/bash
set -e

# Wait for backend
echo "Waiting for backend..."
until curl -sf http://backend:3000/health > /dev/null 2>&1; do
  sleep 2
done
echo "Backend ready!"

# Verify Docker access
if [ "$ALLOW_DOCKER_ACCESS" = "true" ]; then
  if docker ps > /dev/null 2>&1; then
    echo "Docker access verified"
  else
    echo "WARNING: Docker access not available"
  fi
fi

# MCP connection
export MCP_SERVER_URL="http://backend:3000/mcp/sse"
export MCP_API_KEY="${API_KEY}"

echo "Claude Code container initialized"
echo "Project: ${PROJECT_NAME}"
echo "Session ID: ${SESSION_ID}"

exec "$@"
