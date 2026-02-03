#!/bin/bash
set -e

echo "🚀 Docker Swarm Deployment Platform - Production Deployment"
echo "==========================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker is installed${NC}"

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}Error: Docker daemon is not running${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker daemon is running${NC}"

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    echo -e "${RED}Error: .env.production not found${NC}"
    echo -e "${YELLOW}Please create .env.production with your production configuration${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Environment configuration found${NC}"

# Initialize Docker Swarm if not already initialized
SWARM_STATUS=$(docker info --format '{{.Swarm.LocalNodeState}}')

if [ "$SWARM_STATUS" != "active" ]; then
    echo "Initializing Docker Swarm..."

    # Get server IP
    SERVER_IP=$(hostname -I | awk '{print $1}')
    echo "Using advertise address: $SERVER_IP"

    docker swarm init --advertise-addr "$SERVER_IP"
    echo -e "${GREEN}✓ Docker Swarm initialized${NC}"
else
    echo -e "${GREEN}✓ Docker Swarm is already active${NC}"
fi

# Build and start services
echo ""
echo "Building and starting services..."
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "Waiting for services to be healthy..."
sleep 10

# Run database migrations
echo ""
echo "Running database migrations..."
docker compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy

echo ""
echo -e "${GREEN}==========================================================="
echo "✓ Deployment completed successfully!"
echo "===========================================================${NC}"
echo ""
echo "Services:"
echo "  - Backend API: http://localhost:3000"
echo "  - Health Check: http://localhost:3000/health"
echo "  - Nginx Proxy: http://localhost:80 (HTTP) / https://localhost:443 (HTTPS)"
echo ""
echo "To view logs:"
echo "  docker compose -f docker-compose.prod.yml logs -f"
echo ""
echo "To stop services:"
echo "  docker compose -f docker-compose.prod.yml down"
echo ""
echo "Next steps:"
echo "  1. Configure your Telegram bot token in .env.production"
echo "  2. Update DNS records to point your domain to this server"
echo "  3. Test the deployment with /start in your Telegram bot"
