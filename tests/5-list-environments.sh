#!/bin/bash
# List all environments for the authenticated user

# Load API key from .env file
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[ -f "${SCRIPT_DIR}/.env" ] && source "${SCRIPT_DIR}/.env"

# Check if API key is set
if [ -z "$API_KEY" ]; then
  echo "❌ Error: API_KEY not set"
  echo "Create tests/.env file with your API key"
  exit 1
fi

echo "=== Listing All Environments ==="
echo ""

curl -s http://localhost:3030/environments \
  -H "X-API-Key: ${API_KEY}" | python3 -m json.tool
