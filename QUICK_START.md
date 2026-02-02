# Quick Start Guide

This guide will help you get the Docker Swarm Deployment Platform up and running in under 10 minutes.

## Prerequisites

- Docker 24+ with Docker Compose V2
- Node.js 20+ (for local development)
- A Telegram account (for bot authentication)
- A server with a public IP (for production)

## Option 1: Local Development

### 1. Clone and Setup

```bash
cd deployment-system/backend

# Install dependencies
npm install

# Start PostgreSQL and Redis
docker compose up -d

# Wait for services to be healthy (about 30 seconds)
docker compose ps
```

### 2. Configure Environment

```bash
# The .env file is already created, but you can customize it
nano .env

# Required changes:
# - Set DOCKER_SWARM_ADVERTISE_ADDR to your machine's IP
# - Add TELEGRAM_BOT_TOKEN if you want Telegram integration
```

### 3. Initialize Database

```bash
# Migrations are already run, but verify
npx prisma migrate status

# Optionally view database in Prisma Studio
npx prisma studio
```

### 4. Start Backend

```bash
npm run start:dev
```

### 5. Verify Installation

```bash
# Check health endpoint
curl http://localhost:3000/health

# Should return:
# {
#   "status": "ok",
#   "info": { "database": { "status": "up" }, ... }
# }
```

## Option 2: Production Deployment

### 1. Prepare Server

```bash
# SSH into your server
ssh user@your-server.com

# Install Docker if not already installed
curl -fsSL https://get.docker.com | sh

# Add your user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Clone Repository

```bash
git clone <your-repo-url> deployment-system
cd deployment-system
```

### 3. Configure Production Environment

```bash
# Copy example environment file
cp .env.production.example backend/.env.production

# Edit with your settings
nano backend/.env.production
```

**Required Configuration**:
```bash
# Change these values!
API_KEY_SECRET=your-random-32-character-secret-here
POSTGRES_PASSWORD=secure-postgres-password
REDIS_PASSWORD=secure-redis-password

# Your server's IP address
DOCKER_SWARM_ADVERTISE_ADDR=1.2.3.4

# Telegram bot token from @BotFather
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11

# Your domain for webhook
TELEGRAM_WEBHOOK_DOMAIN=api.yourdomain.com

# SSL certificate email
LETSENCRYPT_EMAIL=admin@yourdomain.com

# Use production SSL (not staging)
LETSENCRYPT_STAGING=false
```

### 4. Deploy

```bash
# Make deploy script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

The script will:
- ✓ Check Docker installation
- ✓ Initialize Docker Swarm
- ✓ Build all services
- ✓ Start containers
- ✓ Run database migrations
- ✓ Display service status

### 5. Verify Deployment

```bash
# Check all services are running
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose -f docker-compose.prod.yml logs -f backend

# Test health endpoint
curl http://localhost:3000/health
```

## Using the Platform

### 1. Set Up Telegram Bot

1. Open Telegram and search for your bot
2. Send `/start` to create your account
3. Send `/api_create` to get a magic link
4. Click the link to receive your API key

**Example API Key**: `rw_prod_Kx8vN2mQp3zY7wL1.yH4jR6uT9sA2nP5xC8bV1mZ3kW7fD0gE4lQ6`

### 2. Create Your First Environment

```bash
# Save your API key as an environment variable
export API_KEY="rw_prod_..."

# Create environment
curl -X POST http://localhost:3000/environments \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "production"}'

# Save the environment ID
export ENV_ID="clx..."
```

### 3. Deploy a Container

```bash
# Deploy nginx
curl -X POST http://localhost:3000/deployments \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "environmentId": "'$ENV_ID'",
    "image": "nginx",
    "tag": "alpine",
    "replicas": 1,
    "ports": [{"container": 80, "host": 8080}]
  }'

# Save the job ID
export JOB_ID="abc123xyz789"
```

### 4. Check Deployment Status

```bash
# Poll status (repeat until status is RUNNING)
curl http://localhost:3000/deployments/job/$JOB_ID \
  -H "X-API-Key: $API_KEY" | jq '.deployment.status'

# Get full deployment details
curl http://localhost:3000/deployments/job/$JOB_ID \
  -H "X-API-Key: $API_KEY" | jq .
```

### 5. Make Environment Public (Optional)

```bash
# Enable HTTPS access with automatic SSL
curl -X POST http://localhost:3000/environments/$ENV_ID/public \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain": "myapp.example.com"}'

# Wait for SSL certificate (may take 1-2 minutes)
# Then access: https://myapp.example.com
```

### 6. View Logs

