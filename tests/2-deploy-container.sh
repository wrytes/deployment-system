#!/bin/bash
# Deploy a container to an environment

# Load API key from .env file
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[ -f "${SCRIPT_DIR}/.env" ] && source "${SCRIPT_DIR}/.env"

# Check if API key is set
if [ -z "$API_KEY" ]; then
  echo "❌ Error: API_KEY not set"
  echo "Create tests/.env file with your API key"
  exit 1
fi

ENV_ID="${ENV_ID:-}"
IMAGE="${IMAGE:-nginx}"
TAG="${TAG:-alpine}"
HOST_PORT="${HOST_PORT:-8080}"
CONTAINER_PORT="${CONTAINER_PORT:-80}"

if [ -z "$ENV_ID" ]; then
  echo "❌ Error: ENV_ID is required"
  echo "Usage: ENV_ID=<environment-id> ./2-deploy-container.sh"
  exit 1
fi

echo "=== Deploying ${IMAGE}:${TAG} to environment ${ENV_ID} ==="
curl -s -X POST http://localhost:3030/deployments \
  -H "X-API-Key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"environmentId\": \"${ENV_ID}\",
    \"image\": \"${IMAGE}\",
    \"tag\": \"${TAG}\",
    \"replicas\": 1,
    \"ports\": [{\"container\": ${CONTAINER_PORT}, \"host\": ${HOST_PORT}}],
    \"envVars\": {\"DEPLOYED_BY\": \"test-script\"}
  }" | python3 -m json.tool

echo ""
echo "Save the jobId to check deployment status!"
