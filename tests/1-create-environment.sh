#!/bin/bash
# Create a new isolated environment with overlay network

# Load API key from .env file
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[ -f "${SCRIPT_DIR}/.env" ] && source "${SCRIPT_DIR}/.env"

# Check if API key is set
if [ -z "$API_KEY" ]; then
  echo "❌ Error: API_KEY not set"
  echo "Create tests/.env file with your API key:"
  echo "  cp tests/.env.example tests/.env"
  echo "  # Edit tests/.env and add your key"
  exit 1
fi

ENV_NAME="${ENV_NAME:-test-env-2}"

echo "=== Creating Environment: ${ENV_NAME} ==="
curl -s -X POST https://deployment.wrytes.io/environments \
  -H "X-API-Key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${ENV_NAME}\"}" | python3 -m json.tool

echo ""
echo "Save the environment ID for next steps!"
