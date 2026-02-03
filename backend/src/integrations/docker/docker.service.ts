import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Docker from 'dockerode';

@Injectable()
export class DockerService implements OnModuleInit {
  private readonly logger = new Logger(DockerService.name);
  private docker: Docker;

  constructor(private readonly configService: ConfigService) {
    const socketPath = this.configService.get<string>('docker.socketPath');
    this.docker = new Docker({ socketPath });
  }

  async onModuleInit() {
    try {
      // Check Docker connection
      await this.docker.ping();
      this.logger.log('Docker connection established');

      // Check Swarm status
      const info = await this.docker.info();
      if (!info.Swarm || info.Swarm.LocalNodeState !== 'active') {
        this.logger.warn(
          'Docker Swarm is not initialized. Call initializeSwarm() to set up.',
        );
      } else {
        this.logger.log(`Docker Swarm active - Node ID: ${info.Swarm.NodeID}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to connect to Docker: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async initializeSwarm(advertiseAddr?: string): Promise<void> {
    try {
      await this.docker.swarmInit({
        AdvertiseAddr:
          advertiseAddr ||
          this.configService.get<string>('docker.swarmAdvertiseAddr'),
        ListenAddr: '0.0.0.0:2377',
      });
      this.logger.log('Docker Swarm initialized successfully');
    } catch (error) {
      if (error.message.includes('already part of a swarm')) {
        this.logger.log('Docker Swarm already initialized');
      } else {
        throw error;
      }
    }
  }

  getClient(): Docker {
    return this.docker;
  }
}
