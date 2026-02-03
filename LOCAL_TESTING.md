# Local Testing Guide

## ✅ System is Running

All services are up and running:
- PostgreSQL (database) on port 5432
- Redis (cache) on port 6379
- Backend API (http://localhost:3000)

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

# List your API keys (requires auth)
curl http://localhost:3000/auth/keys \
  -H "X-API-Key: $API_KEY" | jq .
```

## 📚 API Documentation

Visit: http://localhost:3000/api/docs

Interactive Swagger UI for testing all endpoints.

## 🧪 Test Core Functionality

### 1. Create an Environment

```bash
curl -X POST http://localhost:3000/environments \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-app"}' | jq .
```

Save the `id` from the response.

### 2. List Environments

```bash
curl http://localhost:3000/environments \
  -H "X-API-Key: $API_KEY" | jq .
```

### 3. Deploy a Container

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
    "ports": [{"container": 80, "host": 8080}],
    "envVars": {"NGINX_PORT": "80"}
  }' | jq .
```

Save the `jobId` to check deployment status.

### 4. Check Deployment Status

```bash
# Replace {jobId} with your job ID
curl "http://localhost:3000/deployments/job/{jobId}" \
  -H "X-API-Key: $API_KEY" | jq .
```

Watch the status change from:
- `PENDING` → `PULLING_IMAGE` → `CREATING_VOLUMES` → `STARTING_CONTAINERS` → `RUNNING`

### 5. List Deployments in Environment

```bash
# Replace {environmentId} with your environment ID
curl "http://localhost:3000/deployments/environment/{environmentId}" \
  -H "X-API-Key: $API_KEY" | jq .
```

### 6. Get Deployment Logs

```bash
# Replace {deploymentId} with your deployment ID
curl "http://localhost:3000/deployments/{deploymentId}/logs?tail=50" \
  -H "X-API-Key: $API_KEY" | jq .
```

### 7. Test Deployed Service

```bash
# Nginx was deployed with host port 8080
curl http://localhost:8080
```

You should see the nginx welcome page.

### 8. Delete Environment

```bash
# Replace {environmentId} with your environment ID
curl -X DELETE "http://localhost:3000/environments/{environmentId}" \
  -H "X-API-Key: $API_KEY" | jq .
```

This will:
- Stop all deployments
- Remove all containers
- Delete all volumes
- Remove the overlay network

## 🚀 Deploy from Git Repository

### Deploy a Node.js App

```bash
curl -X POST http://localhost:3000/deployments/from-git \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "environmentId": "{environmentId}",
    "gitUrl": "https://github.com/your-username/your-app.git",
    "branch": "main",
    "baseImage": "node:18-alpine",
    "installCommand": "npm install",
    "buildCommand": "npm run build",
    "startCommand": "npm start",
    "replicas": 1,
    "ports": [{"container": 3000, "host": 3001}],
    "envVars": {
      "NODE_ENV": "production",
      "PORT": "3000"
    }
  }' | jq .
```

## 🌐 Make Environment Public (Production Only)

**Note**: This feature requires a public domain and DNS configuration. It will not work in local testing without a proper domain.

```bash
# This will fail in local development without a valid domain
curl -X POST "http://localhost:3000/environments/{environmentId}/public" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain": "my-app.example.com"}' | jq .
```

In production with nginx-proxy:
1. Point `my-app.example.com` DNS to your server
2. Make environment public with the API call above
3. nginx-proxy will automatically:
   - Generate nginx configuration
   - Request SSL certificate from Let's Encrypt
   - Configure HTTPS redirect
   - Proxy requests to your service

## 📊 Check System Health

```bash
curl http://localhost:3000/health | jq .
```

Returns status of:
- Database connection
- Memory usage
- Disk usage

## 🐛 Debugging

### View Backend Logs

Backend is running with `yarn start:dev` - check the terminal where it's running.

### View Docker Services

```bash
# List all services
docker service ls

# Inspect a service
docker service inspect {service-name}

# View service logs
docker service logs {service-name}
```

### View Docker Networks

```bash
# List networks
docker network ls | grep overlay_env

# Inspect a network
docker network inspect {network-name}
```

### View Docker Volumes

```bash
# List volumes
docker volume ls | grep vol_

# Inspect a volume
docker volume inspect {volume-name}
```

### Check Database

```bash
# Connect to PostgreSQL
docker exec -it deployment_platform_postgres psql -U postgres -d deployment_platform

# List tables
\dt

# Query users
SELECT * FROM users;

# Query environments
SELECT * FROM environments;

# Exit
\q
```

### Check Redis

```bash
# Connect to Redis
docker exec -it deployment_platform_redis redis-cli

# Check keys
KEYS *

# Exit
exit
```

## 🧹 Clean Up

### Stop Backend

Press `Ctrl+C` in the terminal running `yarn start:dev`.

### Stop Infrastructure

```bash
cd backend
docker compose down -v
```

This will:
- Stop PostgreSQL and Redis containers
- Remove containers
- Delete volumes (all data will be lost)

## ⚠️ Known Issues

### Health Check Shows Storage Down

If disk usage is high, the health check will report storage as down. This is expected behavior if your disk is above 90% full.

### Port Already in Use

If you see "port already in use" errors:

```bash
# Check what's using the port
lsof -i :3000
lsof -i :5432
lsof -i :6379

# Stop conflicting services or change ports in .env
```

### Telegram Bot Not Responding

1. Check that `TELEGRAM_BOT_TOKEN` is set correctly in `backend/.env`
2. Check backend logs for telegram errors
3. Verify bot token is valid: https://t.me/BotFather

### Docker Socket Permission Denied

The backend needs access to Docker socket. If you see permission errors:

```bash
# Check Docker socket permissions
ls -la /var/run/docker.sock

# On Mac, Docker Desktop handles this automatically
# On Linux, add your user to the docker group:
sudo usermod -aG docker $USER
# Then log out and back in
```

## 📝 Next Steps

1. **Test all endpoints** using the Swagger UI at http://localhost:3000/api/docs
2. **Deploy a real application** from a Git repository
3. **Test rate limiting** by making multiple deployment requests
4. **Test error handling** by providing invalid inputs
5. **Monitor logs** to understand the deployment workflow

## 🎯 Production Testing

For production deployment with nginx-proxy and HTTPS:

1. Deploy to a server with a public IP
2. Configure DNS for your domain
3. Set `LETSENCRYPT_EMAIL` in `.env.production`
4. Use `docker-compose.prod.yml` for deployment
5. Test HTTPS access with your domain

See `QUICK_START.md` for production deployment instructions.
