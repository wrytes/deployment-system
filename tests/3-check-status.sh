#!/bin/bash
# Check deployment status by job ID

# Load API key from .env file
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[ -f "${SCRIPT_DIR}/.env" ] && source "${SCRIPT_DIR}/.env"

# Check if API key is set
if [ -z "$API_KEY" ]; then
  echo "❌ Error: API_KEY not set"
  echo "Create tests/.env file with your API key"
  exit 1
fi

JOB_ID="${JOB_ID:-}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-20}"

if [ -z "$JOB_ID" ]; then
  echo "❌ Error: JOB_ID is required"
  echo "Usage: JOB_ID=<job-id> ./3-check-status.sh"
  exit 1
fi

echo "=== Checking Deployment Status: ${JOB_ID} ==="
echo ""

for i in $(seq 1 $MAX_ATTEMPTS); do
  echo "Attempt $i/$MAX_ATTEMPTS..."

  RESPONSE=$(curl -s http://localhost:3000/deployments/job/${JOB_ID} \
    -H "X-API-Key: ${API_KEY}")

  STATUS=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['deployment']['status'])" 2>/dev/null)

  if [ "$STATUS" = "RUNNING" ]; then
    echo ""
    echo "✅ Deployment is RUNNING!"
    echo ""
    echo "$RESPONSE" | python3 -m json.tool
    exit 0
  elif [ "$STATUS" = "FAILED" ]; then
    echo ""
    echo "❌ Deployment FAILED!"
    echo ""
    echo "$RESPONSE" | python3 -m json.tool
    exit 1
  else
    echo "   Status: $STATUS"
    sleep 3
  fi
done

echo ""
echo "⏱️  Timeout waiting for deployment"
echo "$RESPONSE" | python3 -m json.tool
