# Production Testing Guide

## ✅ Prerequisites

Before testing, ensure:
- Backend is deployed and running on production server
- DNS points `deployment.wrytes.io` to your server IP
- SSL certificates are generated (Let's Encrypt)
- Telegram bot is configured and responding

## 🔍 Verify System Status

### Check All Services Are Running

```bash
# SSH into production server
ssh user@your-server-ip

# Check Docker Compose services
cd /opt/deployment-platform/backend
docker compose -f docker-compose.prod.yml ps

# All should show "Up" and "healthy"
```

### Check System Health

```bash
curl https://deployment.wrytes.io/health | jq .
```

Expected response:
```json
{
  "status": "ok",
  "database": "connected",
  "memory": "healthy",
  "disk": "healthy"
}
```

## 🔑 Get an API Key

### Via Telegram Bot

1. Open Telegram and find your bot: `@your_bot_name`
2. Send `/start` to initialize your account
3. Send `/api_create` to generate an API key
4. Click the magic link (should be `https://deployment.wrytes.io/auth/verify?token=...`)
5. Copy the API key from the response

### Test API Access

```bash
# Set your API key (use your actual key)
export API_KEY="dpk_xxxxxxxxxxxxxxxx"

# Test health endpoint (no auth required)
curl https://deployment.wrytes.io/health | jq .

# Test root endpoint (no auth required)
curl https://deployment.wrytes.io/ | jq .

# List your API keys (requires auth)
curl https://deployment.wrytes.io/auth/keys \
  -H "X-API-Key: $API_KEY" | jq .
```

## 📚 API Documentation

Visit: https://deployment.wrytes.io/api/docs

Interactive Swagger UI for testing all endpoints.

## 🧪 Test Core Functionality

### 1. Create an Environment

```bash
curl -X POST https://deployment.wrytes.io/environments \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "production-test"}' | jq .
```

Save the `id` from the response.

**Example response:**
```json
{
  "id": "clxxxx",
  "name": "production-test",
  "status": "CREATING",
  "isPublic": false,
  "overlayNetworkId": "overlay_env_production-test_xxx"
}
```

### 2. List Environments

```bash
curl https://deployment.wrytes.io/environments \
  -H "X-API-Key: $API_KEY" | jq .
```

### 3. Deploy a Container

```bash
# Replace {environmentId} with your environment ID
export ENV_ID="clxxxx"

curl -X POST https://deployment.wrytes.io/deployments \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "environmentId": "'"$ENV_ID"'",
    "image": "nginx",
    "tag": "alpine",
    "replicas": 1,
    "envVars": {"NGINX_PORT": "80"}
  }' | jq .
```

Save the `jobId` to check deployment status.

### 4. Check Deployment Status

```bash
# Replace {jobId} with your job ID
export JOB_ID="xxxxxxxxxxxxxxxx"

curl "https://deployment.wrytes.io/deployments/job/$JOB_ID" \
  -H "X-API-Key: $API_KEY" | jq .
```

Watch the status change:
- `PENDING` → `PULLING_IMAGE` → `STARTING_CONTAINERS` → `RUNNING`

### 5. List Deployments in Environment

```bash
curl "https://deployment.wrytes.io/deployments/environment/$ENV_ID" \
  -H "X-API-Key: $API_KEY" | jq .
```

### 6. Get Deployment Logs

```bash
# Get deployment ID from previous response
export DEPLOYMENT_ID="clxxxx"

curl "https://deployment.wrytes.io/deployments/$DEPLOYMENT_ID/logs?tail=50" \
  -H "X-API-Key: $API_KEY" | jq .
```

### 7. Test Deployed Service (Internal - Not Public Yet)

```bash
# SSH into production server
ssh user@your-server-ip

# Find the Docker service name
docker service ls | grep nginx

# Check service is running
docker service ps {service-name}

# Access via overlay network (internal testing)
# Get service's virtual IP
docker service inspect {service-name} --format '{{.Endpoint.VirtualIPs}}'
```

**Note:** At this point, the service is running but NOT publicly accessible. Continue to step 8 to make it public.

### 8. Make Environment Public

```bash
# Make environment publicly accessible with HTTPS
curl -X POST "https://deployment.wrytes.io/environments/$ENV_ID/public" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "test-app.wrytes.io"
  }' | jq .
```

**Requirements:**
- DNS A record: `test-app.wrytes.io` → your server IP
- Wait 1-2 minutes for SSL certificate generation

### 9. Test Public HTTPS Access

```bash
# Wait 2 minutes for SSL cert, then test
curl https://test-app.wrytes.io

# Should return nginx welcome page
```

**Verify SSL:**
```bash
curl -vI https://test-app.wrytes.io 2>&1 | grep "SSL certificate"
# Should show valid certificate from Let's Encrypt
```

### 10. Update Deployment

```bash
# Change to different nginx version
curl -X PATCH "https://deployment.wrytes.io/deployments/$DEPLOYMENT_ID" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tag": "latest",
    "replicas": 2
  }' | jq .
```

### 11. Delete Deployment

```bash
curl -X DELETE "https://deployment.wrytes.io/deployments/$DEPLOYMENT_ID" \
  -H "X-API-Key: $API_KEY" | jq .
```

Verify:
```bash
# On production server
docker service ls | grep nginx
# Should show no results
```

### 12. Delete Environment

```bash
curl -X DELETE "https://deployment.wrytes.io/environments/$ENV_ID" \
  -H "X-API-Key: $API_KEY" | jq .
```

This will:
- Stop all deployments
- Remove Docker Swarm services
- Delete overlay network
- Clean up all resources

## 🚀 Deploy from Git Repository

### Deploy a Node.js App

```bash
# Create new environment first
export ENV_ID=$(curl -X POST https://deployment.wrytes.io/environments \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "nodejs-app"}' | jq -r '.id')

# Deploy from Git
curl -X POST https://deployment.wrytes.io/deployments/from-git \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "environmentId": "'"$ENV_ID"'",
    "gitUrl": "https://github.com/your-username/your-app.git",
    "branch": "main",
    "baseImage": "node:18-alpine",
    "installCommand": "npm install",
    "buildCommand": "npm run build",
    "startCommand": "npm start",
    "replicas": 2,
    "envVars": {
      "NODE_ENV": "production",
      "PORT": "3000"
    }
  }' | jq .
```

## 🔒 Test Security

### 1. Test Webhook Secret Token

```bash
# Try to POST to webhook without secret (should fail)
curl -X POST https://deployment.wrytes.io/telegram/webhook \
  -H "Content-Type: application/json" \
  -d '{"message": "fake"}' \
  -w "\nHTTP Status: %{http_code}\n"

# Should return: 401 Unauthorized
```

### 2. Test API Key Validation

```bash
# Try without API key (should fail)
curl https://deployment.wrytes.io/environments \
  -w "\nHTTP Status: %{http_code}\n"

# Should return: 401 Unauthorized

# Try with invalid API key (should fail)
curl https://deployment.wrytes.io/environments \
  -H "X-API-Key: invalid_key" \
  -w "\nHTTP Status: %{http_code}\n"

# Should return: 401 Unauthorized
```

### 3. Test Rate Limiting

```bash
# Make 150 requests quickly (limit is 100/minute)
for i in {1..150}; do
  curl -s https://deployment.wrytes.io/health > /dev/null
  echo "Request $i"
done

# After ~100 requests, should see:
# HTTP Status: 429 Too Many Requests
```

## 🔄 Test Auto-Recovery

### 1. Simulate Service Crash

```bash
# SSH into production server
ssh user@your-server-ip

# Create a test deployment first (via API as shown above)
# Then manually remove the Docker service
docker service rm {service-name}

# Restart backend to trigger recovery
docker compose -f docker-compose.prod.yml restart backend

# Watch logs
docker compose -f docker-compose.prod.yml logs -f backend | grep -i recovery

# Should see:
# "Service {name} not found, restarting..."
# "Successfully recovered deployment {id}"

# Verify service was recreated
docker service ls
```

### 2. Test Server Reboot

```bash
# On production server
sudo reboot

# Wait 2-3 minutes, then SSH back in
ssh user@your-server-ip

# Verify systemd auto-started everything
sudo systemctl status deployment-platform

# Should show: Active: active (exited)

# Verify deployments recovered
docker service ls

# Test API still works
curl https://deployment.wrytes.io/health | jq .
```

## 📊 Monitoring & Logs

### Backend Logs

```bash
# On production server
# Via systemd
sudo journalctl -u deployment-platform -f

# Via Docker Compose
docker compose -f docker-compose.prod.yml logs -f backend

# Filter for errors
docker compose -f docker-compose.prod.yml logs backend | grep -i error
```

### Deployment Logs

```bash
# Via API
curl "https://deployment.wrytes.io/deployments/$DEPLOYMENT_ID/logs?tail=100" \
  -H "X-API-Key: $API_KEY" | jq -r '.logs'

# Via Docker (on server)
docker service logs {service-name} --tail 100
```

### nginx-proxy Logs

```bash
# On production server
docker compose -f docker-compose.prod.yml logs nginx-proxy | tail -50
```

### SSL Certificate Logs

```bash
# On production server
docker compose -f docker-compose.prod.yml logs letsencrypt | tail -50
```

## 🐛 Debugging Production Issues

### Check Database Connection

```bash
# On production server
docker compose -f docker-compose.prod.yml exec postgres psql -U postgres -d deployment_system

# List tables
\dt

# Query deployments
SELECT id, status, image, tag FROM deployments;

# Exit
\q
```

### Check Docker Swarm

```bash
# On production server
docker node ls
docker network ls | grep overlay
docker service ls
```

### Check SSL Certificates

```bash
# On production server
docker compose -f docker-compose.prod.yml exec nginx-proxy ls -la /etc/nginx/certs/

# Should see certificates for your domains
```

### Test DNS Resolution

```bash
dig +short deployment.wrytes.io
dig +short test-app.wrytes.io

# Should return your server's IP address
```

## ✅ Production Readiness Checklist

After running all tests:

- [ ] Health endpoint returns 200 OK
- [ ] Can create API keys via Telegram bot
- [ ] Can create environments via API
- [ ] Can deploy containers successfully
- [ ] Can view deployment logs
- [ ] Can make environments public with HTTPS
- [ ] SSL certificates are valid (Let's Encrypt)
- [ ] Public deployments accessible via domain
- [ ] Webhook endpoint rejects unauthorized requests
- [ ] Rate limiting works (429 after 100 requests)
- [ ] Auto-recovery works after service removal
- [ ] System auto-starts after server reboot
- [ ] Can delete deployments and environments
- [ ] No errors in backend logs
- [ ] Telegram bot responds correctly

## 🎯 Performance Testing

### Load Test Deployment Creation

```bash
# Create 10 deployments concurrently
for i in {1..10}; do
  curl -X POST https://deployment.wrytes.io/deployments \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "environmentId": "'"$ENV_ID"'",
      "image": "nginx",
      "tag": "alpine",
      "replicas": 1
    }' &
done
wait

# Check all deployments
curl "https://deployment.wrytes.io/deployments/environment/$ENV_ID" \
  -H "X-API-Key: $API_KEY" | jq '. | length'

# Should show 10 deployments
```

### Monitor Resource Usage

```bash
# On production server
docker stats --no-stream

# Check disk usage
df -h
docker system df

# Check memory
free -h
```

## 🚨 Emergency Procedures

### Restart Everything

```bash
# On production server
sudo systemctl restart deployment-platform
```

### View Recent Errors

```bash
sudo journalctl -u deployment-platform -p err -n 50
```

### Force Cleanup

```bash
# Remove all services
docker service ls --format "{{.Name}}" | xargs -I {} docker service rm {}

# Restart platform
sudo systemctl restart deployment-platform
```

## 📝 Next Steps

1. **Monitor production** for 24 hours
2. **Test failover scenarios** (network issues, disk full, etc.)
3. **Set up automated backups** (database, volumes)
4. **Configure monitoring alerts** (Telegram notifications)
5. **Document any issues** found during testing

---

**Production URL:** https://deployment.wrytes.io
**API Docs:** https://deployment.wrytes.io/api/docs
**Telegram Bot:** @your_bot_name
