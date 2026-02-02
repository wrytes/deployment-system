#!/bin/bash
# View container logs for a deployment

# Load API key from .env file
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[ -f "${SCRIPT_DIR}/.env" ] && source "${SCRIPT_DIR}/.env"

# Check if API key is set
if [ -z "$API_KEY" ]; then
  echo "❌ Error: API_KEY not set"
  echo "Create tests/.env file with your API key"
  exit 1
fi

DEPLOYMENT_ID="${DEPLOYMENT_ID:-}"
TAIL="${TAIL:-100}"

if [ -z "$DEPLOYMENT_ID" ]; then
  echo "❌ Error: DEPLOYMENT_ID is required"
  echo "Usage: DEPLOYMENT_ID=<deployment-id> ./4-view-logs.sh"
  exit 1
fi

echo "=== Viewing Logs (last ${TAIL} lines) ==="
echo ""

curl -s "http://localhost:3000/deployments/${DEPLOYMENT_ID}/logs?tail=${TAIL}" \
  -H "X-API-Key: ${API_KEY}" | python3 -c "import sys, json; print(json.load(sys.stdin)['logs'])"
