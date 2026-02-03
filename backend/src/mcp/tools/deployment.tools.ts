import { Injectable, Logger } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { DeploymentsService } from '../../modules/deployments/deployments.service';

@Injectable()
export class DeploymentTools {
  private readonly logger = new Logger(DeploymentTools.name);

  constructor(private readonly deploymentsService: DeploymentsService) {}

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
}
