# Production Deployment Guide

This guide covers deploying the Deployment Platform on a production server with automatic service startup and deployment recovery.

## Table of Contents

- [Server Requirements](#server-requirements)
- [Initial Setup](#initial-setup)
- [Environment Configuration](#environment-configuration)
- [Starting the System](#starting-the-system)
- [Systemd Service Management](#systemd-service-management)
- [Monitoring and Logs](#monitoring-and-logs)
- [Deployment Recovery](#deployment-recovery)
- [Backup Procedures](#backup-procedures)
- [Disaster Recovery](#disaster-recovery)
- [Troubleshooting](#troubleshooting)

## Server Requirements

### Minimum Specifications
- **OS:** Ubuntu 20.04+ or Debian 11+ (systemd-based)
- **RAM:** 4GB minimum, 8GB recommended
- **CPU:** 2 cores minimum, 4 cores recommended
- **Storage:** 20GB minimum, 50GB+ recommended
- **Network:** Public IP address with ports 80 and 443 open

### Required Software
- Docker Engine 24.0+
- Docker Compose v2
- systemd (included in Ubuntu/Debian)
- Git

### Installing Docker

```bash
# Update package index
sudo apt-get update

# Install prerequisites
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up the repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

## Initial Setup

### 1. Clone Repository

```bash
# Create application directory
sudo mkdir -p /opt/deployment-platform
sudo chown $USER:$USER /opt/deployment-platform

# Clone repository
cd /opt
git clone <your-repo-url> deployment-platform
cd deployment-platform/backend
```

### 2. Create Environment File

```bash
# Copy example environment file
cp .env.example .env

# Edit with your configuration
nano .env
```

See [Environment Configuration](#environment-configuration) for details on each variable.

### 3. Run Startup Script

The `startup.sh` script handles everything:
- Checks prerequisites
- Initializes Docker Swarm
- Builds and starts services
- Runs database migrations
- Installs systemd service
- Verifies system health

```bash
chmod +x startup.sh
./startup.sh
```

**Expected output:**
```
🚀 Deployment Platform - Initial Setup
======================================

Checking prerequisites...
✓ Prerequisites met

Initializing Docker Swarm...
✓ Docker Swarm initialized

Building and starting services...
[build output...]

Running database migrations...
✓ Migrations applied

Installing systemd service...
✓ Systemd service installed and enabled

Verifying system health...
✓ System is healthy

======================================
✓ Initial setup completed!
======================================
```

## Environment Configuration

### Required Variables

```bash
# Application
NODE_ENV=production
PORT=3030
API_KEY_SECRET=<generate-random-32char-string>

# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<secure-password>
POSTGRES_DB=deployment_platform
DATABASE_URL=postgresql://postgres:<password>@postgres:5432/deployment_platform?schema=public

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<secure-password>

# Docker
DOCKER_SOCKET_PATH=/var/run/docker.sock
DOCKER_SWARM_ADVERTISE_ADDR=<your-server-public-ip>
NGINX_CONTAINER_NAME=nginx_proxy

# Telegram
TELEGRAM_BOT_TOKEN=<from-botfather>
TELEGRAM_WEBHOOK_DOMAIN=<your-domain.com>
TELEGRAM_WEBHOOK_PATH=/telegram/webhook

# Let's Encrypt
LETSENCRYPT_EMAIL=<your-email@example.com>
LETSENCRYPT_HOST=<your-domain.com>
VIRTUAL_HOST=<your-domain.com>
VIRTUAL_PORT=3030
```

### Optional Variables

```bash
# Logging
LOG_LEVEL=info  # fatal, error, warn, info, debug, trace
LOG_PRETTY=false

# Rate Limiting
THROTTLE_TTL=60  # seconds
THROTTLE_LIMIT=100  # requests per TTL

# Startup Recovery
ENABLE_DEPLOYMENT_RECOVERY=true  # Auto-restart deployments on startup
```

### Generating Secure Secrets

```bash
# Generate API_KEY_SECRET (32+ characters)
openssl rand -hex 32

# Generate database password
openssl rand -base64 24

# Generate Redis password
openssl rand -base64 24
```

## Starting the System

### First Time (via startup.sh)

```bash
cd /opt/deployment-platform/backend
./startup.sh
```

### Manual Start (Docker Compose)

```bash
cd /opt/deployment-platform/backend
docker compose -f docker-compose.prod.yml up -d
```

### After Server Reboot

**No action needed!** The systemd service automatically starts on boot.

## Systemd Service Management

The deployment platform runs as a systemd service for automatic startup and management.

### Check Service Status

```bash
sudo systemctl status deployment-platform
```

**Example output:**
```
● deployment-platform.service - Deployment Platform - Docker Swarm Deployment System
     Loaded: loaded (/etc/systemd/system/deployment-platform.service; enabled)
     Active: active (exited) since Mon 2026-02-15 10:00:00 UTC; 1h ago
```

### Start Service

```bash
sudo systemctl start deployment-platform
```

### Stop Service

```bash
sudo systemctl stop deployment-platform
```

### Restart Service

```bash
sudo systemctl restart deployment-platform
```

### Enable Auto-Start (already done by startup.sh)

```bash
sudo systemctl enable deployment-platform
```

### Disable Auto-Start

```bash
sudo systemctl disable deployment-platform
```

## Monitoring and Logs

### Systemd Journal Logs

```bash
# Follow logs in real-time
sudo journalctl -u deployment-platform -f

# View last 100 lines
sudo journalctl -u deployment-platform -n 100

# View logs since boot
sudo journalctl -u deployment-platform -b

# View logs for specific date
sudo journalctl -u deployment-platform --since "2026-02-15"
```

### Docker Compose Logs

```bash
cd /opt/deployment-platform/backend

# Follow all service logs
docker compose -f docker-compose.prod.yml logs -f

# Follow specific service
docker compose -f docker-compose.prod.yml logs -f backend

# View last 100 lines
docker compose -f docker-compose.prod.yml logs --tail=100
```

### Container Status

```bash
# List all containers
docker compose -f docker-compose.prod.yml ps

# Check service health
docker compose -f docker-compose.prod.yml ps backend
```

### System Health Check

```bash
# Check API health
curl http://localhost:3000/health

# Expected response: {"status":"ok"}
```

### Docker Swarm Services

```bash
# List all swarm services (deployments)
docker service ls

# Inspect specific service
docker service inspect <service-name>

# View service logs
docker service logs <service-name>
```

## Deployment Recovery

The system automatically recovers running deployments after backend restarts.

### How It Works

1. **On Backend Startup:**
   - Queries database for all deployments with `status = RUNNING`
   - Checks if corresponding Docker Swarm services exist
   - Recreates missing services with original configuration

2. **Error Handling:**
   - If service restart fails, deployment status updates to `FAILED`
   - Errors are logged but don't prevent backend startup
   - Telegram notifications sent on recovery failures

3. **Network Recovery:**
   - Automatically recreates overlay networks if missing
   - Validates network connectivity before service restart

### Disabling Recovery

To disable automatic deployment recovery (e.g., during maintenance):

```bash
# Edit .env file
nano .env

# Set to false
ENABLE_DEPLOYMENT_RECOVERY=false

# Restart backend
sudo systemctl restart deployment-platform
```

### Testing Recovery

```bash
# 1. Create a test deployment via Telegram or API
# 2. Manually remove the Docker service
docker service rm <service-name>

# 3. Restart backend to trigger recovery
sudo systemctl restart deployment-platform

# 4. Check logs to verify recovery
sudo journalctl -u deployment-platform -f

# 5. Verify service was recreated
docker service ls | grep <service-name>
```

## Backup Procedures

### Database Backup

```bash
# Create backup directory
mkdir -p /opt/deployment-platform/backups

# Backup database
docker exec deployment_platform_postgres pg_dump \
  -U postgres deployment_platform \
  > /opt/deployment-platform/backups/db-$(date +%Y%m%d-%H%M%S).sql

# Compress backup
gzip /opt/deployment-platform/backups/db-*.sql
```

### Automated Daily Backups

Add to crontab:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * docker exec deployment_platform_postgres pg_dump -U postgres deployment_platform | gzip > /opt/deployment-platform/backups/db-$(date +\%Y\%m\%d).sql.gz

# Keep only last 7 days
0 3 * * * find /opt/deployment-platform/backups -name "db-*.sql.gz" -mtime +7 -delete
```

### Volume Backup

```bash
# Backup PostgreSQL volume
docker run --rm \
  -v deployment_platform_postgres_data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/postgres-data-$(date +%Y%m%d).tar.gz /data

# Backup Redis volume
docker run --rm \
  -v deployment_platform_redis_data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/redis-data-$(date +%Y%m%d).tar.gz /data
```

### Configuration Backup

```bash
# Backup .env file (contains sensitive data!)
cp .env backups/env-$(date +%Y%m%d).backup

# Set restrictive permissions
chmod 600 backups/env-*.backup
```

## Disaster Recovery

### Restoring from Backup

**1. Stop services:**
```bash
sudo systemctl stop deployment-platform
```

**2. Restore database:**
```bash
# Copy backup to container
docker cp backups/db-20260215.sql.gz deployment_platform_postgres:/tmp/

# Restore
docker exec deployment_platform_postgres bash -c \
  "gunzip < /tmp/db-20260215.sql.gz | psql -U postgres deployment_platform"
```

**3. Restart services:**
```bash
sudo systemctl start deployment-platform
```

### Complete System Rebuild

**1. Clone repository on new server:**
```bash
cd /opt
git clone <repo-url> deployment-platform
cd deployment-platform/backend
```

**2. Restore .env file:**
```bash
# Copy from backup
cp /path/to/env-backup .env
```

**3. Restore database backup:**
```bash
# Place backup in backups directory
mkdir backups
cp /path/to/db-backup.sql.gz backups/
```

**4. Run startup script:**
```bash
./startup.sh
```

**5. Restore database:**
```bash
docker cp backups/db-backup.sql.gz deployment_platform_postgres:/tmp/
docker exec deployment_platform_postgres bash -c \
  "gunzip < /tmp/db-backup.sql.gz | psql -U postgres deployment_platform"
```

**6. Restart to trigger deployment recovery:**
```bash
sudo systemctl restart deployment-platform
```

## Troubleshooting

### Services Won't Start

**Check Docker daemon:**
```bash
sudo systemctl status docker
sudo systemctl start docker
```

**Check environment file:**
```bash
cd /opt/deployment-platform/backend
test -f .env && echo "✓ .env exists" || echo "✗ .env missing"
```

**Check Docker Swarm:**
```bash
docker info | grep "Swarm:"
# Should show: Swarm: active

# If not active, initialize:
docker swarm init --advertise-addr <your-server-ip>
```

### Database Connection Errors

**Check PostgreSQL container:**
```bash
docker compose -f docker-compose.prod.yml ps postgres
docker compose -f docker-compose.prod.yml logs postgres
```

**Verify DATABASE_URL:**
```bash
# Should match POSTGRES_USER and POSTGRES_PASSWORD
grep DATABASE_URL .env
```

**Test connection:**
```bash
docker exec deployment_platform_postgres psql \
  -U postgres -d deployment_platform -c "SELECT 1"
```

### Deployment Recovery Fails

**Check logs:**
```bash
sudo journalctl -u deployment-platform -f | grep -i recovery
```

**Verify network exists:**
```bash
docker network ls | grep overlay
```

**Manually recreate network:**
```bash
docker network create --driver overlay <network-name>
```

**Disable recovery temporarily:**
```bash
echo "ENABLE_DEPLOYMENT_RECOVERY=false" >> .env
sudo systemctl restart deployment-platform
```

### Port Conflicts

**Check if ports are in use:**
```bash
sudo lsof -i :80
sudo lsof -i :443
sudo lsof -i :3000
```

**Kill conflicting processes:**
```bash
sudo systemctl stop nginx  # If nginx is running
sudo systemctl disable nginx
```

### Systemd Service Not Starting

**Check service file:**
```bash
sudo systemctl cat deployment-platform
```

**Reload systemd daemon:**
```bash
sudo systemctl daemon-reload
```

**View detailed logs:**
```bash
sudo journalctl -u deployment-platform -xe
```

### Out of Disk Space

**Check disk usage:**
```bash
df -h
docker system df
```

**Clean up Docker:**
```bash
# Remove unused containers, images, networks
docker system prune -a

# Remove unused volumes (careful!)
docker volume prune
```

**Clean up old backups:**
```bash
find /opt/deployment-platform/backups -mtime +30 -delete
```

### SSL Certificate Issues

**Check Let's Encrypt companion logs:**
```bash
docker compose -f docker-compose.prod.yml logs letsencrypt
```

**Verify domain DNS:**
```bash
dig +short your-domain.com
# Should return your server's IP
```

**Check nginx-proxy logs:**
```bash
docker compose -f docker-compose.prod.yml logs nginx-proxy
```

### High Memory Usage

**Check resource usage:**
```bash
docker stats
```

**Adjust resource limits in docker-compose.prod.yml:**
```yaml
deploy:
  resources:
    limits:
      cpus: '1'
      memory: 512M
```

**Restart services:**
```bash
sudo systemctl restart deployment-platform
```

## Security Recommendations

1. **Use strong passwords** for all database and Redis credentials
2. **Enable firewall** and only allow ports 22, 80, 443
3. **Regular updates** - keep Docker and OS packages updated
4. **Backup encryption** - encrypt sensitive backups
5. **SSH key authentication** - disable password authentication
6. **Monitor logs** - set up log monitoring/alerting
7. **Regular backups** - automate daily backups to external storage

## Support and Updates

### Updating the Platform

```bash
cd /opt/deployment-platform
git pull origin main
cd backend
docker compose -f docker-compose.prod.yml build
sudo systemctl restart deployment-platform
```

### Getting Help

- Check logs first: `sudo journalctl -u deployment-platform -f`
- Review this documentation
- Check GitHub issues
- Contact support team

---

**Last Updated:** 2026-02-15
**Version:** 1.0.0
