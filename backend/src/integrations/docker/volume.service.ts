import { Injectable, Logger } from '@nestjs/common';
import { DockerService } from './docker.service';
import Docker from 'dockerode';

@Injectable()
export class VolumeService {
  private readonly logger = new Logger(VolumeService.name);
  private readonly docker: Docker;

  constructor(private readonly dockerService: DockerService) {
    this.docker = this.dockerService.getClient();
  }

  async createVolume(
    name: string,
    labels?: Record<string, string>,
  ): Promise<Docker.VolumeInspectInfo> {
    try {
      this.logger.log(`Creating volume: ${name}`);

      await this.docker.createVolume({
        Name: name,
        Driver: 'local',
        Labels: {
          'com.deployment-platform.managed': 'true',
          ...labels,
        },
      });

      this.logger.log(`Volume created: ${name}`);

      // Inspect the volume to get full details
      const volume = this.docker.getVolume(name);
      return await volume.inspect();
    } catch (error) {
      if (error.statusCode === 409) {
        this.logger.warn(`Volume already exists: ${name}`);
        const volume = this.docker.getVolume(name);
        return await volume.inspect();
      }
      this.logger.error(`Failed to create volume ${name}: ${error.message}`);
      throw error;
    }
  }

  async deleteVolume(nameOrId: string): Promise<void> {
    try {
      this.logger.log(`Deleting volume: ${nameOrId}`);
      const volume = this.docker.getVolume(nameOrId);
      await volume.remove();
      this.logger.log(`Volume deleted: ${nameOrId}`);
    } catch (error) {
      if (error.statusCode === 404) {
        this.logger.warn(`Volume not found: ${nameOrId}`);
        return;
      }
      if (error.statusCode === 409) {
        this.logger.warn(
          `Volume is in use and cannot be deleted: ${nameOrId}`,
        );
        return;
      }
      this.logger.error(`Failed to delete volume ${nameOrId}: ${error.message}`);
      throw error;
    }
  }

  async listVolumes(
    environmentId?: string,
  ): Promise<Docker.VolumeInspectInfo[]> {
    try {
      const filters: any = {
        label: ['com.deployment-platform.managed=true'],
      };

      if (environmentId) {
        filters.label.push(`com.deployment-platform.environment=${environmentId}`);
      }

      const { Volumes } = await this.docker.listVolumes({ filters });

      return Volumes || [];
    } catch (error) {
      this.logger.error(`Failed to list volumes: ${error.message}`);
      throw error;
    }
  }

  async getVolume(nameOrId: string): Promise<Docker.VolumeInspectInfo | null> {
    try {
      const volume = this.docker.getVolume(nameOrId);
      return await volume.inspect();
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }
}
