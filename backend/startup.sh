#!/bin/bash
set -e

echo "🚀 Deployment Platform - Initial Setup"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Check prerequisites
echo ""
echo "Checking prerequisites..."
command -v docker &> /dev/null || { echo -e "${RED}❌ Docker not installed${NC}"; exit 1; }
docker info &> /dev/null || { echo -e "${RED}❌ Docker daemon not running${NC}"; exit 1; }
[ -f ".env" ] || { echo -e "${RED}❌ .env file not found${NC}"; exit 1; }
echo -e "${GREEN}✓ Prerequisites met${NC}"

# 2. Initialize Docker Swarm
echo ""
echo "Initializing Docker Swarm..."
SWARM_STATUS=$(docker info --format '{{.Swarm.LocalNodeState}}')
if [ "$SWARM_STATUS" != "active" ]; then
    SERVER_IP=$(hostname -I | awk '{print $1}')
    docker swarm init --advertise-addr "$SERVER_IP"
    echo -e "${GREEN}✓ Docker Swarm initialized${NC}"
else
    echo -e "${GREEN}✓ Docker Swarm already active${NC}"
fi

# 3. Build and start services
echo ""
echo "Building and starting services..."
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d --wait

# 4. Wait for services to be healthy
echo ""
echo "Waiting for services to be healthy..."
sleep 15

# 5. Run database migrations
echo ""
echo "Running database migrations..."
docker compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy

# 6. Install systemd service
echo ""
echo "Installing systemd service..."
if command -v systemctl &> /dev/null; then
    sudo cp deployment-platform.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable deployment-platform
    echo -e "${GREEN}✓ Systemd service installed and enabled${NC}"
else
    echo -e "${YELLOW}⚠ systemctl not found, skipping systemd service installation${NC}"
fi

# 7. Verify health
echo ""
echo "Verifying system health..."
sleep 5
if curl -f http://localhost:3000/health &> /dev/null; then
    echo -e "${GREEN}✓ System is healthy${NC}"
else
    echo -e "${YELLOW}⚠ Health check warning (may need more time)${NC}"
fi

# 8. Show status
echo ""
echo -e "${GREEN}======================================"
echo "✓ Initial setup completed!"
echo "======================================${NC}"
echo ""
echo "Services are now running and will auto-start on boot"
echo ""
echo "Useful commands:"
echo "  Check status:  sudo systemctl status deployment-platform"
echo "  View logs:     sudo journalctl -u deployment-platform -f"
echo "  Restart:       sudo systemctl restart deployment-platform"
echo "  Stop:          sudo systemctl stop deployment-platform"
echo ""
echo "Docker Compose (direct access):"
echo "  View logs:     docker compose -f docker-compose.prod.yml logs -f"
echo "  Check status:  docker compose -f docker-compose.prod.yml ps"
echo ""
echo "Next steps:"
echo "  1. Update DNS to point your domain(s) to this server"
echo "  2. Test via Telegram bot: /start"
echo "  3. Create your first environment and deployment"
echo ""
