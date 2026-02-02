# Docker Swarm Deployment Platform

A single-machine Docker Swarm deployment platform with NestJS backend, Prisma ORM, Telegram bot integration, and MCP server support.

## Features

- **Isolated Environments**: Per-environment overlay networks with security hardening
- **Automated SSL**: Let's Encrypt integration via Nginx reverse proxy
- **API Key Authentication**: Secure access via Telegram magic links
- **MCP Server**: Claude Code integration for AI-powered deployments
- **Real-time Monitoring**: Container health checks and log streaming
- **Telegram Bot**: User-friendly management interface

## Tech Stack

- **Backend**: NestJS + Prisma ORM
- **Database**: PostgreSQL
- **Cache**: Redis
- **Orchestration**: Docker Swarm (single machine)
- **Reverse Proxy**: Nginx with Let's Encrypt
- **Bot**: Telegram via Telegraf
- **MCP**: @rekog/mcp-nest

## Quick Start

### Development

```bash
# Install dependencies
cd backend
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Start services
docker-compose up -d

# Run migrations
npx prisma migrate dev

# Start backend
npm run start:dev
```

### Production

```bash
# Configure environment
cp .env.example .env.production
# Edit .env.production

# Deploy
./deploy.sh
```

## Architecture

### Network Isolation
- Each environment gets a private overlay network
- Containers are attached only to their environment's network
- Nginx dynamically attaches/detaches from overlays for public access

### Security
- `cap_drop: ALL` on all containers
- `no-new-privileges` security option
- Read-only root filesystem where possible
- API key-based authentication with scopes

### Deployment Flow
1. User creates environment → isolated overlay network created
2. User deploys containers → attached to private network
3. User enables public access → Nginx attaches and configures SSL

## API Documentation

### Authentication
All API requests require `X-API-Key` header with format: `rw_prod_{keyId}.{secret}`

### Endpoints
- `POST /environments` - Create isolated environment
- `POST /deployments` - Deploy container to environment
- `POST /environments/:id/public` - Enable public access with SSL
- `GET /deployments/job/:jobId` - Poll deployment status

## MCP Tools

- `create_environment` - Create isolated environment
- `create_deployment` - Deploy container
- `get_deployment_status` - Check deployment progress
- `make_environment_public` - Enable public access

## License

MIT
