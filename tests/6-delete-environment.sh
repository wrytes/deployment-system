#!/bin/bash
# Delete an environment (cleans up all services, volumes, networks)

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

if [ -z "$ENV_ID" ]; then
  echo "❌ Error: ENV_ID is required"
  echo "Usage: ENV_ID=<environment-id> ./6-delete-environment.sh"
  exit 1
fi

echo "=== Deleting Environment: ${ENV_ID} ==="
echo ""
echo "⚠️  This will:"
echo "  - Stop all running containers"
echo "  - Delete all volumes"
echo "  - Remove the overlay network"
echo ""
read -p "Are you sure? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Cancelled"
  exit 0
fi

curl -s -X DELETE http://localhost:3000/environments/${ENV_ID} \
  -H "X-API-Key: ${API_KEY}" | python3 -m json.tool

echo ""
echo "✅ Environment deletion initiated"
