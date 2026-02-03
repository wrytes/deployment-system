# Docker Swarm Deployment Platform - AI Context Guide

> **Purpose**: This file provides comprehensive context for AI assistants (LLMs) working with this codebase.
> **Last Updated**: 2026-02-03
> **Version**: 1.0.0

## Quick Reference

- **Tech Stack**: NestJS 11 + TypeScript 5 + Prisma 6 + PostgreSQL 16 + Docker Swarm
- **Main Entry**: `backend/src/main.ts`
- **API Docs**: http://localhost:3000/api/docs
- **Total Endpoints**: 14 REST endpoints
- **Authentication**: API Key via X-API-Key header (format: `rw_prod_{keyId}.{secret}`)

## Project Overview

### What This System Does

This is a single-machine Docker Swarm deployment platform that provides:

1. **Isolated Environments**: Each environment gets a private Docker overlay network
2. **Container Deployments**: Deploy from Docker Hub or Git repositories
3. **Automatic SSL**: Let's Encrypt certificates via Nginx reverse proxy
4. **Telegram Bot**: User-friendly API key management
5. **Scope-based Authorization**: Fine-grained permissions for API operations

### Core Concepts

**Environment** = Isolated deployment namespace with:
- Unique overlay network for container communication
- Multiple deployments within the same environment can communicate
- Optional public HTTPS access via Nginx + Let's Encrypt

**Deployment** = Container deployment within an environment:
- Async processing with 6 states: PENDING → PULLING_IMAGE → CREATING_VOLUMES → STARTING_CONTAINERS → RUNNING/FAILED
- Job-based polling with 16-char jobId
- Supports Docker Hub images or Git repository builds

**API Key** = Authentication credential with:
- Format: `rw_prod_{keyId}.{secret}` (16 chars each)
- Bcrypt-hashed secret storage (10 rounds)
- Scope-based permissions (6 scopes available)
- Generated via Telegram magic links (15-min expiry)

## Architecture Patterns

### Module Structure

```
backend/src/
├── common/              # Guards, decorators, filters (shared)
│   ├── guards/          # ApiKeyGuard, ScopesGuard
│   ├── decorators/      # @CurrentUser, @RequireScopes
│   └── filters/         # AllExceptionsFilter
├── config/              # Configuration with Joi validation
├── core/                # Core infrastructure
│   ├── database/        # PrismaService, PrismaModule
│   └── health/          # HealthController, health checks
├── integrations/        # External services
│   ├── docker/          # ContainerService, NetworkService, VolumeService
│   ├── telegram/        # TelegramUpdate (bot commands)
│   └── nginx/           # NginxService (config generation)
├── modules/             # Business logic
│   ├── auth/            # AuthController, AuthService
│   ├── environments/    # EnvironmentsController, EnvironmentsService
│   └── deployments/     # DeploymentsController, DeploymentsService
├── app.module.ts        # Root module (wires everything together)
└── main.ts              # Bootstrap (configures app, starts server)
```

### Authentication Flow

1. **User requests API key**:
   - User sends `/api_create` to Telegram bot
   - Bot creates MagicLink with scopes and 15-min expiry
   - User visits `GET /auth/verify?token={token}`

2. **API key creation**:
   - Token verified against MagicLink table
   - New ApiKey created with bcrypt-hashed secret
   - Format: `rw_prod_{keyId}.{secret}` returned to user

3. **API key usage**:
   - User includes `X-API-Key` header in requests
   - ApiKeyGuard extracts keyId and secret from header
   - Bcrypt comparison validates secret
   - User and ApiKey attached to request
   - ScopesGuard checks required scopes

### Deployment Workflow

**Standard Deployment (Docker Hub)**:
```
1. POST /deployments → Create Deployment record (status: PENDING)
2. Return jobId immediately (async processing starts)
3. Background: processDeployment()
   a. PULLING_IMAGE: Pull image from Docker Hub
   b. CREATING_VOLUMES: Create named volumes with labels
   c. STARTING_CONTAINERS: Create Swarm service in overlay network
   d. RUNNING: Service healthy, containers running
4. Poll: GET /deployments/job/:jobId → Check status
```

**Git Deployment**:
```
1. POST /deployments/from-git → Create Deployment record
2. Background: processDeploymentFromGit()
   a. Clone Git repository
   b. Generate Dockerfile with custom commands
   c. Build image with tar-stream (no temp files)
   d. Create volumes if specified
   e. Create Swarm service
3. Poll: GET /deployments/job/:jobId
```

