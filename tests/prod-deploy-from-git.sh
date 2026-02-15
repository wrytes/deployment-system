#!/bin/bash
# Production test: Deploy a container from a public Git repository
# This tests the full production workflow including HTTPS domains

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load API key from .env file
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[ -f "${SCRIPT_DIR}/.env.prod" ] && source "${SCRIPT_DIR}/.env.prod"
[ -f "${SCRIPT_DIR}/.env" ] && source "${SCRIPT_DIR}/.env"

# Configuration
PROD_URL="${PROD_URL:-https://deployment.wrytes.io}"
API_KEY="${API_KEY:-}"
ENV_ID="${ENV_ID:-}"
GIT_URL="${GIT_URL:-https://github.com/wrytes/3dotsinc-app.git}"
BRANCH="${BRANCH:-main}"
DOMAIN="${DOMAIN:-test.deployment.wrytes.io}"  # Public domain for HTTPS access
VIRTUAL_HOST="${VIRTUAL_HOST:-${DOMAIN}}"  # nginx-proxy virtual host
VIRTUAL_PORT="${VIRTUAL_PORT:-3000}"  # Port your app listens on
LETSENCRYPT_HOST="${LETSENCRYPT_HOST:-${DOMAIN}}"  # Domain for SSL cert
REPLICAS="${REPLICAS:-1}"

# Validation
if [ -z "$API_KEY" ]; then
  echo -e "${RED}❌ Error: API_KEY not set${NC}"
  echo "Create tests/.env or tests/.env.prod file with your API key"
  echo "Example: API_KEY=dpk_xxxxxxxxxxxxxxxx"
  exit 1
fi

if [ -z "$ENV_ID" ]; then
  echo -e "${RED}❌ Error: ENV_ID is required${NC}"
  echo "Usage: ENV_ID=<environment-id> ./tests/prod-deploy-from-git.sh"
  echo ""
  echo "Optional environment variables:"
  echo "  DOMAIN=<domain>                  - Public HTTPS domain (default: test.deployment.wrytes.io)"
  echo "  GIT_URL=<repo-url>               - Git repository URL"
  echo "  BRANCH=<branch>                  - Git branch (default: main)"
  echo "  REPLICAS=<number>                - Number of replicas (default: 1)"
  echo "  VIRTUAL_HOST=<domain>            - nginx-proxy virtual host (default: DOMAIN)"
  echo "  VIRTUAL_PORT=<port>              - Container port (default: 3000)"
  echo "  LETSENCRYPT_HOST=<domain>        - SSL cert domain (default: DOMAIN)"
  exit 1
fi

echo -e "${BLUE}=== Production Git Deployment Test ===${NC}"
echo "Environment: ${ENV_ID}"
echo "Git URL: ${GIT_URL}"
echo "Branch: ${BRANCH}"
echo "Replicas: ${REPLICAS}"
echo -e "${GREEN}Public Domain: ${DOMAIN}${NC}"
echo "Virtual Host: ${VIRTUAL_HOST}"
echo "Virtual Port: ${VIRTUAL_PORT}"
echo "Let's Encrypt Host: ${LETSENCRYPT_HOST}"
echo ""

# Step 1: Deploy from Git
echo -e "${BLUE}Step 1: Initiating Git deployment...${NC}"

# Build deployment payload with labels included
DEPLOY_RESPONSE=$(curl -s -X POST ${PROD_URL}/deployments/from-git \
  -H "X-API-Key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"environmentId\": \"${ENV_ID}\",
    \"gitUrl\": \"${GIT_URL}\",
    \"branch\": \"${BRANCH}\",
    \"baseImage\": \"node:22-alpine\",
    \"installCommand\": \"yarn install --frozen-lockfile\",
    \"buildCommand\": \"yarn run build\",
    \"startCommand\": \"yarn start\",
    \"replicas\": ${REPLICAS},
    \"envVars\": {
      \"NODE_ENV\": \"production\",
      \"PORT\": \"${VIRTUAL_PORT}\"
    },
    \"labels\": {
      \"VIRTUAL_HOST\": \"${VIRTUAL_HOST}\",
      \"VIRTUAL_PORT\": \"${VIRTUAL_PORT}\",
      \"LETSENCRYPT_HOST\": \"${LETSENCRYPT_HOST}\"
    }
  }")

