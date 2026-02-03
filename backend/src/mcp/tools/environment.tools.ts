import { Injectable, Logger } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { EnvironmentsService } from '../../modules/environments/environments.service';

@Injectable()
export class EnvironmentTools {
  private readonly logger = new Logger(EnvironmentTools.name);

  constructor(private readonly environmentsService: EnvironmentsService) {}

  @Tool({
    name: 'create_environment',
    description: 'Create a new isolated deployment environment with private overlay network',
    parameters: z.object({
      name: z.string().describe('Environment name (alphanumeric, hyphens, underscores only)'),
    }),
  })
  async createEnvironment(args: any, context: any, user: any) {
    const environment = await this.environmentsService.createEnvironment(user.id, args.name);

    return {
      id: environment.id,
      name: environment.name,
      overlayNetworkId: environment.overlayNetworkId,
      status: environment.status,
    };
  }

  @Tool({
    name: 'list_environments',
    description: 'List all environments for the authenticated user',
    parameters: z.object({}),
  })
  async listEnvironments(args: any, context: any, user: any) {
    const environments = await this.environmentsService.listEnvironments(user.id);

    return {
      environments: environments.map((env) => ({
        id: env.id,
        name: env.name,
        status: env.status,
        isPublic: env.isPublic,
        publicDomain: env.publicDomain,
      })),
      count: environments.length,
    };
  }

  @Tool({
    name: 'make_environment_public',
    description: 'Enable public HTTPS access for an environment with automatic SSL from Let\'s Encrypt',
    parameters: z.object({
      environmentId: z.string(),
      domain: z.string(),
    }),
  })
  async makeEnvironmentPublic(args: any, context: any, user: any) {
    const environment = await this.environmentsService.makePublic(
      user.id,
      args.environmentId,
      args.domain,
    );

    return {
      id: environment.id,
      name: environment.name,
      publicDomain: environment.publicDomain,
      isPublic: environment.isPublic,
    };
  }
}