### Network Isolation

**Overlay Network Pattern**:
- Each environment creates overlay network: `overlay_env_{name}_{timestamp}`
- Containers in same environment can communicate (on overlay network)
- Containers in different environments are isolated
- Nginx dynamically attaches to overlay for public access

**Public Access Flow**:
```
1. POST /environments/:id/public {domain: "app.example.com"}
2. NginxService generates config file
3. Nginx container attaches to environment's overlay network
4. Request SSL certificate from Let's Encrypt
5. Nginx proxies HTTPS → internal service
```

## Database Schema (Prisma)

### Key Models

**User** (users table):
- `id` (cuid): Primary key
- `telegramId` (bigint, unique): Telegram user ID
- `telegramHandle` (string?): Optional username

**ApiKey** (api_keys table):
- `keyId` (string, unique): 16-char nanoid (public part)
- `secretHash` (string): Bcrypt hash of secret (private part)
- `scopes` (ApiKeyScope[]): Permission scopes
- `expiresAt` (DateTime?): Optional expiry
- `revokedAt` (DateTime?): Revocation timestamp
- `lastUsedAt` (DateTime?): Last request timestamp

**Environment** (environments table):
- `name` (string): User-provided name
- `overlayNetworkId` (string, unique): Docker network name
- `status` (EnvironmentStatus): CREATING | ACTIVE | DELETING | DELETED | ERROR
- `isPublic` (boolean): Public access enabled
- `publicDomain` (string?, unique): Domain for public access

**Deployment** (deployments table):
- `jobId` (string, unique): 16-char nanoid for polling
- `image` (string): Docker image name
- `tag` (string): Image tag
- `status` (DeploymentStatus): 6 states (PENDING → RUNNING/FAILED)
- `ports` (Json): Port mappings
- `envVars` (Json): Environment variables
- `volumes` (Json): Volume mounts
- `errorMessage` (string?): Error details if failed

**Container** (containers table):
- `name` (string): Docker service name
- `dockerServiceId` (string): Docker's service ID
- `status` (ContainerStatus): CREATING | RUNNING | STOPPED | FAILED
- `healthStatus` (HealthStatus): HEALTHY | UNHEALTHY | STARTING | NONE
- `restartCount` (int): Number of restarts

**MagicLink** (magic_links table):
- `token` (string, unique): 32-char random token
- `scopes` (ApiKeyScope[]): Scopes for the API key
- `expiresAt` (DateTime): 15-minute expiry
- `usedAt` (DateTime?): One-time use tracking

### Enums

**ApiKeyScope**:
- `ENVIRONMENTS_READ` - List and view environments
- `ENVIRONMENTS_WRITE` - Create, update, delete environments
- `DEPLOYMENTS_READ` - View deployments and status
- `DEPLOYMENTS_WRITE` - Create deployments
- `LOGS_READ` - Read container logs
- `ADMIN` - Grants all permissions (super user)

**EnvironmentStatus**:
- `CREATING` - Network being created
- `ACTIVE` - Ready for deployments
- `DELETING` - Cleanup in progress
- `DELETED` - Soft deleted
- `ERROR` - Creation/deletion failed

**DeploymentStatus**:
- `PENDING` - Initial state
- `PULLING_IMAGE` - Downloading Docker image
- `CREATING_VOLUMES` - Creating named volumes
- `STARTING_CONTAINERS` - Creating Swarm service
- `RUNNING` - Deployment successful
- `FAILED` - Error occurred (see errorMessage)

**ContainerStatus**:
- `CREATING` - Service being created
- `RUNNING` - Container running
- `STOPPED` - Manually stopped
- `FAILED` - Crashed or failed

**HealthStatus**:
- `HEALTHY` - Health check passing
- `UNHEALTHY` - Health check failing
- `STARTING` - Initial grace period
- `NONE` - No health check configured

## API Endpoints

### Authentication (3 endpoints)
- `GET /auth/verify?token={token}` - Verify magic link, get API key
- `GET /auth/keys` - List user's API keys (requires auth)
- `POST /auth/revoke` - Revoke specific key (requires auth)

### Environments (5 endpoints)
- `POST /environments` - Create isolated environment (scope: ENVIRONMENTS_WRITE)
- `GET /environments` - List user's environments (scope: ENVIRONMENTS_READ)
- `GET /environments/:id` - Get details (scope: ENVIRONMENTS_READ)
- `DELETE /environments/:id` - Delete with cleanup (scope: ENVIRONMENTS_WRITE)
- `POST /environments/:id/public` - Enable HTTPS (scope: ENVIRONMENTS_WRITE)

