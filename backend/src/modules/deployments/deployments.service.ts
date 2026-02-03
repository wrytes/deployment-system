import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../core/database/prisma.service';
import { ContainerService } from '../../integrations/docker/container.service';
import { VolumeService } from '../../integrations/docker/volume.service';
import {
  DeploymentStatus,
  ServiceStatus,
  EnvironmentStatus,
} from '@prisma/client';
import { nanoid } from 'nanoid';
import {
  DeploymentSuccessEvent,
  DeploymentFailedEvent,
  DeploymentStartedEvent,
  DeploymentStoppedEvent,
} from '../../common/events/notification.events';

export interface CreateDeploymentDto {
  environmentId: string;
  image: string;
  tag?: string;
  replicas?: number;
  ports?: Array<{ container: number; host?: number; protocol?: 'tcp' | 'udp' }>;
  envVars?: Record<string, string>;
  volumes?: Array<{ name: string; path: string; readOnly?: boolean }>;
}

export interface CreateDeploymentFromGitDto {
  environmentId: string;
  gitUrl: string;
  branch?: string;
  baseImage?: string; // e.g., "node:22", "python:3.11-alpine"
  buildContext?: string;
  dockerfile?: string;
  installCommand?: string; // e.g., "yarn install" or "pip install -r requirements.txt"
  buildCommand?: string; // e.g., "yarn run build" or "go build"
  startCommand?: string; // e.g., "yarn start" or "python app.py"
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
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createDeployment(userId: string, dto: CreateDeploymentDto) {
    this.logger.log(`Creating deployment for environment ${dto.environmentId}`);

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
    this.processDeployment(deployment.id, environment.overlayNetworkId).catch(
      (error) => {
        this.logger.error(
          `Deployment processing failed for ${deployment.id}: ${error.message}`,
        );
      },
    );

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

      // Emit deployment started event
      this.eventEmitter.emit(
        'deployment.started',
        new DeploymentStartedEvent(
          deployment.environment.userId,
          deploymentId,
          deployment.environmentId,
          deployment.environment.name,
          deployment.image,
          deployment.tag,
          false, // isGitDeployment
        ),
      );

      // Pull image
      this.logger.log(`Pulling image ${deployment.image}:${deployment.tag}`);
      await this.containerService.pullImage(deployment.image, deployment.tag);

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
          const volumeName = `vol_${deployment.environment.name}_${volume.name}`;
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

      // Create service name using jobId (stays under 63 char limit)
      const serviceName = `job_${deployment.environment.name}_${deployment.jobId}`;

      // Create Docker Swarm service
      this.logger.log(`Creating service ${serviceName}`);

      const ports = deployment.ports as any as Array<{
        container: number;
        host?: number;
        protocol?: 'tcp' | 'udp';
      }>;

      const envVars = deployment.envVars as any as Record<string, string>;

      // Check if environment is public and inject proxy env vars
      // nginx-proxy will auto-detect these via docker socket
      if (
        deployment.environment.isPublic &&
        deployment.environment.publicDomain
      ) {
        const proxyEnvVars = this.getProxyEnvironmentVariables(
          deployment.environment.publicDomain,
          serviceName,
          ports,
        );
        Object.assign(envVars || {}, proxyEnvVars);
      }

      // Services stay on their environment's overlay network only
      // nginx-proxy attaches to the environment network for isolation

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

      // Create service record
      await this.prisma.service.create({
        data: {
          deploymentId: deployment.id,
          name: serviceName,
          status: ServiceStatus.RUNNING,
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

      // Emit deployment success event
      this.eventEmitter.emit(
        'deployment.success',
        new DeploymentSuccessEvent(
          deployment.environment.userId,
          deploymentId,
          deployment.environmentId,
          deployment.environment.name,
          deployment.image,
          deployment.tag,
          false, // isGitDeployment
        ),
      );

      this.logger.log(`Deployment ${deploymentId} completed successfully`);
    } catch (error) {
      this.logger.error(
        `Deployment ${deploymentId} failed: ${error.message}`,
        error.stack,
      );

      // Get deployment details for event
      const failedDeployment = await this.prisma.deployment.findUnique({
        where: { id: deploymentId },
        include: { environment: true },
      });

      // Update status to FAILED
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: DeploymentStatus.FAILED,
          errorMessage: error.message,
          completedAt: new Date(),
        },
      });

      // Emit deployment failed event
      if (failedDeployment) {
        this.eventEmitter.emit(
          'deployment.failed',
          new DeploymentFailedEvent(
            failedDeployment.environment.userId,
            deploymentId,
            failedDeployment.environmentId,
            failedDeployment.environment.name,
            failedDeployment.image,
            error.message,
            false, // isGitDeployment
          ),
        );
      }
    }
  }

  async getDeploymentStatus(userId: string, jobId: string) {
    const deployment = await this.prisma.deployment.findFirst({
      where: {
        jobId,
        environment: { userId },
      },
      include: {
        service: true,
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
        service: true,
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
      include: { service: true },
    });

    if (!deployment) {
      throw new NotFoundException('Deployment not found');
    }

    if (!deployment.service) {
      return 'No service found for this deployment';
    }

    if (!deployment.service.name) {
      return 'Service name not available';
    }

    try {
      return await this.containerService.getServiceLogs(
        deployment.service.name,
        tail,
      );
    } catch (error) {
      this.logger.error(
        `Failed to get logs for deployment ${deploymentId}: ${error.message}`,
      );
      throw error;
    }
  }

  async deleteDeployment(
    userId: string,
    deploymentId: string,
    preserveVolumes = false,
  ): Promise<{ message: string }> {
    this.logger.log(`Deleting deployment ${deploymentId}`);

    // Verify deployment exists and user owns it
    const deployment = await this.prisma.deployment.findFirst({
      where: {
        id: deploymentId,
        environment: { userId },
      },
      include: {
        service: true,
        environment: true,
      },
    });

    if (!deployment) {
      throw new NotFoundException('Deployment not found');
    }

    // Emit deployment stopped event if deployment was running
    if (deployment.status === DeploymentStatus.RUNNING) {
      this.eventEmitter.emit(
        'deployment.stopped',
        new DeploymentStoppedEvent(
          deployment.environment.userId,
          deploymentId,
          deployment.environmentId,
          deployment.environment.name,
          deployment.image,
          deployment.tag,
        ),
      );
    }

    // Remove Docker service
    if (deployment.service?.name) {
      try {
        await this.containerService.removeService(deployment.service.name);
        this.logger.log(`Removed service ${deployment.service.name}`);
      } catch (error) {
        this.logger.warn(
          `Failed to remove service ${deployment.service.name}: ${error.message}`,
        );
      }
    }

    // Delete volumes (unless preserveVolumes=true)
    if (!preserveVolumes && deployment.volumes) {
      const volumes = deployment.volumes as any as Array<{
        name: string;
        path: string;
        readOnly?: boolean;
      }>;

      for (const volume of volumes) {
        try {
          await this.volumeService.deleteVolume(volume.name);
          this.logger.log(`Deleted volume ${volume.name}`);
        } catch (error) {
          this.logger.warn(
            `Failed to delete volume ${volume.name}: ${error.message}`,
          );
        }
      }
    }

    // Hard delete from database (cascade automatically deletes Service record)
    await this.prisma.deployment.delete({
      where: { id: deploymentId },
    });

    this.logger.log(`Deployment ${deploymentId} deleted successfully`);

    return {
      message: preserveVolumes
        ? 'Deployment deleted successfully (volumes preserved)'
        : 'Deployment deleted successfully',
    };
  }

  async createDeploymentFromGit(
    userId: string,
    dto: CreateDeploymentFromGitDto,
  ) {
    this.logger.log(
      `Creating deployment from Git for environment ${dto.environmentId}`,
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
      throw new BadRequestException('Environment is not active');
    }

    // Generate job ID and image name
    const jobId = nanoid(this.JOB_ID_LENGTH);
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const imageName = `img_${environment.name}_${timestampSeconds}`.toLowerCase();
    const tag = dto.branch || 'latest';

    // Create deployment record
    const deployment = await this.prisma.deployment.create({
      data: {
        environmentId: dto.environmentId,
        jobId,
        image: imageName,
        tag,
        replicas: dto.replicas || 1,
        ports: dto.ports || [],
        envVars: dto.envVars || {},
        volumes: dto.volumes || undefined,
        status: DeploymentStatus.PENDING,
      },
    });

    // Start async deployment process
    this.processDeploymentFromGit(
      deployment.id,
      environment.overlayNetworkId,
      dto.gitUrl,
      dto.branch,
      dto.baseImage,
      dto.buildContext,
      dto.dockerfile,
      dto.installCommand,
      dto.buildCommand,
      dto.startCommand,
    ).catch((error) => {
      this.logger.error(`Deployment ${deployment.id} failed: ${error.message}`);
    });

    return {
      jobId,
      deploymentId: deployment.id,
      status: deployment.status,
    };
  }

  private async processDeploymentFromGit(
    deploymentId: string,
    networkName: string,
    gitUrl: string,
    branch?: string,
    baseImage?: string,
    buildContext?: string,
    dockerfile?: string,
    installCommand?: string,
    buildCommand?: string,
    startCommand?: string,
  ): Promise<void> {
    this.logger.log(`Processing deployment from Git: ${deploymentId}`);
    try {
      const deployment = await this.prisma.deployment.findUnique({
        where: { id: deploymentId },
        include: { environment: true },
      });

      if (!deployment) {
        throw new Error('Deployment not found');
      }

      // Step 1: Update status to BUILDING
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: DeploymentStatus.PULLING_IMAGE, // Reusing status for building
          startedAt: new Date(),
        },
      });

      // Emit deployment started event
      this.eventEmitter.emit(
        'deployment.started',
        new DeploymentStartedEvent(
          deployment.environment.userId,
          deploymentId,
          deployment.environmentId,
          deployment.environment.name,
          deployment.image,
          deployment.tag || 'latest',
          true, // isGitDeployment
        ),
      );

      // Build image from Git
      const fullImageName = await this.containerService.buildImageFromGit({
        gitUrl,
        imageName: deployment.image,
        tag: deployment.tag || 'latest',
        branch,
        baseImage,
        buildContext,
        dockerfile,
        installCommand,
        buildCommand,
        startCommand,
      });

      // Step 2: Create volumes if needed
      if (deployment.volumes && Array.isArray(deployment.volumes)) {
        await this.prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: DeploymentStatus.CREATING_VOLUMES },
        });

        for (const volume of deployment.volumes as any[]) {
          const volumeName = `vol_${deployment.environment.name}_${volume.name}`;
          await this.volumeService.createVolume(volumeName, {
            'com.deployment-platform.environment': deployment.environmentId,
            'com.deployment-platform.deployment': deploymentId,
          });
        }
      }

      // Step 3: Create service
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: DeploymentStatus.STARTING_CONTAINERS },
      });

      // Create service name using jobId (stays under 63 char limit)
      const serviceName = `job_${deployment.environment.name}_${deployment.jobId}`;

      // Prepare volumes for Docker
      const volumes: any[] = [];
      if (deployment.volumes && Array.isArray(deployment.volumes)) {
        for (const vol of deployment.volumes as any[]) {
          const volumeName = `vol_${deployment.environment.name}_${vol.name}`;
          volumes.push({
            name: volumeName,
            path: vol.path,
            readOnly: vol.readOnly || false,
          });
        }
      }

      // Prepare environment variables
      const envVars = (deployment.envVars as Record<string, string>) || {};

      // Check if environment is public and inject proxy env vars
      // nginx-proxy will auto-detect these via docker socket
      if (
        deployment.environment.isPublic &&
        deployment.environment.publicDomain
      ) {
        const proxyEnvVars = this.getProxyEnvironmentVariables(
          deployment.environment.publicDomain,
          serviceName,
          deployment.ports as any[],
        );
        Object.assign(envVars, proxyEnvVars);
      }

      // Create service
      await this.containerService.createService({
        name: serviceName,
        image: deployment.image,
        tag: deployment.tag || 'latest',
        replicas: deployment.replicas,
        env: envVars,
        ports: deployment.ports as any[],
        volumes: volumes,
        networks: [networkName],
        labels: {
          'com.deployment-platform.environment': deployment.environmentId,
          'com.deployment-platform.deployment': deploymentId,
          'com.deployment-platform.git-url': gitUrl,
        },
      });

      // Create service record
      await this.prisma.service.create({
        data: {
          deploymentId: deployment.id,
          name: serviceName,
          status: ServiceStatus.RUNNING,
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

      // Emit deployment success event
      this.eventEmitter.emit(
        'deployment.success',
        new DeploymentSuccessEvent(
          deployment.environment.userId,
          deploymentId,
          deployment.environmentId,
          deployment.environment.name,
          deployment.image,
          deployment.tag || 'latest',
          true, // isGitDeployment
        ),
      );

      this.logger.log(
        `Deployment ${deploymentId} from Git completed successfully`,
      );
    } catch (error) {
      this.logger.error(
        `Deployment ${deploymentId} from Git failed: ${error.message}`,
        error.stack,
      );

      // Get deployment details for event
      const failedDeployment = await this.prisma.deployment.findUnique({
        where: { id: deploymentId },
        include: { environment: true },
      });

      // Update status to FAILED
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: DeploymentStatus.FAILED,
          errorMessage: error.message,
          completedAt: new Date(),
        },
      });

      // Emit deployment failed event
      if (failedDeployment) {
        this.eventEmitter.emit(
          'deployment.failed',
          new DeploymentFailedEvent(
            failedDeployment.environment.userId,
            deploymentId,
            failedDeployment.environmentId,
            failedDeployment.environment.name,
            failedDeployment.image,
            error.message,
            true, // isGitDeployment
          ),
        );
      }
    }
  }

  private getProxyEnvironmentVariables(
    domain: string,
    serviceName: string,
    ports?: Array<{
      container: number;
      host?: number;
      protocol?: 'tcp' | 'udp';
    }>,
  ): Record<string, string> {
    const proxyEnvVars: Record<string, string> = {
      VIRTUAL_HOST: domain,
      LETSENCRYPT_HOST: domain,
      LETSENCRYPT_EMAIL:
        process.env.LETSENCRYPT_EMAIL || 'your-email@example.com',
    };

    if (ports && ports.length > 0) {
      proxyEnvVars.VIRTUAL_PORT = ports[0].container.toString();
    }

    return proxyEnvVars;
  }
}
