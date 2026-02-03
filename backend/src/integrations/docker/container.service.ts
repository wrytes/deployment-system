import { Injectable, Logger } from '@nestjs/common';
import { DockerService } from './docker.service';
import Docker from 'dockerode';
import * as Tar from 'tar-stream';

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
              this.logger.error(
                `Failed to pull image ${fullImage}: ${err.message}`,
              );
              return reject(err);
            }
            this.logger.log(`Image pulled successfully: ${fullImage}`);
            resolve();
          },
          (event) => {
            if (event.status) {
              this.logger.debug(
                `Pull progress: ${event.status} ${event.id || ''}`,
              );
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
      this.logger.error(
        `Failed to create service ${config.name}: ${error.message}`,
      );
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
      this.logger.error(
        `Failed to remove service ${nameOrId}: ${error.message}`,
      );
      throw error;
    }
  }

  async getServiceLogs(nameOrId: string, tail = 100): Promise<string> {
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
      this.logger.error(
        `Failed to get logs for service ${nameOrId}: ${error.message}`,
      );
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

  async buildImageFromGit(options: {
    gitUrl: string;
    imageName: string;
    tag?: string;
    branch?: string;
    baseImage?: string;
    buildContext?: string;
    dockerfile?: string;
    installCommand?: string;
    buildCommand?: string;
    startCommand?: string;
  }): Promise<string> {
    const {
      gitUrl,
      imageName,
      tag = 'latest',
      branch = 'main',
      baseImage = 'node:22',
      installCommand,
      buildCommand,
      startCommand,
    } = options;

    const fullImageName = `${imageName}:${tag}`;
    this.logger.log(`Building image from Git: ${gitUrl} (branch: ${branch})`);

    try {
      const dockerfileContent = this.generateDockerfile({
        gitUrl,
        branch,
        baseImage,
        installCommand,
        buildCommand,
        startCommand,
      });

      const tarStream = this.createTarStream(dockerfileContent);
      const result = await this.buildImageFromStream(tarStream, fullImageName);
      this.logger.log(`Image built successfully: ${result}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to build image from Git: ${error.message}`);
      throw error;
    }
  }

  private createTarStream(dockerfileContent: string): Tar.Pack {
    const pack = Tar.pack();
    pack.entry({ name: 'Dockerfile' }, dockerfileContent);
    pack.finalize();
    return pack;
  }

  private async buildImageFromStream(
    tarStream: Tar.Pack,
    imageName: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let buildSucceeded = false;
      let imageTagged = false;
      let buildFailed = false;
      let errorMessage = '';

      this.docker.buildImage(
        tarStream,
        {
          t: imageName,
        },
        (err: any, stream: any) => {
          if (err) {
            this.logger.error(`Failed to start build: ${err.message}`);
            return reject(err);
          }

          if (!stream) {
            this.logger.error(`No response stream from Docker`);
            return reject(new Error('No response stream from Docker'));
          }

          // Pipe stream to process stdout for logging
          stream.pipe(process.stdout);

          // Parse stream events to detect success/failure
          stream.on('data', (chunk: Buffer) => {
            try {
              const lines = chunk.toString().split('\n');
              for (const line of lines) {
                if (!line.trim()) continue;

                try {
                  const event = JSON.parse(line);

                  if (event.stream) {
                    const streamText = event.stream;

                    if (streamText.includes('Successfully built')) {
                      buildSucceeded = true;
                    }

                    if (streamText.includes('Successfully tagged')) {
                      imageTagged = true;
                    }
                  }

                  if (event.error || event.errorDetail) {
                    buildFailed = true;
                    errorMessage =
                      event.error ||
                      event.errorDetail.message ||
                      'Build failed';
                    this.logger.error(`Build error: ${errorMessage}`);
                  }
                } catch (parseError) {
                  // Not JSON, skip
                }
              }
            } catch (error) {
              // Ignore parsing errors
            }
          });

          stream.on('end', () => {
            if (buildFailed) {
              return reject(new Error(`Build failed: ${errorMessage}`));
            }

            if (!buildSucceeded) {
              return reject(
                new Error(
                  'Build did not complete - no "Successfully built" message',
                ),
              );
            }

            if (!imageTagged) {
              this.logger.warn(
                `Image built but not tagged - this should not happen with t parameter`,
              );
            }

            this.logger.log(`Image built and tagged: ${imageName}`);
            resolve(imageName);
          });

          stream.on('error', (buildError: any) => {
            this.logger.error(`Build stream error: ${buildError.message}`);
            reject(buildError);
          });
        },
      );
    });
  }

  private generateDockerfile(options: {
    gitUrl: string;
    branch: string;
    baseImage: string;
    installCommand?: string;
    buildCommand?: string;
    startCommand?: string;
  }): string {
    const {
      gitUrl,
      branch,
      baseImage,
      installCommand,
      buildCommand,
      startCommand,
    } = options;

    const workdir = '/app';

    // Detect if base image is Alpine-based
    const isAlpine = baseImage.includes('alpine');

    let dockerfile = `FROM ${baseImage}\n\n`;

    // Clone the repository inside Docker
    dockerfile += `# Clone repository\n`;
    if (isAlpine) {
      dockerfile += `RUN apk add --no-cache git && \\\n`;
    } else {
      dockerfile += `RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/* && \\\n`;
    }
    dockerfile += `    git clone -b ${branch} ${gitUrl} ${workdir}\n\n`;

    dockerfile += `WORKDIR ${workdir}\n\n`;

    // Add non-root user for security
    dockerfile += `# Add non-root user\n`;
    if (isAlpine) {
      dockerfile += `RUN addgroup -S appuser && adduser -S appuser -G appuser && \\\n`;
    } else {
      dockerfile += `RUN groupadd -r appuser && useradd -r -g appuser appuser && \\\n`;
    }
    dockerfile += `    chown -R appuser:appuser ${workdir}\n\n`;

    dockerfile += `USER appuser\n\n`;

    // Install and build
    const buildCmd =
      installCommand && buildCommand
        ? `${installCommand} && ${buildCommand}`
        : buildCommand
          ? buildCommand
          : installCommand
            ? installCommand
            : 'yarn install && yarn run build';

    dockerfile += `# Install dependencies and build\n`;
    dockerfile += `RUN ${buildCmd}\n\n`;

    // Expose port
    dockerfile += `EXPOSE 3000\n\n`;

    // Start command
    const cmdArray = startCommand
      ? startCommand
          .split(' ')
          .map((s) => `"${s}"`)
          .join(', ')
      : '"yarn", "start"';

    dockerfile += `# Start application\n`;
    dockerfile += `CMD [${cmdArray}]\n`;

    return dockerfile;
  }
}