```bash
# Get deployment ID from status check
export DEPLOYMENT_ID="clx..."

# View logs (last 100 lines)
curl http://localhost:3000/deployments/$DEPLOYMENT_ID/logs?tail=100 \
  -H "X-API-Key: $API_KEY"
```

## Using MCP Tools (for AI Agents)

The platform includes MCP (Model Context Protocol) endpoints for AI agent integration:

```bash
# List available tools
curl -X POST http://localhost:3000/mcp/tools/list \
  -H "X-API-Key: $API_KEY"

# Create environment via MCP
curl -X POST http://localhost:3000/mcp/tools/create_environment \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "ai-managed-env"}'

# Create deployment via MCP
curl -X POST http://localhost:3000/mcp/tools/create_deployment \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "environmentId": "clx...",
    "image": "nginx",
    "tag": "alpine"
  }'
```

## Telegram Bot Commands

All commands are available in your Telegram bot:

- `/start` - Initialize your account
- `/api_create` - Generate new API key
- `/api_list` - List your active API keys
- `/api_revoke <keyId>` - Revoke specific API key
- `/help` - Show help message

## Troubleshooting

### Backend Won't Start

```bash
# Check logs
docker compose logs -f backend

# Common issues:
# 1. PostgreSQL not ready - wait 30 seconds
# 2. Prisma migration needed - run: npx prisma migrate deploy
# 3. Port 3000 in use - change PORT in .env
```

### Docker Swarm Not Initialized

```bash
# Check Swarm status
docker info | grep Swarm

# Initialize manually if needed
docker swarm init --advertise-addr $(hostname -I | awk '{print $1}')
```

### SSL Certificate Fails

```bash
# Check nginx logs
docker compose logs nginx

# Common issues:
# 1. Domain not pointing to server - update DNS records
# 2. Port 80/443 blocked - open firewall ports
# 3. Using staging mode - set LETSENCRYPT_STAGING=false
```

### Container Won't Start

```bash
# Check Docker Swarm services
docker service ls

# Get service logs
docker service logs <service-name>

# Common issues:
# 1. Image pull failed - check registry access
# 2. Port conflict - use different host port
# 3. Network issue - check overlay network exists
```

### API Key Not Working

```bash
# Verify API key format
echo $API_KEY
# Should be: rw_prod_<16chars>.<32chars>

# Check key in database
docker compose exec backend npx prisma studio

# Generate new key via Telegram bot
# Send: /api_create
```

## Environment Variables Reference

### Required

- `API_KEY_SECRET` - Secret for API key generation (min 32 chars)
- `DATABASE_URL` - PostgreSQL connection string
- `DOCKER_SWARM_ADVERTISE_ADDR` - Server IP address

### Optional

- `TELEGRAM_BOT_TOKEN` - Telegram bot token from @BotFather
- `TELEGRAM_WEBHOOK_DOMAIN` - Domain for Telegram webhook
- `LETSENCRYPT_EMAIL` - Email for SSL certificates
- `LETSENCRYPT_STAGING` - Use staging SSL (default: true)
- `REDIS_PASSWORD` - Redis password (production)
- `LOG_LEVEL` - Logging level (debug, info, warn, error)

## Next Steps

1. **Deploy a real application**: Try deploying your own Docker image
2. **Set up monitoring**: Add logging aggregation and metrics
3. **Configure DNS**: Point your domain to the server
4. **Enable SSL**: Use production Let's Encrypt certificates
5. **Scale up**: Increase replica count for high availability

## Support

- **Documentation**: See README.md and IMPLEMENTATION_SUMMARY.md
- **Health Check**: http://localhost:3000/health
- **API Docs**: All endpoints are RESTful and self-explanatory
- **Database UI**: Run `npx prisma studio` for visual database access

## Security Checklist

Before going to production:

- [ ] Change all default passwords in .env.production
- [ ] Use strong API_KEY_SECRET (32+ random characters)
- [ ] Enable HTTPS (set LETSENCRYPT_STAGING=false)
- [ ] Configure firewall (allow 80, 443; restrict 3000, 5432, 6379)
- [ ] Set up backups for PostgreSQL data
- [ ] Review Docker socket access (consider Unix socket permissions)
- [ ] Enable Redis authentication
- [ ] Configure rate limiting appropriately
- [ ] Test disaster recovery procedures

## Performance Tips

- **Resource Limits**: Adjust CPU/memory limits in docker-compose.prod.yml
- **Database**: Configure PostgreSQL connection pooling
- **Redis**: Use Redis for session storage and caching
- **Nginx**: Enable gzip compression and caching
- **Swarm**: Consider multi-node setup for production

---

You're now ready to use the Docker Swarm Deployment Platform! 🚀
