import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { ContainerService } from '../../integrations/docker/container.service';
import { NetworkService } from '../../integrations/docker/network.service';
import { DeploymentStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class StartupService implements OnModuleInit {
  private readonly logger = new Logger(StartupService.name);
  private readonly recoveryEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly containerService: ContainerService,
    private readonly networkService: NetworkService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.recoveryEnabled = this.configService.get<boolean>(
      'app.enableDeploymentRecovery',
      true,
    );
  }

  async onModuleInit() {
    if (!this.recoveryEnabled) {
      this.logger.log('Deployment recovery is disabled');
      return;
    }

    this.logger.log('Starting deployment recovery process...');

    try {
      // Wait for database to be ready
      await this.waitForDatabase();

      // Recover running deployments
      await this.recoverDeployments();

      this.logger.log('Deployment recovery completed');
    } catch (error) {
      this.logger.error(`Deployment recovery failed: ${error.message}`);
      // Don't throw - allow app to start even if recovery fails
    }
  }

  private async waitForDatabase(maxAttempts = 10): Promise<void> {
    let attempt = 0;
    let delay = 1000; // Start with 1 second

    while (attempt < maxAttempts) {
      try {
        await this.prisma.$queryRaw`SELECT 1`;
        this.logger.log('Database connection established');
        return;
      } catch (error) {
        attempt++;
        if (attempt >= maxAttempts) {
          throw new Error(
            `Failed to connect to database after ${maxAttempts} attempts`,
          );
        }

        this.logger.warn(
          `Database not ready (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`,
        );
        await this.sleep(delay);
        delay = Math.min(delay * 2, 10000); // Exponential backoff, max 10s
      }
    }
  }

  private async recoverDeployments(): Promise<void> {
    // Get all RUNNING deployments
    const runningDeployments = await this.prisma.deployment.findMany({
      where: { status: DeploymentStatus.RUNNING },
      include: {
        service: true,
        environment: true,
      },
    });

    if (runningDeployments.length === 0) {
      this.logger.log('No running deployments to recover');
      return;
    }

    this.logger.log(
      `Found ${runningDeployments.length} running deployment(s) to check`,
    );

    for (const deployment of runningDeployments) {
      try {
        await this.checkAndRecoverDeployment(deployment);
      } catch (error) {
        this.logger.error(
          `Failed to check/recover deployment ${deployment.id}: ${error.message}`,
        );
        // Continue with other deployments
      }
    }
  }

  private async checkAndRecoverDeployment(deployment: any): Promise<void> {
    const serviceName = this.buildServiceName(deployment);

    this.logger.log(`Checking deployment ${deployment.id} (${serviceName})...`);

    // Check if service exists in Docker
    const serviceExists = await this.containerService.serviceExists(
      serviceName,
    );

    if (serviceExists) {
      this.logger.log(`✓ Service ${serviceName} is running`);
      return;
    }

    // Service is missing - restart it
    this.logger.warn(
      `Service ${serviceName} not found in Docker, attempting recovery...`,
    );

    await this.restartDeployment(deployment);
  }

  private async restartDeployment(deployment: any): Promise<void> {
    const serviceName = this.buildServiceName(deployment);

    try {
      // Ensure environment network exists
      const networkName = this.buildNetworkName(deployment.environment);
      const networkExists = await this.networkService.networkExists(networkName);

      if (!networkExists) {
        this.logger.warn(
          `Network ${networkName} does not exist, creating it...`,
        );
        await this.networkService.createOverlayNetwork(networkName);
      }

      // Recreate the service using deployment configuration
      const serviceConfig = this.buildServiceConfig(deployment);
      await this.containerService.createService(serviceConfig);

      this.logger.log(`✓ Successfully recovered deployment ${deployment.id}`);

      // Emit recovery event
      this.eventEmitter.emit('deployment.recovered', {
        deploymentId: deployment.id,
        serviceName,
      });
    } catch (error) {
      this.logger.error(
        `Failed to restart deployment ${deployment.id}: ${error.message}`,
      );

      // Update deployment status to FAILED
      await this.prisma.deployment
        .update({
          where: { id: deployment.id },
          data: {
            status: DeploymentStatus.FAILED,
          },
        })
        .catch((updateError) => {
          this.logger.error(
            `Failed to update deployment status: ${updateError.message}`,
          );
        });

      // Emit failure event
      this.eventEmitter.emit('deployment.recovery-failed', {
        deploymentId: deployment.id,
        serviceName,
        error: error.message,
      });

      throw error;
    }
  }

  private buildServiceName(deployment: any): string {
    return `${deployment.environment.name}_${deployment.service.name}_${deployment.id}`;
  }

  private buildNetworkName(environment: any): string {
    return `${environment.name}_network`;
  }

  private buildServiceConfig(deployment: any): any {
    const serviceName = this.buildServiceName(deployment);
    const networkName = this.buildNetworkName(deployment.environment);

    // Parse configuration from deployment
    const config: any = {
      name: serviceName,
      image: deployment.image,
      tag: deployment.tag || 'latest',
      replicas: deployment.replicas || 1,
      networks: [networkName],
      labels: {
        'deployment.id': deployment.id,
        'deployment.service': deployment.service.name,
        'deployment.environment': deployment.environment.name,
      },
    };

    // Add environment variables if configured
    if (deployment.environmentVariables) {
      config.env = deployment.environmentVariables;
    }

    // Add resource limits if configured
    if (deployment.cpuLimit) {
      config.cpuLimit = deployment.cpuLimit;
    }
    if (deployment.memoryLimit) {
      config.memoryLimit = deployment.memoryLimit;
    }

    // Add domain labels for public access
    if (deployment.environment.isPublic && deployment.domain) {
      config.labels['VIRTUAL_HOST'] = deployment.domain;
      config.labels['LETSENCRYPT_HOST'] = deployment.domain;
    }

    return config;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
