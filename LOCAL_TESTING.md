# Local Testing Guide

## ✅ System is Running

All services are up and running:
- PostgreSQL (database)
- Redis (cache)
- Backend API (http://localhost:3000)
- nginx-proxy (ports 80, 443)
- Let's Encrypt companion

## 🔑 Get an API Key

### Via Telegram Bot

1. Open Telegram and find your bot
2. Send `/start` to initialize your account
3. Send `/api_create` to generate an API key
4. Click the magic link to retrieve your API key
5. Save the API key for testing

### Test API Access

```bash
# Set your API key
export API_KEY="your-api-key-here"

# Test health endpoint (no auth required)
curl http://localhost:3000/health | jq .

# Test root endpoint (no auth required)
curl http://localhost:3000/ | jq .

# Create an environment (requires auth)
curl -X POST http://localhost:3000/environments \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "test-env"}'

# List environments
curl http://localhost:3000/environments \
  -H "X-API-Key: $API_KEY" | jq .
```

## 📚 API Documentation

Visit: http://localhost:3000/api/docs

## 🧪 Test Core Functionality

### 1. Create an Environment

```bash
curl -X POST http://localhost:3000/environments \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-app"}' | jq .
```

Save the `id` from the response.

### 2. Deploy a Container

```bash
# Replace {environmentId} with your environment ID
curl -X POST http://localhost:3000/deployments \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "environmentId": "{environmentId}",
    "image": "nginx",
    "tag": "alpine",
    "replicas": 1,
    "ports": [{"container": 80}]
  }' | jq .
```

Save the `jobId` to check deployment status.

### 3. Check Deployment Status

```bash
curl "http://localhost:3000/deployments/{jobId}/status" \
  -H "X-API-Key: $API_KEY" | jq .
```

### 4. Get Deployment Logs

```bash
curl "http://localhost:3000/deployments/{deploymentId}/logs" \
  -H "X-API-Key: $API_KEY" | jq .
```

## 🤖 Test Claude Code Integration (Optional)

### Via Telegram

1. **Create a Claude Session**
   ```
   /claude_new my-project
   ```

2. **List Your Sessions**
   ```
   /claude_list
   ```

3. **Activate a Session**
   ```
   /claude_talk my-project
   ```

4. **Talk to Claude**
   - Just send any message and Claude will respond
   - Claude can help you build applications in the isolated workspace

### Via REST API

```bash
# Create Claude session
curl -X POST http://localhost:3000/claude-sessions \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"projectName": "test-project"}' | jq .

# List sessions
curl http://localhost:3000/claude-sessions \
  -H "X-API-Key: $API_KEY" | jq .

# Get session details
curl http://localhost:3000/claude-sessions/{sessionId} \
  -H "X-API-Key: $API_KEY" | jq .
```

## 🔍 Verify Docker Swarm Services

```bash
# List all Docker services
docker service ls

# Check specific service
docker service ps {service_name}

# View service logs
docker service logs {service_name}
```

## 🐛 Troubleshooting

### Check Container Status
```bash
docker-compose -f docker-compose.prod.yml ps
```

### View Logs
```bash
# Backend logs
docker logs deployment_platform_backend

# All services
docker-compose -f docker-compose.prod.yml logs -f
```

### Restart Services
```bash
# Restart all
docker-compose -f docker-compose.prod.yml restart

# Restart specific service
docker-compose -f docker-compose.prod.yml restart backend
```

### Reset Everything
```bash
# Stop and remove all containers and volumes
docker-compose -f docker-compose.prod.yml down -v

# Start fresh
docker-compose -f docker-compose.prod.yml up -d

# Apply migrations
docker-compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

## ⚠️ Local Testing Limitations

1. **nginx-proxy SSL**: Cannot test HTTPS/SSL locally without a real domain
   - nginx-proxy works but won't get real SSL certificates
   - Use staging mode (LETSENCRYPT_STAGING=true) to avoid rate limits

2. **Making Environments Public**: Requires a real domain name
   - Can test the API endpoint but SSL won't work
   - Deploy to a server with a domain for full testing

3. **Network Isolation**: Works fully in Docker Swarm
   - Each environment gets its own overlay network
   - Test deployments are isolated from each other

## 📊 System Status

Check all services are healthy:
```bash
curl http://localhost:3000/health | jq .
docker-compose -f docker-compose.prod.yml ps
```

## 🎯 Next Steps

1. ✅ Test API endpoints with your API key
2. ✅ Deploy a test application
3. ✅ Try Claude Code integration via Telegram
4. 🚀 Deploy to production server with real domain for full functionality