echo "$DEPLOY_RESPONSE" | python3 -m json.tool

# Extract job ID
JOB_ID=$(echo "$DEPLOY_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('jobId', ''))" 2>/dev/null || echo "")

if [ -z "$JOB_ID" ]; then
  echo -e "${RED}❌ Failed to get job ID from response${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Deployment initiated${NC}"
echo "Job ID: ${JOB_ID}"
echo ""

# Step 2: Monitor deployment status
echo -e "${BLUE}Step 2: Monitoring deployment status...${NC}"

MAX_ATTEMPTS=60  # 5 minutes (60 * 5 seconds)
ATTEMPT=0
STATUS=""

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  sleep 5
  ATTEMPT=$((ATTEMPT + 1))

  STATUS_RESPONSE=$(curl -s "${PROD_URL}/deployments/job/${JOB_ID}" \
    -H "X-API-Key: ${API_KEY}")

  STATUS=$(echo "$STATUS_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('status', ''))" 2>/dev/null || echo "")
  DEPLOYMENT_ID=$(echo "$STATUS_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('id', ''))" 2>/dev/null || echo "")

  echo -n "."

  if [ "$STATUS" == "RUNNING" ]; then
    echo ""
    echo -e "${GREEN}✓ Deployment is RUNNING${NC}"
    echo "Deployment ID: ${DEPLOYMENT_ID}"
    break
  elif [ "$STATUS" == "FAILED" ]; then
    echo ""
    echo -e "${RED}❌ Deployment FAILED${NC}"
    echo "$STATUS_RESPONSE" | python3 -m json.tool
    exit 1
  fi
done

if [ "$STATUS" != "RUNNING" ]; then
  echo ""
  echo -e "${RED}❌ Deployment timeout after 5 minutes${NC}"
  echo "Current status: ${STATUS}"
  exit 1
fi

echo ""

# Step 3: Get service name for verification
echo -e "${BLUE}Step 3: Verifying Docker service...${NC}"

SERVICE_INFO=$(curl -s "${PROD_URL}/deployments/${DEPLOYMENT_ID}" \
  -H "X-API-Key: ${API_KEY}")

echo "$SERVICE_INFO" | python3 -m json.tool | head -20

echo -e "${GREEN}✓ Service deployed successfully${NC}"
echo ""

