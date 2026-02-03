import { Injectable, Logger } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { DeploymentsService } from '../../modules/deployments/deployments.service';
import { ClaudeSessionsService } from '../../modules/claude-sessions/claude-sessions.service';
import { VolumeService } from '../../integrations/docker/volume.service';
import { ContainerService } from '../../integrations/docker/container.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as tar from 'tar';

@Injectable()
export class DeploymentTools {
  private readonly logger = new Logger(DeploymentTools.name);

  constructor(
    private readonly deploymentsService: DeploymentsService,
    private readonly claudeSessionsService: ClaudeSessionsService,
    private readonly volumeService: VolumeService,
    private readonly containerService: ContainerService,
  ) {}

  @Tool({
    name: 'create_deployment',
    description: 'Deploy a container to an environment from Docker Hub',
    parameters: z.object({
      environmentId: z.string(),
      image: z.string(),
      tag: z.string().optional(),
      replicas: z.number().optional(),
      ports: z.array(z.object({
        container: z.number(),
        host: z.number().optional(),
        protocol: z.enum(['tcp', 'udp']).optional(),
      })).optional(),
      envVars: z.record(z.string(), z.string()).optional(),
    }),
  })
  async createDeployment(args: any, context: any, user: any) {
    const result = await this.deploymentsService.createDeployment(user.id, args);

    return {
      jobId: result.jobId,
      deploymentId: result.deploymentId,
      status: result.status,
    };
  }

  @Tool({
    name: 'create_deployment_from_git',
    description: 'Deploy from a Git repository with custom build commands. Supports Node.js, Python, Go, etc.',
    parameters: z.object({
      environmentId: z.string(),
      gitUrl: z.string(),
      branch: z.string().optional(),
      baseImage: z.string().optional(),
      installCommand: z.string().optional(),
      buildCommand: z.string().optional(),
      startCommand: z.string().optional(),
      replicas: z.number().optional(),
      ports: z.array(z.object({
        container: z.number(),
        host: z.number().optional(),
      })).optional(),
      envVars: z.record(z.string(), z.string()).optional(),
    }),
  })
  async createDeploymentFromGit(args: any, context: any, user: any) {
    const result = await this.deploymentsService.createDeploymentFromGit(user.id, args);

    return {
      jobId: result.jobId,
      deploymentId: result.deploymentId,
      status: result.status,
    };
  }

  @Tool({
    name: 'get_deployment_status',
    description: 'Check deployment status by job ID',
    parameters: z.object({
      jobId: z.string(),
    }),
  })
  async getDeploymentStatus(args: any, context: any, user: any) {
    const deployment = await this.deploymentsService.getDeploymentStatus(user.id, args.jobId);

    return {
      jobId: deployment.jobId,
      status: deployment.status,
      image: `${deployment.image}:${deployment.tag}`,
      replicas: deployment.replicas,
      environment: deployment.environment.name,
      containers: deployment.containers,
    };
  }

  @Tool({
    name: 'get_deployment_logs',
    description: 'Retrieve logs from a deployment\'s containers',
    parameters: z.object({
      deploymentId: z.string(),
      tail: z.number().optional(),
    }),
  })
  async getDeploymentLogs(args: any, context: any, user: any) {
    const logs = await this.deploymentsService.getDeploymentLogs(
      user.id,
      args.deploymentId,
      args.tail || 100,
    );

    return { logs };
  }

  @Tool({
    name: 'deploy_from_workspace',
    description: 'Deploy application from Claude Code workspace. Reads files from workspace volume, builds Docker image, and deploys to environment.',
    parameters: z.object({
      sessionId: z.string().describe('Claude session ID'),
      workspacePath: z.string().describe('Path to app in workspace (e.g., /workspace/my-app)'),
      environmentId: z.string().describe('Environment to deploy to'),
      image: z.string().optional().describe('Custom image name (defaults to session project name)'),
      tag: z.string().optional().describe('Image tag (defaults to timestamp)'),
      replicas: z.number().optional().describe('Number of replicas (defaults to 1)'),
      ports: z.array(z.object({
        container: z.number(),
        host: z.number().optional(),
      })).optional().describe('Port mappings'),
      envVars: z.record(z.string(), z.string()).optional().describe('Environment variables'),
    }),
  })
  async deployFromWorkspace(args: any, context: any, user: any) {
    this.logger.log(`Deploying from workspace: ${args.sessionId}`);

    try {
      // Verify session belongs to authenticated user
      const session = await this.claudeSessionsService.getSession(
        user.id,
        args.sessionId,
      );

      if (session.status !== 'ACTIVE') {
        throw new Error(`Session is not active (status: ${session.status})`);
      }

      // TODO: Implement workspace file reading and Docker image building
      // For now, return a placeholder response
      return {
        status: 'pending',
        message: 'Workspace deployment is not yet fully implemented. This is a placeholder for the feature.',
        deploymentId: null,
        note: 'Full implementation requires: 1) Read files from workspace volume, 2) Build Docker image from workspace, 3) Deploy using DeploymentsService',
      };
    } catch (error) {
      this.logger.error(`Failed to deploy from workspace: ${error.message}`);
      throw error;
    }
  }

  @Tool({
    name: 'deploy_compose_stack',
    description: 'Deploy multi-container stack from docker-compose.yml in Claude Code workspace',
    parameters: z.object({
      sessionId: z.string().describe('Claude session ID'),
      composePath: z.string().describe('Path to docker-compose.yml in workspace'),
      environmentId: z.string().describe('Environment to deploy to'),
      envVars: z.record(z.string(), z.string()).optional().describe('Override environment variables'),
    }),
  })
  async deployComposeStack(args: any, context: any, user: any) {
    this.logger.log(`Deploying compose stack from workspace: ${args.sessionId}`);

    try {
      // Verify session belongs to authenticated user
      const session = await this.claudeSessionsService.getSession(
        user.id,
        args.sessionId,
      );

      if (session.status !== 'ACTIVE') {
        throw new Error(`Session is not active (status: ${session.status})`);
      }

      // TODO: Implement docker-compose stack deployment
      // For now, return a placeholder response
      return {
        status: 'pending',
        message: 'Docker Compose stack deployment is not yet fully implemented. This is a placeholder for the feature.',
        deployments: [],
        note: 'Full implementation requires: 1) Read docker-compose.yml from workspace, 2) Parse and validate, 3) Create deployments for each service',
      };
    } catch (error) {
      this.logger.error(`Failed to deploy compose stack: ${error.message}`);
      throw error;
    }
  }
}
