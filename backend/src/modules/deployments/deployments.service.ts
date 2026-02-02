import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { ContainerService } from '../../integrations/docker/container.service';
import { VolumeService } from '../../integrations/docker/volume.service';
import { DeploymentStatus, ContainerStatus, EnvironmentStatus } from '@prisma/client';
import { nanoid } from 'nanoid';

export interface CreateDeploymentDto {
  environmentId: string;
  image: string;
  tag?: string;
  replicas?: number;
  ports?: Array<{ container: number; host?: number; protocol?: 'tcp' | 'udp' }>;
  envVars?: Record<string, string>;
  volumes?: Array<{ name: string; path: string; readOnly?: boolean }>;
}

@Injectable()
export class DeploymentsService {
  private readonly logger = new Logger(DeploymentsService.name);
  private readonly JOB_ID_LENGTH = 16;

  constructor(
    private readonly prisma: PrismaService,
    private readonly containerService: ContainerService,
    private readonly volumeService: VolumeService,
  ) {}

  async createDeployment(userId: string, dto: CreateDeploymentDto) {
    this.logger.log(
      `Creating deployment for environment ${dto.environmentId}`,
    );

    // Verify environment exists and belongs to user
    const environment = await this.prisma.environment.findFirst({
      where: {
        id: dto.environmentId,
        userId,
      },
    });

    if (!environment) {
      throw new NotFoundException('Environment not found');
    }

    if (environment.status !== EnvironmentStatus.ACTIVE) {
      throw new BadRequestException(
        'Environment must be in ACTIVE status to deploy',
      );
    }

    // Generate job ID
    const jobId = nanoid(this.JOB_ID_LENGTH);

    // Create deployment record
    const deployment = await this.prisma.deployment.create({
      data: {
        environmentId: dto.environmentId,
        jobId,
        image: dto.image,
        tag: dto.tag || 'latest',
        replicas: dto.replicas || 1,
        ports: dto.ports as any,
        envVars: dto.envVars as any,
        volumes: dto.volumes as any,
        status: DeploymentStatus.PENDING,
      },
    });

    // Start async deployment process (fire and forget)
    this.processDeployment(
      deployment.id,
      environment.overlayNetworkId,
    ).catch((error) => {
      this.logger.error(
        `Deployment processing failed for ${deployment.id}: ${error.message}`,
      );
    });

    return {
      jobId: deployment.jobId,
      deploymentId: deployment.id,
      status: deployment.status,
    };
  }

  private async processDeployment(
    deploymentId: string,
    networkName: string,
  ): Promise<void> {
    this.logger.log(`Processing deployment ${deploymentId}`);

    try {
      // Get deployment details
      const deployment = await this.prisma.deployment.findUnique({
        where: { id: deploymentId },
        include: { environment: true },
      });

      if (!deployment) {
        throw new Error('Deployment not found');
      }

      // Step 1: Update status to PULLING_IMAGE
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: DeploymentStatus.PULLING_IMAGE,
          startedAt: new Date(),
        },
      });

      // Pull image
      this.logger.log(
        `Pulling image ${deployment.image}:${deployment.tag}`,
      );
      await this.containerService.pullImage(
        deployment.image,
        deployment.tag,
      );

      // Step 2: Update status to CREATING_VOLUMES
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: DeploymentStatus.CREATING_VOLUMES },
      });

      // Create volumes if specified
      const volumes = deployment.volumes as any as Array<{
        name: string;
        path: string;
        readOnly?: boolean;
      }>;

      if (volumes && volumes.length > 0) {
        for (const volume of volumes) {
          const volumeName = `${deployment.environment.name}_${volume.name}`;
          this.logger.log(`Creating volume ${volumeName}`);

          await this.volumeService.createVolume(volumeName, {
            'com.deployment-platform.environment': deployment.environmentId,
            'com.deployment-platform.deployment': deploymentId,
          });

          // Update volume reference to use full name
          volume.name = volumeName;
        }

        // Update deployment with full volume names
        await this.prisma.deployment.update({
          where: { id: deploymentId },
          data: { volumes: volumes as any },
        });
      }

      // Step 3: Update status to STARTING_CONTAINERS
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: DeploymentStatus.STARTING_CONTAINERS },
      });

      // Create service name
      const serviceName = `${deployment.environment.name}_${deployment.image.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;

      // Create Docker Swarm service
      this.logger.log(`Creating service ${serviceName}`);

      const ports = deployment.ports as any as Array<{
        container: number;
        host?: number;
        protocol?: 'tcp' | 'udp';
      }>;

      const envVars = deployment.envVars as any as Record<string, string>;

      await this.containerService.createService({
        name: serviceName,
        image: deployment.image,
        tag: deployment.tag,
        replicas: deployment.replicas,
        env: envVars,
        ports: ports,
        volumes: volumes,
        networks: [networkName],
        labels: {
          'com.deployment-platform.environment': deployment.environmentId,
          'com.deployment-platform.deployment': deploymentId,
        },
      });

      // Create container record
      await this.prisma.container.create({
        data: {
          deploymentId: deployment.id,
          name: serviceName,
          status: ContainerStatus.RUNNING,
        },
      });

      // Step 4: Update status to RUNNING
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: DeploymentStatus.RUNNING,
          completedAt: new Date(),
        },
      });

      this.logger.log(`Deployment ${deploymentId} completed successfully`);
    } catch (error) {
      this.logger.error(
        `Deployment ${deploymentId} failed: ${error.message}`,
        error.stack,
      );

      // Update status to FAILED
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: DeploymentStatus.FAILED,
          errorMessage: error.message,
          completedAt: new Date(),
        },
      });
    }
  }

  async getDeploymentStatus(userId: string, jobId: string) {
    const deployment = await this.prisma.deployment.findFirst({
      where: {
        jobId,
        environment: { userId },
      },
      include: {
        containers: true,
        environment: {
          select: {
            id: true,
            name: true,
            isPublic: true,
            publicDomain: true,
          },
        },
      },
    });

    if (!deployment) {
      throw new NotFoundException('Deployment not found');
    }

    return deployment;
  }

  async listDeployments(userId: string, environmentId: string) {
    // Verify environment belongs to user
    const environment = await this.prisma.environment.findFirst({
      where: {
        id: environmentId,
        userId,
      },
    });

    if (!environment) {
      throw new NotFoundException('Environment not found');
    }

    return this.prisma.deployment.findMany({
      where: { environmentId },
      include: {
        containers: true,
        _count: {
          select: { containers: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getDeploymentLogs(
    userId: string,
    deploymentId: string,
    tail = 100,
  ): Promise<string> {
    const deployment = await this.prisma.deployment.findFirst({
      where: {
        id: deploymentId,
        environment: { userId },
      },
      include: { containers: true },
    });

    if (!deployment) {
      throw new NotFoundException('Deployment not found');
    }

    if (deployment.containers.length === 0) {
      return 'No containers found for this deployment';
    }

    // Get logs from the first container (service)
    const container = deployment.containers[0];

    if (!container.name) {
      return 'Container name not available';
    }

    try {
      return await this.containerService.getServiceLogs(
        container.name,
        tail,
      );
    } catch (error) {
      this.logger.error(
        `Failed to get logs for deployment ${deploymentId}: ${error.message}`,
      );
      throw error;
    }
  }
}
