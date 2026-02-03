import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiSecurity,
} from '@nestjs/swagger';
import { DeploymentsService } from './deployments.service';
import type {
  CreateDeploymentDto,
  CreateDeploymentFromGitDto,
} from './deployments.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ScopesGuard } from '../../common/guards/scopes.guard';
import { RequireScopes } from '../../common/decorators/require-scopes.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { ApiKeyScope } from '@prisma/client';

@Controller('deployments')
@UseGuards(ApiKeyGuard, ScopesGuard)
@ApiTags('Deployments')
@ApiSecurity('api-key')
export class DeploymentsController {
  constructor(private readonly deploymentsService: DeploymentsService) {}

  @Post()
  @RequireScopes(ApiKeyScope.DEPLOYMENTS_WRITE)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 deployments per minute
  @ApiOperation({
    summary: 'Create deployment from Docker Hub',
    description:
      'Deploy a container image from Docker Hub to an environment. ' +
      'Deployment is asynchronous - use the returned jobId to poll status. ' +
      '\n\n**Required scope**: `DEPLOYMENTS_WRITE`' +
      '\n\n**Rate limit**: 5 requests per minute',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['environmentId', 'image'],
      properties: {
        environmentId: {
          type: 'string',
          description: 'Target environment ID',
          example: 'clx123abc456def',
        },
        image: {
          type: 'string',
          description: 'Docker image name',
          example: 'nginx',
        },
        tag: {
          type: 'string',
          description: 'Image tag',
          example: 'alpine',
          default: 'latest',
        },
        replicas: {
          type: 'number',
          description: 'Number of container replicas',
          example: 1,
          default: 1,
        },
        ports: {
          type: 'array',
          description: 'Port mappings',
          items: {
            type: 'object',
            properties: {
              container: { type: 'number', example: 80 },
              host: { type: 'number', example: 8080 },
              protocol: {
                type: 'string',
                enum: ['tcp', 'udp'],
                default: 'tcp',
              },
            },
          },
        },
        envVars: {
          type: 'object',
          description: 'Environment variables',
          example: { NODE_ENV: 'production', PORT: '3030' },
        },
        volumes: {
          type: 'array',
          description: 'Volume mounts',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'app-data' },
              path: { type: 'string', example: '/data' },
              readOnly: { type: 'boolean', default: false },
            },
          },
        },
        virtualHost: {
          type: 'string',
          description:
            'Domain for public access (only accessible if environment.isPublic=true)',
          example: 'api.example.com',
        },
        virtualPort: {
          type: 'number',
          description: 'Container port to expose (required if virtualHost set)',
          example: 80,
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Deployment initiated successfully',
    schema: {
      example: {
        jobId: 'abc123xyz789',
        deploymentId: 'clx456def789ghi',
        status: 'PENDING',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing DEPLOYMENTS_WRITE scope',
  })
  @ApiResponse({
    status: 404,
    description: 'Environment not found',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests - Rate limit exceeded',
  })
  async createDeployment(
    @CurrentUser() user: User,
    @Body() dto: CreateDeploymentDto,
  ) {
    return this.deploymentsService.createDeployment(user.id, dto);
  }

  @Post('from-git')
  @RequireScopes(ApiKeyScope.DEPLOYMENTS_WRITE)
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 Git deployments per minute (more resource intensive)
  @ApiOperation({
    summary: 'Create deployment from Git repository',
    description:
      'Clone a Git repository, build a Docker image, and deploy it. ' +
      'Supports custom build commands for Node.js, Python, Go, etc. ' +
      'This operation is resource-intensive and has a lower rate limit. ' +
      '\n\n**Required scope**: `DEPLOYMENTS_WRITE`' +
      '\n\n**Rate limit**: 3 requests per minute',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['environmentId', 'gitUrl'],
      properties: {
        environmentId: {
          type: 'string',
          description: 'Target environment ID',
          example: 'clx123abc456def',
        },
        gitUrl: {
          type: 'string',
          description: 'Git repository URL (HTTP/HTTPS)',
          example: 'https://github.com/user/repo.git',
        },
        branch: {
          type: 'string',
          description: 'Git branch to checkout',
          example: 'main',
          default: 'main',
        },
        baseImage: {
          type: 'string',
          description: 'Base Docker image',
          example: 'node:22-alpine',
          default: 'node:22-alpine',
        },
        buildContext: {
          type: 'string',
          description: 'Build context directory',
          example: '.',
          default: '.',
        },
        dockerfile: {
          type: 'string',
          description: 'Path to Dockerfile (optional)',
          example: 'Dockerfile',
        },
        installCommand: {
          type: 'string',
          description: 'Dependency installation command',
          example: 'yarn install',
        },
        buildCommand: {
          type: 'string',
          description: 'Build command',
          example: 'yarn build',
        },
        startCommand: {
          type: 'string',
          description: 'Start command',
          example: 'yarn start',
        },
        replicas: {
          type: 'number',
          description: 'Number of container replicas',
          example: 1,
          default: 1,
        },
        ports: {
          type: 'array',
          description: 'Port mappings',
          items: {
            type: 'object',
            properties: {
              container: { type: 'number', example: 3000 },
              host: { type: 'number', example: 3000 },
              protocol: {
                type: 'string',
                enum: ['tcp', 'udp'],
                default: 'tcp',
              },
            },
          },
        },
        envVars: {
          type: 'object',
          description: 'Environment variables',
          example: { NODE_ENV: 'production' },
        },
        volumes: {
          type: 'array',
          description: 'Volume mounts',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'app-data' },
              path: { type: 'string', example: '/data' },
              readOnly: { type: 'boolean', default: false },
            },
          },
        },
        virtualHost: {
          type: 'string',
          description:
            'Domain for public access (only accessible if environment.isPublic=true)',
          example: 'api.example.com',
        },
        virtualPort: {
          type: 'number',
          description: 'Container port to expose (required if virtualHost set)',
          example: 80,
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Git deployment initiated successfully',
    schema: {
      example: {
        jobId: 'xyz789abc123',
        deploymentId: 'clx789ghi123jkl',
        status: 'PENDING',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
  })
  @ApiResponse({
    status: 404,
    description: 'Environment not found',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded (max 3/min)',
  })
  async createDeploymentFromGit(
    @CurrentUser() user: User,
    @Body() dto: CreateDeploymentFromGitDto,
  ) {
    return this.deploymentsService.createDeploymentFromGit(user.id, dto);
  }

  @Get('job/:jobId')
  @RequireScopes(ApiKeyScope.DEPLOYMENTS_READ)
  @ApiOperation({
    summary: 'Get deployment status',
    description:
      'Poll deployment status by job ID. Use this to track async deployment progress. ' +
      'Status progression: PENDING → PULLING_IMAGE → CREATING_VOLUMES → STARTING_CONTAINERS → RUNNING ' +
      '\n\n**Required scope**: `DEPLOYMENTS_READ`',
  })
  @ApiParam({
    name: 'jobId',
    description: '16-character job ID from deployment creation',
    example: 'abc123xyz789',
  })
  @ApiResponse({
    status: 200,
    description: 'Deployment status',
    schema: {
      example: {
        deployment: {
          jobId: 'abc123xyz789',
          status: 'RUNNING',
          image: 'nginx',
          tag: 'alpine',
          replicas: 1,
          environment: {
            id: 'clx123abc456def',
            name: 'my-app-prod',
            isPublic: true,
          },
          service: {
            name: 'my-app-prod_nginx_1738579200',
            status: 'RUNNING',
            healthStatus: 'HEALTHY',
          },
          startedAt: '2026-02-03T12:00:00.000Z',
          completedAt: '2026-02-03T12:02:30.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
  })
  @ApiResponse({
    status: 404,
    description: 'Deployment not found',
  })
  async getDeploymentStatus(
    @CurrentUser() user: User,
    @Param('jobId') jobId: string,
  ) {
    const deployment = await this.deploymentsService.getDeploymentStatus(
      user.id,
      jobId,
    );
    return { deployment };
  }

  @Get('environment/:envId')
  @RequireScopes(ApiKeyScope.DEPLOYMENTS_READ)
  @ApiOperation({
    summary: 'List deployments in environment',
    description:
      'List all deployments for a specific environment, ordered by creation date (newest first). ' +
      '\n\n**Required scope**: `DEPLOYMENTS_READ`',
  })
  @ApiParam({
    name: 'envId',
    description: 'Environment ID',
    example: 'clx123abc456def',
  })
  @ApiResponse({
    status: 200,
    description: 'List of deployments',
    schema: {
      example: {
        deployments: [
          {
            id: 'clx456def789ghi',
            jobId: 'abc123xyz789',
            image: 'nginx',
            tag: 'alpine',
            status: 'RUNNING',
            replicas: 1,
            createdAt: '2026-02-03T12:00:00.000Z',
            service: {
              name: 'my-app-prod_nginx_1738579200',
              status: 'RUNNING',
            },
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
  })
  @ApiResponse({
    status: 404,
    description: 'Environment not found',
  })
  async listDeployments(
    @CurrentUser() user: User,
    @Param('envId') environmentId: string,
  ) {
    const deployments = await this.deploymentsService.listDeployments(
      user.id,
      environmentId,
    );
    return { deployments };
  }

  @Get(':id/logs')
  @RequireScopes(ApiKeyScope.LOGS_READ)
  @ApiOperation({
    summary: 'Get deployment logs',
    description:
      'Retrieve service logs from a deployment. Returns logs from the deployment service. ' +
      '\n\n**Required scope**: `LOGS_READ`',
  })
  @ApiParam({
    name: 'id',
    description: 'Deployment ID',
    example: 'clx456def789ghi',
  })
  @ApiQuery({
    name: 'tail',
    required: false,
    description: 'Number of log lines to retrieve',
    example: 100,
    schema: { type: 'number', default: 100 },
  })
  @ApiResponse({
    status: 200,
    description: 'Service logs',
    schema: {
      example: {
        logs:
          '2026-02-03T12:00:00.000Z [INFO] Server started on port 80\n' +
          '2026-02-03T12:01:00.000Z [INFO] Request: GET /\n',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing LOGS_READ scope',
  })
  @ApiResponse({
    status: 404,
    description: 'Deployment not found',
  })
  async getDeploymentLogs(
    @CurrentUser() user: User,
    @Param('id') deploymentId: string,
    @Query('tail') tail?: string,
  ) {
    const tailNum = tail ? parseInt(tail, 10) : 100;
    const logs = await this.deploymentsService.getDeploymentLogs(
      user.id,
      deploymentId,
      tailNum,
    );
    return { logs };
  }

  @Delete(':id')
  @RequireScopes(ApiKeyScope.DEPLOYMENTS_WRITE)
  @ApiOperation({
    summary: 'Delete deployment',
    description:
      'Delete a deployment and clean up associated Docker resources. ' +
      'By default, volumes are deleted along with the service. ' +
      'Use preserveVolumes=true to keep volumes for data retention. ' +
      'This is a hard delete - the deployment record is removed from the database. ' +
      '\n\n**Required scope**: `DEPLOYMENTS_WRITE`',
  })
  @ApiParam({
    name: 'id',
    description: 'Deployment ID to delete',
    example: 'clx456def789ghi',
  })
  @ApiQuery({
    name: 'preserveVolumes',
    required: false,
    description: 'Set to true to preserve volumes (default: false)',
    example: false,
    schema: { type: 'boolean', default: false },
  })
  @ApiResponse({
    status: 200,
    description: 'Deployment deleted successfully',
    schema: {
      example: {
        message: 'Deployment deleted successfully',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing DEPLOYMENTS_WRITE scope',
  })
  @ApiResponse({
    status: 404,
    description: 'Deployment not found',
  })
  async deleteDeployment(
    @CurrentUser() user: User,
    @Param('id') deploymentId: string,
    @Query('preserveVolumes') preserveVolumes?: string,
  ) {
    const preserveVolumesFlag = preserveVolumes === 'true';
    return this.deploymentsService.deleteDeployment(
      user.id,
      deploymentId,
      preserveVolumesFlag,
    );
  }
}