### Deployments (5 endpoints)
- `POST /deployments` - Create deployment (scope: DEPLOYMENTS_WRITE, rate: 5/min)
- `POST /deployments/from-git` - Deploy from Git (scope: DEPLOYMENTS_WRITE, rate: 3/min)
- `GET /deployments/job/:jobId` - Poll status (scope: DEPLOYMENTS_READ)
- `GET /deployments/environment/:envId` - List deployments (scope: DEPLOYMENTS_READ)
- `GET /deployments/:id/logs?tail=100` - Get logs (scope: LOGS_READ)

### Health (1 endpoint)
- `GET /health` - System health (database, memory, disk)

### Root (1 endpoint)
- `GET /` - Welcome message

## Code Conventions

### NestJS Patterns Used

1. **Dependency Injection**: All services injected via constructor
2. **Guards**: ApiKeyGuard → ScopesGuard (order matters!)
3. **Decorators**: @CurrentUser extracts user from request
4. **DTOs**: Interfaces defined in service files (not separate files)
5. **Validation**: Joi for config, class-validator for DTOs (via global pipe)

### Error Handling

- Use NestJS built-in exceptions: `NotFoundException`, `BadRequestException`, etc.
- Global exception filter (`AllExceptionsFilter`) catches all errors
- Pino logger for structured logging
- Deployment errors stored in `errorMessage` field

### Async Patterns

**Fire-and-Forget**:
```typescript
// Don't await, catch errors
this.processDeployment(deploymentId).catch((error) => {
  this.logger.error(`Deployment failed: ${error.message}`);
});
```

**Status Polling**:
```typescript
// Return jobId immediately, client polls status
return {
  jobId: deployment.jobId,
  status: 'PENDING',
};
```

### Security Best Practices

1. **API Keys**: Bcrypt hashing (10 rounds)
2. **Scopes**: Check with ScopesGuard before operations
3. **Containers**: `cap_drop: ALL`, `no-new-privileges`
4. **Networks**: Isolated overlays per environment
5. **Rate Limiting**: 5 deployments/min (3 for Git)

## Common Tasks

### Adding a New Endpoint

1. **Define in controller**:
```typescript
@Post('new-feature')
@UseGuards(ApiKeyGuard, ScopesGuard)
@RequireScopes(ApiKeyScope.ENVIRONMENTS_WRITE)
@ApiOperation({ summary: 'New feature' })
@ApiSecurity('api-key')
@ApiResponse({ status: 200, description: 'Success' })
async newFeature(@CurrentUser() user: User, @Body() dto: DTO) {
  return this.service.newFeature(user.id, dto);
}
```

2. **Implement in service**:
```typescript
async newFeature(userId: string, dto: DTO) {
  const result = await this.prisma.model.create({...});
  return result;
}
```

3. **Add Swagger decorators**: @ApiOperation, @ApiResponse, @ApiBody, @ApiParam

### Adding a New Scope

1. Update `prisma/schema.prisma`: Add to `ApiKeyScope` enum
2. Run migration: `npx prisma migrate dev`
3. Use in decorator: `@RequireScopes(ApiKeyScope.NEW_SCOPE)`

## Gotchas & Known Issues

### 1. Docker Socket Permissions
- Backend container needs `/var/run/docker.sock` mount
- Socket must be writable by container user

### 2. Overlay Network Timing
- Networks take 2-5 seconds to become ready after creation
- Nginx attachment may fail if network not ready

### 3. Magic Link Expiry
- 15-minute expiry is hardcoded in AuthService
- No cleanup job for expired links (manual cleanup needed)

### 4. Rate Limiting
- Applies per API key, not per user
- Uses @nestjs/throttler with in-memory storage (not distributed)
- Multiple API keys = separate rate limit buckets

### 5. Deployment Error Recovery
- Failed deployments don't auto-retry
- Partial resources (volumes, networks) may be left behind
- Manual cleanup required in some failure scenarios

### 6. SSL Certificate Delays
- First Let's Encrypt request can take 30-60 seconds
- Domain must point to server before requesting certificate
- Rate limits: 50 certs per domain per week

### 7. Prisma Migrations
- Always run `npx prisma migrate dev` after schema changes
- Production: Use `npx prisma migrate deploy`

