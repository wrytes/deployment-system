import { Injectable, Logger } from '@nestjs/common';
import { DockerService } from './docker.service';
import Docker from 'dockerode';

export interface ServiceConfig {
  name: string;
  image: string;
  tag?: string;
  replicas?: number;
  env?: Record<string, string>;
  ports?: Array<{ container: number; host?: number; protocol?: 'tcp' | 'udp' }>;
  volumes?: Array<{ name: string; path: string; readOnly?: boolean }>;
  networks?: string[];
  labels?: Record<string, string>;
  cpuLimit?: number; // In CPU units (1.0 = 1 CPU)
  memoryLimit?: number; // In bytes
  healthCheck?: {
    test: string[];
    interval?: number;
    timeout?: number;
    retries?: number;
  };
}

@Injectable()
export class ContainerService {
  private readonly logger = new Logger(ContainerService.name);
  private readonly docker: Docker;

  constructor(private readonly dockerService: DockerService) {
    this.docker = this.dockerService.getClient();
  }

  async pullImage(image: string, tag = 'latest'): Promise<void> {
    const fullImage = `${image}:${tag}`;
    this.logger.log(`Pulling image: ${fullImage}`);

    return new Promise((resolve, reject) => {
      this.docker.pull(fullImage, (err: any, stream: any) => {
        if (err) {
          return reject(err);
        }

        this.docker.modem.followProgress(
          stream,
          (err: any, output: any) => {
            if (err) {
              this.logger.error(`Failed to pull image ${fullImage}: ${err.message}`);
              return reject(err);
            }
            this.logger.log(`Image pulled successfully: ${fullImage}`);
            resolve();
          },
          (event) => {
            if (event.status) {
              this.logger.debug(`Pull progress: ${event.status} ${event.id || ''}`);
            }
          },
        );
      });
    });
  }

  async createService(config: ServiceConfig): Promise<Docker.Service> {
    try {
      this.logger.log(`Creating service: ${config.name}`);

      const fullImage = `${config.image}:${config.tag || 'latest'}`;

      // Build environment variables array
      const env = config.env
        ? Object.entries(config.env).map(([key, value]) => `${key}=${value}`)
        : [];

      // Build port mappings
      const ports: any[] = [];
      if (config.ports) {
        config.ports.forEach((port) => {
          ports.push({
            TargetPort: port.container,
            PublishedPort: port.host,
            Protocol: port.protocol || 'tcp',
            PublishMode: port.host ? 'host' : undefined,
          });
        });
      }

      // Build volume mounts
      const mounts: any[] = [];
      if (config.volumes) {
        config.volumes.forEach((volume) => {
          mounts.push({
            Type: 'volume',
            Source: volume.name,
            Target: volume.path,
            ReadOnly: volume.readOnly || false,
          });
        });
      }

      // Build networks
      const networks: any[] = [];
      if (config.networks) {
        config.networks.forEach((network) => {
          networks.push({ Target: network });
        });
      }

      // Build health check
      let healthCheck: any = undefined;
      if (config.healthCheck) {
        healthCheck = {
          Test: config.healthCheck.test,
          Interval: config.healthCheck.interval || 30000000000, // 30s in nanoseconds
          Timeout: config.healthCheck.timeout || 10000000000, // 10s in nanoseconds
          Retries: config.healthCheck.retries || 3,
        };
      }

      // Build resource limits
      const resources: any = {};
      if (config.cpuLimit || config.memoryLimit) {
        resources.Limits = {};
        if (config.cpuLimit) {
          resources.Limits.NanoCPUs = Math.floor(config.cpuLimit * 1000000000);
        }
        if (config.memoryLimit) {
          resources.Limits.MemoryBytes = config.memoryLimit;
        }
      }

      const serviceSpec: any = {
        Name: config.name,
        TaskTemplate: {
          ContainerSpec: {
            Image: fullImage,
            Env: env.length > 0 ? env : undefined,
            Mounts: mounts.length > 0 ? mounts : undefined,
            HealthCheck: healthCheck,
            // Security options
            Privileges: {
              CredentialSpec: null,
              SELinuxContext: null,
            },
          },
          Resources: Object.keys(resources).length > 0 ? resources : undefined,
          RestartPolicy: {
            Condition: 'on-failure',
            Delay: 5000000000, // 5s in nanoseconds
            MaxAttempts: 3,
          },
          Placement: {},
          Networks: networks.length > 0 ? networks : undefined,
        },
        Mode: {
          Replicated: {
            Replicas: config.replicas || 1,
          },
        },
        EndpointSpec: {
          Ports: ports.length > 0 ? ports : undefined,
        },
        Labels: {
          'com.deployment-platform.managed': 'true',
          ...config.labels,
        },
      };

      const service = await this.docker.createService(serviceSpec);
      this.logger.log(`Service created: ${config.name} (ID: ${service.id})`);

      return service;
    } catch (error) {
      this.logger.error(`Failed to create service ${config.name}: ${error.message}`);
      throw error;
    }
  }

  async getService(nameOrId: string): Promise<Docker.Service | null> {
    try {
      const service = this.docker.getService(nameOrId);
      await service.inspect();
      return service;
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async getServiceStatus(nameOrId: string): Promise<any> {
    try {
      const service = this.docker.getService(nameOrId);
      const inspection = await service.inspect();

      // Get tasks (containers) for this service
      const tasks = await this.docker.listTasks({
        filters: { service: [nameOrId] },
      });

      return {
        service: inspection,
        tasks: tasks,
      };
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async removeService(nameOrId: string): Promise<void> {
    try {
      this.logger.log(`Removing service: ${nameOrId}`);
      const service = this.docker.getService(nameOrId);
      await service.remove();
      this.logger.log(`Service removed: ${nameOrId}`);
    } catch (error) {
      if (error.statusCode === 404) {
        this.logger.warn(`Service not found: ${nameOrId}`);
        return;
      }
      this.logger.error(`Failed to remove service ${nameOrId}: ${error.message}`);
      throw error;
    }
  }

  async getServiceLogs(
    nameOrId: string,
    tail = 100,
  ): Promise<string> {
    try {
      const service = this.docker.getService(nameOrId);
      const logs = await service.logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: true,
      });

      return logs.toString();
    } catch (error) {
      this.logger.error(`Failed to get logs for service ${nameOrId}: ${error.message}`);
      throw error;
    }
  }

  async listServices(filters?: any): Promise<any[]> {
    try {
      const services = await this.docker.listServices({ filters });

      // Get detailed info for each service
      const serviceDetails = await Promise.all(
        services.map(async (svc) => {
          const service = this.docker.getService(svc.ID);
          return await service.inspect();
        }),
      );

      return serviceDetails;
    } catch (error) {
      this.logger.error(`Failed to list services: ${error.message}`);
      throw error;
    }
  }
}
