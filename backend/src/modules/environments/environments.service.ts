import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { NetworkService } from '../../integrations/docker/network.service';
import { ContainerService } from '../../integrations/docker/container.service';
import { VolumeService } from '../../integrations/docker/volume.service';
import { EnvironmentStatus, DeploymentStatus, ServiceStatus } from '@prisma/client';

@Injectable()
export class EnvironmentsService {
  private readonly logger = new Logger(EnvironmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly networkService: NetworkService,
    private readonly containerService: ContainerService,
    private readonly volumeService: VolumeService,
  ) {}

  async createEnvironment(userId: string, name: string) {
    this.logger.log(`Creating environment "${name}" for user ${userId}`);

    // Check if environment name already exists for this user
    const existing = await this.prisma.environment.findUnique({
      where: {
        userId_name: { userId, name },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Environment with name "${name}" already exists`,
      );
    }

    // Validate name (alphanumeric, hyphens, underscores only)
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new BadRequestException(
        'Environment name can only contain alphanumeric characters, hyphens, and underscores',
      );
    }

    // Generate unique overlay network ID
    const timestamp = Date.now();
    const overlayNetworkId = `overlay_env_${name}_${timestamp}`;

    // Create database record first (CREATING status)
    const environment = await this.prisma.environment.create({
      data: {
        userId,
        name,
        overlayNetworkId,
        status: EnvironmentStatus.CREATING,
      },
    });

    try {
      // Create Docker overlay network
      const network = await this.networkService.createOverlayNetwork(
        overlayNetworkId,
        {
          'com.deployment-platform.environment': environment.id,
          'com.deployment-platform.user': userId,
        },
      );

      // Update environment with Docker network ID and set to ACTIVE
      const updatedEnvironment = await this.prisma.environment.update({
        where: { id: environment.id },
        data: {
          dockerNetworkId: network.id,
          status: EnvironmentStatus.ACTIVE,
        },
      });

      this.logger.log(
        `Environment "${name}" created successfully with network ${overlayNetworkId}`,
      );

      return updatedEnvironment;
    } catch (error) {
      // Rollback: mark environment as ERROR
      await this.prisma.environment.update({
        where: { id: environment.id },
        data: {
          status: EnvironmentStatus.ERROR,
          errorMessage: error.message,
        },
      });

      this.logger.error(
        `Failed to create environment "${name}": ${error.message}`,
      );
      throw error;
    }
  }

  async getEnvironment(userId: string, environmentId: string) {
    const environment = await this.prisma.environment.findFirst({
      where: {
        id: environmentId,
        userId,
      },
      include: {
        deployments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!environment) {
      throw new NotFoundException('Environment not found');
    }

    return environment;
  }

  async listEnvironments(userId: string) {
    return this.prisma.environment.findMany({
      where: {
        userId,
        status: {
          not: EnvironmentStatus.DELETED,
        },
      },
      include: {
        _count: {
          select: { deployments: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async deleteEnvironment(userId: string, environmentId: string) {
    this.logger.log(`Deleting environment ${environmentId}`);

    const environment = await this.getEnvironment(userId, environmentId);

    if (environment.status === EnvironmentStatus.DELETING) {
      throw new ConflictException('Environment is already being deleted');
    }

    if (environment.status === EnvironmentStatus.DELETED) {
      throw new ConflictException('Environment is already deleted');
    }

    // Mark as DELETING
    await this.prisma.environment.update({
      where: { id: environmentId },
      data: { status: EnvironmentStatus.DELETING },
    });

    try {
      // Get all deployments for this environment
      const deployments = await this.prisma.deployment.findMany({
        where: { environmentId },
        include: { service: true },
      });

      // Remove all services
      for (const deployment of deployments) {
        if (deployment.service?.name) {
          try {
            await this.containerService.removeService(deployment.service.name);
          } catch (error) {
            this.logger.warn(
              `Failed to remove service ${deployment.service.name}: ${error.message}`,
            );
          }
        }
      }

      // Delete all volumes for this environment
      const volumes = await this.volumeService.listVolumes(environmentId);
      for (const volume of volumes) {
        try {
          await this.volumeService.deleteVolume(volume.Name);
        } catch (error) {
          this.logger.warn(
            `Failed to delete volume ${volume.Name}: ${error.message}`,
          );
        }
      }

      // nginx-proxy will automatically detach when network is deleted
      // No manual detachment needed

      // Delete overlay network
      if (environment.overlayNetworkId) {
        try {
          await this.networkService.deleteNetwork(environment.overlayNetworkId);
        } catch (error) {
          this.logger.warn(
            `Failed to delete network ${environment.overlayNetworkId}: ${error.message}`,
          );
        }
      }

      // Mark as DELETED
      await this.prisma.environment.update({
        where: { id: environmentId },
        data: { status: EnvironmentStatus.DELETED },
      });

      this.logger.log(`Environment ${environmentId} deleted successfully`);

      return { message: 'Environment deleted successfully' };
    } catch (error) {
      // Mark as ERROR
      await this.prisma.environment.update({
        where: { id: environmentId },
        data: {
          status: EnvironmentStatus.ERROR,
          errorMessage: `Deletion failed: ${error.message}`,
        },
      });

      this.logger.error(
        `Failed to delete environment ${environmentId}: ${error.message}`,
      );
      throw error;
    }
  }

  async makePublic(
    userId: string,
    environmentId: string,
    domain: string,
  ) {
    this.logger.log(
      `Making environment ${environmentId} public with domain ${domain}`,
    );

    const environment = await this.getEnvironment(userId, environmentId);

    if (environment.isPublic) {
      throw new ConflictException('Environment is already public');
    }

    if (environment.status !== EnvironmentStatus.ACTIVE) {
      throw new BadRequestException(
        'Environment must be in ACTIVE status to make public',
      );
    }

    // Validate domain format
    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
      throw new BadRequestException('Invalid domain format');
    }

    // Check if domain is already in use
    const existingDomain = await this.prisma.environment.findUnique({
      where: { publicDomain: domain },
    });

    if (existingDomain) {
      throw new ConflictException('Domain is already in use');
    }

    try {
      // Attach nginx-proxy to this environment's overlay network for isolation
      const nginxContainerName = process.env.NGINX_CONTAINER_NAME || 'nginx_proxy';
      await this.networkService.attachContainerToNetwork(
        nginxContainerName,
        environment.overlayNetworkId,
      );

      // Update database
      const updated = await this.prisma.environment.update({
        where: { id: environmentId },
        data: { isPublic: true, publicDomain: domain },
      });

      // Update existing services to add VIRTUAL_HOST env vars
      // nginx-proxy will auto-detect them via docker socket
      await this.updateDeploymentsForPublicAccess(environmentId, domain);

      this.logger.log(`Environment ${environmentId} is now public at ${domain}`);
      return updated;
    } catch (error) {
      this.logger.error(`Failed to make environment public: ${error.message}`);
      throw error;
    }
  }

  private async updateDeploymentsForPublicAccess(environmentId: string, domain: string): Promise<void> {
    const deployments = await this.prisma.deployment.findMany({
      where: { environmentId, status: DeploymentStatus.RUNNING },
      include: { service: true },
    });

    // Update running services to add proxy env vars
    // nginx-proxy watches docker socket and will auto-configure
    for (const deployment of deployments) {
      if (deployment.service?.name && deployment.service.status === ServiceStatus.RUNNING) {
        await this.addProxyEnvVarsToService(deployment.service.name, domain);
      }
    }
  }

  private async addProxyEnvVarsToService(serviceName: string, domain: string): Promise<void> {
    const service = await this.containerService.getService(serviceName);
    if (!service) {
      this.logger.warn(`Service ${serviceName} not found, skipping proxy env vars update`);
      return;
    }

    const inspection = await service.inspect();

    const currentEnv = inspection.Spec.TaskTemplate.ContainerSpec.Env || [];
    const proxyEnvVars = [
      `VIRTUAL_HOST=${domain}`,
      `LETSENCRYPT_HOST=${domain}`,
      `LETSENCRYPT_EMAIL=${process.env.LETSENCRYPT_EMAIL || 'your-email@example.com'}`,
    ];

    // Add proxy env vars if not already present
    const envVarsToAdd = proxyEnvVars.filter(
      (envVar: string) => !currentEnv.some((existing: string) => existing.startsWith(envVar.split('=')[0] + '='))
    );

    if (envVarsToAdd.length > 0) {
      await service.update({
        version: parseInt(inspection.Version.Index),
        TaskTemplate: {
          ...inspection.Spec.TaskTemplate,
          ContainerSpec: {
            ...inspection.Spec.TaskTemplate.ContainerSpec,
            Env: [...currentEnv, ...envVarsToAdd],
          },
        },
      });
      this.logger.log(`Added proxy env vars to service ${serviceName}`);
    }
  }
}
