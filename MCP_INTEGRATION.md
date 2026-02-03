# MCP Integration - Docker Swarm Deployment Platform

## Overview

The MCP (Model Context Protocol) integration has been successfully implemented into the NestJS backend. The system now provides both REST API and MCP protocol support through a single server, enabling Claude Code to interact with deployment tools.

## Architecture

**ONE NestJS Server** provides:
- ✅ REST API endpoints (existing)
- ✅ MCP protocol support (new)
- ✅ Same authentication (API keys)
- ✅ Shared services (EnvironmentsService, DeploymentsService, etc.)

## Implementation Summary

### Files Created

1. **`backend/src/mcp/tools/environment.tools.ts`**
   - Environment MCP tool provider
   - Tools: `create_environment`, `list_environments`, `make_environment_public`
   - Wraps EnvironmentsService with MCP decorators

2. **`backend/src/mcp/tools/deployment.tools.ts`**
   - Deployment MCP tool provider
   - Tools: `create_deployment`, `create_deployment_from_git`, `get_deployment_status`, `get_deployment_logs`
   - Wraps DeploymentsService with MCP decorators

### Files Modified

1. **`backend/src/mcp/mcp.module.ts`**
   - Updated to use `@rekog/mcp-nest`
   - Configured with multiple transports (SSE, Streamable HTTP, STDIO)
   - Registers tool providers
   - Reuses existing guards (ApiKeyGuard, ScopesGuard)

2. **`backend/package.json`**
   - Added required dependencies: `@modelcontextprotocol/sdk`, `zod`

### Files Removed

1. **`backend/src/mcp/mcp.controller.ts`** - Replaced by MCP tool providers
2. **`backend/src/mcp/mcp-tools.service.ts`** - Replaced by tool provider classes
3. **`backend/src/mcp-server-standalone.ts`** - No longer needed

## Available MCP Tools (7 total)

### Environment Tools

1. **`create_environment`**
   - Create a new isolated deployment environment with private overlay network
   - Parameters: `name` (string)

2. **`list_environments`**
   - List all environments for the authenticated user
   - Parameters: none

3. **`make_environment_public`**
   - Enable public HTTPS access for an environment with automatic SSL
   - Parameters: `environmentId` (string), `domain` (string)

### Deployment Tools

4. **`create_deployment`**
   - Deploy a container to an environment from Docker Hub
   - Parameters: `environmentId`, `image`, `tag`, `replicas`, `ports`, `envVars`

5. **`create_deployment_from_git`**
   - Deploy from a Git repository with custom build commands
   - Parameters: `environmentId`, `gitUrl`, `branch`, `baseImage`, `installCommand`, `buildCommand`, `startCommand`, `replicas`, `ports`, `envVars`

6. **`get_deployment_status`**
   - Check deployment status by job ID
   - Parameters: `jobId` (string)

7. **`get_deployment_logs`**
   - Retrieve logs from a deployment's containers
   - Parameters: `deploymentId` (string), `tail` (number, optional)

## Claude Code Configuration

### Option 1: SSE Transport (Recommended for Remote)

Add to your Claude Code configuration (`~/.claude/config.json` or workspace settings):

```json
{
  "mcpServers": {
    "docker-swarm-deployment": {
      "type": "sse",
      "url": "http://localhost:3000/sse",
      "headers": {
        "X-API-Key": "your-api-key-here"
      }
    }
  }
}
```

### Option 2: STDIO Transport (Local Development)

For local development, you can run the server and connect via STDIO by creating a wrapper script.

**File: `backend/mcp-stdio-wrapper.js`** (not yet created):

```javascript
#!/usr/bin/env node
const { spawn } = require('child_process');

// Start NestJS server with STDIO transport enabled
const server = spawn('yarn', ['start:dev'], {
  cwd: __dirname,
  env: {
    ...process.env,
    MCP_TRANSPORT: 'stdio',
    NODE_ENV: 'development',
  },
  stdio: ['inherit', 'inherit', 'inherit'],
});

server.on('error', (error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

server.on('exit', (code) => {
  process.exit(code);
});
```

Then configure Claude Code:

```json
{
  "mcpServers": {
    "docker-swarm-deployment": {
      "command": "node",
      "args": ["mcp-stdio-wrapper.js"],
      "cwd": "/path/to/deployment-system/backend",
      "env": {
        "API_KEY": "your-api-key",
        "DATABASE_URL": "postgresql://..."
      }
    }
  }
}
```

## Authentication Flow

1. **REST API**: `X-API-Key` header → `ApiKeyGuard` → extracts user → passes to controller
2. **MCP SSE**: `X-API-Key` header → `ApiKeyGuard` → extracts user → passes to tool
3. **MCP STDIO**: No authentication (local only)

The existing guards work seamlessly with MCP!

## Running the Server

```bash
cd backend

# Install dependencies
yarn install

# Build
yarn build

# Start in development mode (with hot reload)
yarn start:dev

# Start in production mode
yarn start:prod
```

The server will start on port 3000 (or the port specified in your `.env` file).

## Testing the Integration

### 1. Test REST API (verify existing functionality)

```bash
# Health check
curl http://localhost:3000/health

# List environments (requires API key)
curl http://localhost:3000/environments \
  -H "X-API-Key: your-api-key"
```

### 2. Test MCP SSE Endpoint

```bash
# Check MCP is available
curl http://localhost:3000/sse \
  -H "X-API-Key: your-api-key"

# Should establish SSE connection and show server info
```

### 3. Test with Claude Code

1. Configure Claude Code with the SSE configuration above
2. Open Claude Code
3. Try commands like:
   - "List my environments"
   - "Create a new environment called test-env"
   - "Deploy nginx to my test-env environment"

## Benefits

1. ✅ **One Server**: No separate MCP server process needed
2. ✅ **Reuses Everything**: Services, guards, decorators all work
3. ✅ **Multiple Transports**: SSE (remote), STDIO (local), Streamable HTTP
4. ✅ **Same Auth**: API key authentication works for both REST and MCP
5. ✅ **Type Safety**: Zod schemas validate inputs
6. ✅ **NestJS DI**: Full dependency injection support
7. ✅ **Backward Compatible**: Existing REST API continues to work

## Next Steps

1. Start the server: `yarn start:dev`
2. Configure Claude Code with your API key
3. Test MCP tools through Claude Code
4. (Optional) Create STDIO wrapper for local development
5. (Optional) Deploy to production with proper environment variables

## Troubleshooting

### Server won't start
- Check that all environment variables are set (see `.env.example`)
- Verify PostgreSQL and Redis are running
- Check port 3000 is not already in use

### MCP tools not showing up in Claude Code
- Verify the API key is correct in your Claude Code config
- Check the server logs for authentication errors
- Try restarting Claude Code after configuration changes

### Authentication errors
- Ensure the `X-API-Key` header is being sent
- Verify the API key exists in the database
- Check that the user associated with the API key has proper permissions

## Dependencies

The following packages are required for MCP support:

- `@rekog/mcp-nest`: ^1.9.3 - NestJS MCP integration
- `@modelcontextprotocol/sdk`: ^1.25.3 - MCP SDK (peer dependency)
- `zod`: ^4.3.6 - Schema validation (peer dependency)

These are automatically installed when you run `yarn install`.