# Step 4: Make environment public (if domain provided)
if [ -n "$DOMAIN" ]; then
  echo -e "${BLUE}Step 4: Making environment public with domain ${DOMAIN}...${NC}"

  # Check DNS first
  echo "Checking DNS resolution..."
  RESOLVED_IP=$(dig +short ${DOMAIN} 2>/dev/null | head -1 || echo "")

  if [ -z "$RESOLVED_IP" ]; then
    echo -e "${YELLOW}⚠ Warning: ${DOMAIN} does not resolve to an IP${NC}"
    echo "Make sure DNS A record is configured before proceeding"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      exit 1
    fi
  else
    echo -e "${GREEN}✓ DNS resolves to: ${RESOLVED_IP}${NC}"
  fi

  PUBLIC_RESPONSE=$(curl -s -X POST "${PROD_URL}/environments/${ENV_ID}/public" \
    -H "X-API-Key: ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"domain\": \"${DOMAIN}\"}")

  echo "$PUBLIC_RESPONSE" | python3 -m json.tool

  echo -e "${GREEN}✓ Environment made public${NC}"
  echo ""

  # Step 5: Wait for SSL certificate and test HTTPS
  echo -e "${BLUE}Step 5: Waiting for SSL certificate (this may take 1-2 minutes)...${NC}"

  sleep 30  # Initial wait

  SSL_ATTEMPTS=0
  SSL_MAX_ATTEMPTS=12  # 2 minutes

  while [ $SSL_ATTEMPTS -lt $SSL_MAX_ATTEMPTS ]; do
    SSL_ATTEMPTS=$((SSL_ATTEMPTS + 1))

    # Test HTTPS access
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://${DOMAIN} 2>/dev/null || echo "000")

    if [ "$HTTP_CODE" == "200" ]; then
      echo ""
      echo -e "${GREEN}✓ HTTPS is working!${NC}"
      break
    fi

    echo -n "."
    sleep 10
  done

  echo ""

  # Step 6: Verify SSL certificate
  echo -e "${BLUE}Step 6: Verifying SSL certificate...${NC}"

  SSL_INFO=$(curl -vI https://${DOMAIN} 2>&1 | grep -E "SSL certificate|subject:|issuer:" || echo "")

  if echo "$SSL_INFO" | grep -q "Let's Encrypt"; then
    echo -e "${GREEN}✓ Valid Let's Encrypt SSL certificate${NC}"
  else
    echo -e "${YELLOW}⚠ Certificate info:${NC}"
    echo "$SSL_INFO"
  fi

  echo ""

  # Step 7: Test the deployed application
  echo -e "${BLUE}Step 7: Testing deployed application...${NC}"

  RESPONSE=$(curl -s https://${DOMAIN} || echo "Failed to connect")

  if [ ${#RESPONSE} -gt 0 ] && [ "$RESPONSE" != "Failed to connect" ]; then
    echo -e "${GREEN}✓ Application is responding${NC}"
    echo "Response preview (first 200 chars):"
    echo "$RESPONSE" | head -c 200
    echo ""
  else
    echo -e "${RED}❌ Application not responding${NC}"
  fi

  echo ""

  # Step 8: View deployment logs
  echo -e "${BLUE}Step 8: Viewing deployment logs...${NC}"

  LOGS=$(curl -s "${PROD_URL}/deployments/${DEPLOYMENT_ID}/logs?tail=20" \
    -H "X-API-Key: ${API_KEY}")

  echo "$LOGS" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('logs', ''))" 2>/dev/null || echo "Failed to get logs"

  echo ""
fi

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Production Git Deployment Test Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Deployment Details:"
echo "  Job ID: ${JOB_ID}"
echo "  Deployment ID: ${DEPLOYMENT_ID}"
echo "  Status: ${STATUS}"
echo "  Git URL: ${GIT_URL}"
echo "  Branch: ${BRANCH}"
echo "  Replicas: ${REPLICAS}"

if [ -n "$DOMAIN" ]; then
  echo "  Public URL: https://${DOMAIN}"
  echo ""
  echo "Test your application:"
  echo "  curl https://${DOMAIN}"
  echo ""
  echo "View in browser:"
  echo "  https://${DOMAIN}"
else
  echo "  Access: Internal only (no public domain)"
  echo ""
  echo "To make it public, run:"
  echo "  DOMAIN=your-domain.wrytes.io ENV_ID=${ENV_ID} ./tests/prod-deploy-from-git.sh"
fi

echo ""
echo "Useful commands:"
echo "  View logs: curl '${PROD_URL}/deployments/${DEPLOYMENT_ID}/logs?tail=50' -H 'X-API-Key: ${API_KEY}'"
echo "  Check status: curl '${PROD_URL}/deployments/${DEPLOYMENT_ID}' -H 'X-API-Key: ${API_KEY}'"
echo "  Delete deployment: curl -X DELETE '${PROD_URL}/deployments/${DEPLOYMENT_ID}' -H 'X-API-Key: ${API_KEY}'"
echo ""
