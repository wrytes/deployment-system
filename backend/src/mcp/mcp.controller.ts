import { Controller, Post, Body, UseGuards, Logger } from '@nestjs/common';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { ScopesGuard } from '../common/guards/scopes.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, ApiKeyScope } from '@prisma/client';
import { EnvironmentsService } from '../modules/environments/environments.service';
import { DeploymentsService } from '../modules/deployments/deployments.service';

// MCP Tool Request/Response types
interface McpToolRequest {
  tool: string;
  params: any;
}

interface McpToolResponse {
  success: boolean;
  data?: any;
  error?: string;
}

@Controller('mcp')
@UseGuards(ApiKeyGuard, ScopesGuard)
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly environmentsService: EnvironmentsService,
    private readonly deploymentsService: DeploymentsService,
  ) {}

  @Post('tools/create_environment')
  async createEnvironment(
    @CurrentUser() user: User,
    @Body() params: { name: string },
  ): Promise<McpToolResponse> {
    try {
      this.logger.log(`MCP: Creating environment "${params.name}" for user ${user.id}`);

      const environment = await this.environmentsService.createEnvironment(
        user.id,
        params.name,
      );

      return {
        success: true,
        data: {
          id: environment.id,
          name: environment.name,
          overlayNetworkId: environment.overlayNetworkId,
          status: environment.status,
          message: `Environment "${params.name}" created successfully`,
        },
      };
    } catch (error) {
      this.logger.error(`MCP: Failed to create environment: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('tools/list_environments')
  async listEnvironments(
    @CurrentUser() user: User,
  ): Promise<McpToolResponse> {
    try {
      this.logger.log(`MCP: Listing environments for user ${user.id}`);

      const environments = await this.environmentsService.listEnvironments(
        user.id,
      );

      return {
        success: true,
        data: {
          environments: environments.map((env) => ({
            id: env.id,
            name: env.name,
            status: env.status,
            isPublic: env.isPublic,
            publicDomain: env.publicDomain,
            createdAt: env.createdAt,
          })),
          count: environments.length,
        },
      };
    } catch (error) {
      this.logger.error(`MCP: Failed to list environments: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('tools/create_deployment')
  async createDeployment(
    @CurrentUser() user: User,
    @Body()
    params: {
      environmentId: string;
      image: string;
      tag?: string;
      replicas?: number;
      ports?: Array<{ container: number; host?: number; protocol?: 'tcp' | 'udp' }>;
      envVars?: Record<string, string>;
      volumes?: Array<{ name: string; path: string; readOnly?: boolean }>;
    },
  ): Promise<McpToolResponse> {
    try {
      this.logger.log(
        `MCP: Creating deployment in environment ${params.environmentId} for user ${user.id}`,
      );

      const result = await this.deploymentsService.createDeployment(
        user.id,
        params,
      );

      return {
        success: true,
        data: {
          jobId: result.jobId,
          deploymentId: result.deploymentId,
          status: result.status,
          message: `Deployment created. Use job ID "${result.jobId}" to check status.`,
        },
      };
    } catch (error) {
      this.logger.error(`MCP: Failed to create deployment: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('tools/get_deployment_status')
  async getDeploymentStatus(
    @CurrentUser() user: User,
    @Body() params: { jobId: string },
  ): Promise<McpToolResponse> {
    try {
      this.logger.log(`MCP: Getting deployment status for job ${params.jobId}`);

      const deployment = await this.deploymentsService.getDeploymentStatus(
        user.id,
        params.jobId,
      );

      return {
        success: true,
        data: {
          jobId: deployment.jobId,
          status: deployment.status,
          image: `${deployment.image}:${deployment.tag}`,
          replicas: deployment.replicas,
          environment: deployment.environment.name,
          startedAt: deployment.startedAt,
          completedAt: deployment.completedAt,
          errorMessage: deployment.errorMessage,
          containers: deployment.containers.map((c) => ({
            name: c.name,
            status: c.status,
            healthStatus: c.healthStatus,
          })),
        },
      };
    } catch (error) {
      this.logger.error(
        `MCP: Failed to get deployment status: ${error.message}`,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('tools/make_environment_public')
  async makeEnvironmentPublic(
    @CurrentUser() user: User,
    @Body() params: { environmentId: string; domain: string },
  ): Promise<McpToolResponse> {
    try {
      this.logger.log(
        `MCP: Making environment ${params.environmentId} public with domain ${params.domain}`,
      );

      const environment = await this.environmentsService.makePublic(
        user.id,
        params.environmentId,
        params.domain,
      );

      return {
        success: true,
        data: {
          id: environment.id,
          name: environment.name,
          publicDomain: environment.publicDomain,
          message: `Environment "${environment.name}" is now accessible at ${params.domain}`,
        },
      };
    } catch (error) {
      this.logger.error(
        `MCP: Failed to make environment public: ${error.message}`,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('tools/list')
  async listTools(): Promise<{ tools: Array<{ name: string; description: string; parameters: any }> }> {
    return {
      tools: [
        {
          name: 'create_environment',
          description: 'Create a new isolated deployment environment with private overlay network',
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Environment name (alphanumeric, hyphens, underscores only)',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'list_environments',
          description: 'List all environments for the authenticated user',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'create_deployment',
          description: 'Deploy a container to an environment',
          parameters: {
            type: 'object',
            properties: {
              environmentId: { type: 'string', description: 'Environment ID' },
              image: { type: 'string', description: 'Docker image name' },
              tag: { type: 'string', description: 'Image tag (default: latest)' },
              replicas: { type: 'number', description: 'Number of replicas (default: 1)' },
              ports: {
                type: 'array',
                description: 'Port mappings',
                items: {
                  type: 'object',
                  properties: {
                    container: { type: 'number' },
                    host: { type: 'number' },
                    protocol: { type: 'string', enum: ['tcp', 'udp'] },
                  },
                },
              },
              envVars: {
                type: 'object',
                description: 'Environment variables',
              },
              volumes: {
                type: 'array',
                description: 'Volume mounts',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    path: { type: 'string' },
                    readOnly: { type: 'boolean' },
                  },
                },
              },
            },
            required: ['environmentId', 'image'],
          },
        },
        {
          name: 'get_deployment_status',
          description: 'Check the status of a deployment by job ID',
          parameters: {
            type: 'object',
            properties: {
              jobId: { type: 'string', description: 'Deployment job ID' },
            },
            required: ['jobId'],
          },
        },
        {
          name: 'make_environment_public',
          description: 'Enable public HTTPS access for an environment with automatic SSL',
          parameters: {
            type: 'object',
            properties: {
              environmentId: { type: 'string', description: 'Environment ID' },
              domain: { type: 'string', description: 'Public domain name' },
            },
            required: ['environmentId', 'domain'],
          },
        },
      ],
    };
  }
}
