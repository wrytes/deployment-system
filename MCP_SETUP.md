# MCP Server Setup for Claude Code

This guide shows you how to connect the Docker Swarm Deployment Platform to Claude Code via the Model Context Protocol (MCP).

## Prerequisites

1. **Get your API credentials:**
    - Get an API key from the Telegram bot (`/api_create`)
    - Get your User ID (you can find this in the database or via the API)

2. **Build the backend:**
    ```bash
    cd backend
    yarn build
    ```

## Configuration

### Option 1: Using Claude Code CLI

Add the MCP server to your Claude Code configuration:

```bash
# Edit your MCP configuration
code ~/.claude/mcp_settings.json
```

Add this configuration:

```json
{
	"mcpServers": {
		"docker-swarm-deployment": {
			"command": "node",
			"args": [
				"/Users/frankencoin/Documents/wrytes/deployment-system/backend/dist/mcp-server.js"
			],
			"env": {
				"API_KEY": "your-api-key-here",
				"USER_ID": "your-user-id-here",
				"DATABASE_URL": "postgresql://user:password@localhost:5432/deployment",
				"NODE_ENV": "production"
			}
		}
	}
}
```

### Option 2: Development Mode

For development with auto-reload:

```json
{
	"mcpServers": {
		"docker-swarm-deployment": {
			"command": "yarn",
			"args": ["mcp-server:dev"],
			"cwd": "/Users/frankencoin/Documents/wrytes/deployment-system/backend",
			"env": {
				"API_KEY": "your-api-key-here",
				"USER_ID": "your-user-id-here"
			}
		}
	}
}
```

## Getting Your Credentials

### 1. Get API Key

Via Telegram bot:

```
/api_create
```

Click the magic link and you'll receive an API key like:

```
rw_prod_abc123.xyz789
```

### 2. Get User ID

Query the database:

```bash
docker-compose exec postgres psql -U deployment_user -d deployment_db -c "SELECT id, \"telegramId\", \"telegramUsername\" FROM users;"
```

Or via API:

```bash
curl http://localhost:3000/auth/verify?token=YOUR_MAGIC_LINK_TOKEN
```

## Available MCP Tools

Once configured, Claude Code will have access to these tools:

### 1. `create_environment`

Create an isolated deployment environment

```typescript
{
	name: string; // Environment name
	userId: string; // Your user ID (auto-filled from config)
}
```

### 2. `list_environments`

List all your environments

```typescript
{
	userId: string; // Your user ID (auto-filled from config)
}
```

### 3. `create_deployment`

Deploy a container from Docker Hub

```typescript
{
  userId: string;
  environmentId: string;
  image: string;
  tag?: string;
  replicas?: number;
  ports?: Array<{container: number; host?: number}>;
  envVars?: Record<string, string>;
}
```

### 4. `create_deployment_from_git`

Deploy from a Git repository (⭐ NEW!)

```typescript
{
  userId: string;
  environmentId: string;
  gitUrl: string;
  branch?: string;
  baseImage?: string;          // e.g., "node:22", "python:3.11-alpine"
  installCommand?: string;      // e.g., "yarn install"
  buildCommand?: string;        // e.g., "yarn run build"
  startCommand?: string;        // e.g., "yarn start"
  ports?: Array<{container: number; host?: number}>;
  envVars?: Record<string, string>;
}
```

### 5. `get_deployment_status`

Check deployment status

```typescript
{
	userId: string;
	jobId: string; // From create_deployment response
}
```

### 6. `make_environment_public`

Enable HTTPS with automatic SSL

```typescript
{
	userId: string;
	environmentId: string;
	domain: string; // Must point to this server
}
```

### 7. `get_deployment_logs`

Retrieve container logs

```typescript
{
  userId: string;
  deploymentId: string;
  tail?: number;  // Default: 100
}
```

## Testing the Setup

### 1. Start your backend API:

```bash
cd backend
yarn start:dev
```

### 2. Start Claude Code and test the MCP connection

Open Claude Code and try:

```
List my deployment environments
```

or

```
Create a new environment called "test-env"
```

### 3. Test Git deployment

```
Deploy the repository https://github.com/vercel/next.js/tree/canary/examples/hello-world
to environment "test-env" using Node.js 22
```

## Troubleshooting

### MCP server not connecting

1. **Check logs:**

    ```bash
    # Claude Code logs
    tail -f ~/.claude/logs/mcp-server-docker-swarm-deployment.log
    ```

2. **Verify environment variables:**
    - API_KEY is set and valid
    - USER_ID matches a user in the database
    - DATABASE_URL is correct

3. **Test manually:**
    ```bash
    cd backend
    API_KEY=your-key USER_ID=your-id yarn mcp-server:dev
    ```

### API Key issues

Make sure your API key:

- Is in the format `rw_prod_{keyId}.{secret}`
- Has not been revoked
- Has the necessary scopes (ENVIRONMENTS_WRITE, DEPLOYMENTS_WRITE, etc.)

### Database connection issues

Ensure PostgreSQL is running:

```bash
docker-compose ps postgres
```

Check connection:

```bash
psql $DATABASE_URL -c "SELECT 1;"
```

## Example Usage in Claude Code

### Create and deploy in one go:

```
I want to deploy a Next.js application:
1. Create an environment called "my-nextjs-app"
2. Deploy from https://github.com/vercel/next.js/tree/canary/examples/hello-world
3. Use Node.js 22 as the base image
4. Map port 3000 from container to port 8080 on host
5. Set NODE_ENV=production
```

Claude Code will:

1. Call `create_environment` with name "my-nextjs-app"
2. Call `create_deployment_from_git` with all the parameters
3. Poll `get_deployment_status` to track progress
4. Report when deployment is complete

### Check deployment status:

```
What's the status of my deployments?
```

Claude Code will:

1. Call `list_environments` to get all environments
2. For each environment, check for recent deployments
3. Present a summary

## Advanced Configuration

### Using environment-specific configs:

```json
{
	"mcpServers": {
		"docker-swarm-dev": {
			"command": "node",
			"args": ["dist/mcp-server.js"],
			"cwd": "/path/to/backend",
			"env": {
				"API_KEY": "dev-api-key",
				"USER_ID": "dev-user-id",
				"NODE_ENV": "development"
			}
		},
		"docker-swarm-prod": {
			"command": "node",
			"args": ["dist/mcp-server.js"],
			"cwd": "/path/to/backend",
			"env": {
				"API_KEY": "prod-api-key",
				"USER_ID": "prod-user-id",
				"NODE_ENV": "production",
				"DATABASE_URL": "postgresql://prod-host:5432/db"
			}
		}
	}
}
```

## Security Notes

1. **API Keys**: Store them securely, don't commit to Git
2. **User ID**: Ensure it matches your authenticated user
3. **Permissions**: MCP server has full access based on the API key scopes
4. **Logging**: MCP server logs are stored in `~/.claude/logs/`

## Next Steps

Once configured, you can use Claude Code to:

- Create and manage environments
- Deploy Docker containers
- Deploy from Git repositories
- Monitor deployment status
- View container logs
- Enable public HTTPS access

All through natural language commands! 🚀
