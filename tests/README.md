# Test Scripts

Collection of test scripts for the Docker Swarm Deployment Platform.

## Prerequisites

### 1. Set Up API Key

```bash
# Copy the example file
cp tests/.env.example tests/.env

# Edit and add your API key
# Get your key from Telegram bot: /api_create
nano tests/.env
```

Your `tests/.env` should look like:
```bash
API_KEY=rw_prod_your_key_id.your_secret
```

## Usage

### 1. Create Environment

```bash
./tests/1-create-environment.sh

# Custom environment name
ENV_NAME="production" ./tests/1-create-environment.sh
```

### 2. Deploy Container

```bash
ENV_ID="cml5hqxh60001n2m5e2ra686d" ./tests/2-deploy-container.sh

# Deploy different image
ENV_ID="<env-id>" IMAGE="redis" TAG="alpine" HOST_PORT="6379" CONTAINER_PORT="6379" ./tests/2-deploy-container.sh

# Deploy PostgreSQL
ENV_ID="<env-id>" IMAGE="postgres" TAG="16-alpine" HOST_PORT="5433" CONTAINER_PORT="5432" ./tests/2-deploy-container.sh
```

### 3. Check Deployment Status

```bash
JOB_ID="ypjUvGCcggSY6Kua" ./tests/3-check-status.sh
```

### 4. View Logs

```bash
DEPLOYMENT_ID="cml5hsbyy0003n2m589rm2jwz" ./tests/4-view-logs.sh

# Last 50 lines
DEPLOYMENT_ID="<deployment-id>" TAIL="50" ./tests/4-view-logs.sh
```

### 5. List Environments

```bash
./tests/5-list-environments.sh
```

### 6. Delete Environment

```bash
ENV_ID="cml5hqxh60001n2m5e2ra686d" ./tests/6-delete-environment.sh
```

### 7. Deploy from Git Repository

```bash
ENV_ID="<env-id>" ./tests/7-deploy-from-git.sh

# Deploy different repository
ENV_ID="<env-id>" GIT_URL="https://github.com/user/repo" BRANCH="develop" ./tests/7-deploy-from-git.sh

# Custom port
ENV_ID="<env-id>" HOST_PORT="8080" CONTAINER_PORT="8080" ./tests/7-deploy-from-git.sh
```

## Complete Workflow Example

```bash
# Step 1: Create environment
./tests/1-create-environment.sh
# Save the environment ID

# Step 2: Deploy nginx
export ENV_ID="<your-env-id>"
./tests/2-deploy-container.sh
# Save the job ID

# Step 3: Check status
export JOB_ID="<your-job-id>"
./tests/3-check-status.sh
# Save the deployment ID

# Step 4: View logs
export DEPLOYMENT_ID="<your-deployment-id>"
./tests/4-view-logs.sh

# Step 5: Test the service
curl http://localhost:8080

# Step 6: Cleanup
./tests/6-delete-environment.sh
```

## Environment Variables

- `API_KEY` - Your API key (default: initial setup key)
- `ENV_ID` - Environment ID
- `ENV_NAME` - Environment name (default: test-env)
- `JOB_ID` - Deployment job ID
- `DEPLOYMENT_ID` - Deployment ID
- `IMAGE` - Docker image name (default: nginx)
- `TAG` - Image tag (default: alpine)
- `HOST_PORT` - Host port (default: 8080)
- `CONTAINER_PORT` - Container port (default: 80)
- `TAIL` - Number of log lines (default: 100)
- `GIT_URL` - Git repository URL (default: https://github.com/imranhsayed/next-js-app)
- `BRANCH` - Git branch (default: main)

## Examples

### Deploy Redis
```bash
ENV_ID="<env-id>" IMAGE="redis" TAG="alpine" HOST_PORT="6379" CONTAINER_PORT="6379" ./tests/2-deploy-container.sh
```

### Deploy PostgreSQL
```bash
ENV_ID="<env-id>" IMAGE="postgres" TAG="16-alpine" HOST_PORT="5433" CONTAINER_PORT="5432" ./tests/2-deploy-container.sh
```

### Deploy Custom App
```bash
ENV_ID="<env-id>" IMAGE="myapp" TAG="latest" HOST_PORT="3000" CONTAINER_PORT="3000" ./tests/2-deploy-container.sh
```

### Deploy Next.js App from Git
```bash
ENV_ID="<env-id>" ./tests/7-deploy-from-git.sh
```

### Deploy Python Flask App from Git
```bash
ENV_ID="<env-id>" \
  GIT_URL="https://github.com/user/flask-app" \
  BRANCH="main" \
  HOST_PORT="5000" \
  CONTAINER_PORT="5000" \
  ./tests/7-deploy-from-git.sh
```
