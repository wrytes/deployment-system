#!/bin/bash
# Deploy a container from a public Git repository

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
GIT_URL="${GIT_URL:-https://github.com/wrytes/3dotsinc-app.git}"
BRANCH="${BRANCH:-main}"
HOST_PORT="${HOST_PORT:-3001}"
CONTAINER_PORT="${CONTAINER_PORT:-3000}"

if [ -z "$ENV_ID" ]; then
  echo "❌ Error: ENV_ID is required"
  echo "Usage: ENV_ID=<environment-id> ./7-deploy-from-git.sh"
  exit 1
fi

echo "=== Deploying from Git Repository ==="
echo "Environment: ${ENV_ID}"
echo "Git URL: ${GIT_URL}"
echo "Branch: ${BRANCH}"
echo "Host Port: ${HOST_PORT}"
echo "Container Port: ${CONTAINER_PORT}"
echo ""

curl -s -X POST http://localhost:3030/deployments/from-git \
  -H "X-API-Key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"environmentId\": \"${ENV_ID}\",
    \"gitUrl\": \"${GIT_URL}\",
    \"branch\": \"${BRANCH}\",
    \"baseImage\": \"node:22\",
    \"installCommand\": \"yarn install\",
    \"buildCommand\": \"yarn run build\",
    \"startCommand\": \"yarn start\",
    \"ports\": [{
      \"host\": ${HOST_PORT},
      \"container\": ${CONTAINER_PORT}
    }],
    \"envVars\": {
      \"NODE_ENV\": \"production\"
    }
  }" | python3 -m json.tool

echo ""
echo "✅ Git deployment initiated!"
echo ""
echo "Next steps:"
echo "1. Save the jobId from the response above"
echo "2. Check status: JOB_ID=<job-id> ./tests/3-check-status.sh"
echo "3. View logs: DEPLOYMENT_ID=<deployment-id> ./tests/4-view-logs.sh"
echo "4. Test: curl http://localhost:${HOST_PORT}"