## Testing Strategies

### Manual API Testing

**Get API Key**:
```bash
# 1. Telegram: /api_create → get magic link
# 2. Visit link in browser → get API key
export API_KEY="rw_prod_abc123.xyz789"
```

**Create Environment**:
```bash
curl -X POST http://localhost:3000/environments \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "test-env"}'
```

**Deploy Container**:
```bash
curl -X POST http://localhost:3000/deployments \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "environmentId": "clx...",
    "image": "nginx",
    "tag": "alpine",
    "ports": [{"container": 80, "host": 8080}]
  }'
```

**Check Status**:
```bash
curl http://localhost:3000/deployments/job/{jobId} \
  -H "X-API-Key: $API_KEY"
```

**Enable Public Access**:
```bash
curl -X POST http://localhost:3000/environments/{envId}/public \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain": "my-app.example.com"}'
```

## Configuration

### Environment Variables

**Required**:
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `TELEGRAM_BOT_TOKEN`: Telegram bot token

**Optional**:
- `PORT`: API port (default: 3000)
- `NODE_ENV`: production | development
- `LOG_LEVEL`: info | debug | error
- `RATE_LIMIT_TTL`: Rate limit window in ms (default: 60000)
- `RATE_LIMIT_MAX`: Max requests per window (default: 100)

### Docker Compose

**Development**: `backend/docker-compose.yml` (PostgreSQL + Redis)
**Production**: `docker-compose.prod.yml` (full stack with Nginx)

## Troubleshooting

### Deployment Stuck in PENDING
- Check Docker daemon: `docker info`
- Check logs: `docker service logs <service-name>`
- Verify network: `docker network ls | grep overlay`

### 401 Unauthorized
- Verify API key format: `rw_prod_{keyId}.{secret}`
- Check key not revoked: Query api_keys table
- Verify header name: `X-API-Key` (case-sensitive)

### 403 Forbidden
- Check required scopes for endpoint (see Swagger docs)
- Verify API key has required scopes
- Use `GET /auth/keys` to list current scopes

### Nginx Not Serving Domain
- Verify DNS points to server: `dig +short domain.com`
- Check Nginx logs: `docker logs deployment-system-nginx-1`
- Verify network attachment: `docker network inspect overlay_env_...`

### Deployment Failed
- Check deployment errorMessage in database
- Review Docker service logs
- Verify image exists on Docker Hub
- Check overlay network exists

## File Locations

### Critical Files
- **Main Bootstrap**: `backend/src/main.ts`
- **Root Module**: `backend/src/app.module.ts`
- **Database Service**: `backend/src/core/database/prisma.service.ts`
- **Prisma Schema**: `backend/prisma/schema.prisma`

### Controllers
- **Auth**: `backend/src/modules/auth/auth.controller.ts`
- **Environments**: `backend/src/modules/environments/environments.controller.ts`
- **Deployments**: `backend/src/modules/deployments/deployments.controller.ts`
- **Health**: `backend/src/core/health/health.controller.ts`

### Services
- **Docker**: `backend/src/integrations/docker/docker.service.ts`
- **Network**: `backend/src/integrations/docker/network.service.ts`
- **Container**: `backend/src/integrations/docker/container.service.ts`
- **Nginx**: `backend/src/integrations/nginx/nginx.service.ts`
- **Telegram**: `backend/src/integrations/telegram/telegram.service.ts`

### Guards & Decorators
- **API Key Guard**: `backend/src/common/guards/api-key.guard.ts`
- **Scopes Guard**: `backend/src/common/guards/scopes.guard.ts`
- **Current User**: `backend/src/common/decorators/current-user.decorator.ts`
- **Require Scopes**: `backend/src/common/decorators/require-scopes.decorator.ts`

## References

- **NestJS Docs**: https://docs.nestjs.com
- **Prisma Docs**: https://www.prisma.io/docs
- **Docker Swarm**: https://docs.docker.com/engine/swarm
- **Telegraf (Bot)**: https://telegraf.js.org
- **Swagger/OpenAPI**: https://swagger.io/specification

## Change Log

- **2026-02-03**: Added Swagger documentation for all endpoints
- **2026-02-03**: Added Git deployment support
- **2026-02-01**: MVP implementation complete

---

**Note**: This file should be updated when major architectural changes occur. Keep it concise and focused on patterns that help AI assistants understand the codebase quickly.
