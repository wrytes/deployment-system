import { Injectable, Logger } from '@nestjs/common';
import { DockerService } from './docker.service';
import Docker from 'dockerode';

@Injectable()
export class NetworkService {
  private readonly logger = new Logger(NetworkService.name);
  private readonly docker: Docker;

  constructor(private readonly dockerService: DockerService) {
    this.docker = this.dockerService.getClient();
  }

  async createOverlayNetwork(
    name: string,
    labels?: Record<string, string>,
  ): Promise<{ id: string; name: string }> {
    try {
      this.logger.log(`Creating overlay network: ${name}`);

      const network = await this.docker.createNetwork({
        Name: name,
        Driver: 'overlay',
        Attachable: true,
        Labels: {
          'com.deployment-platform.managed': 'true',
          ...labels,
        },
      });

      const info = await network.inspect();
      this.logger.log(`Overlay network created: ${name} (ID: ${info.Id})`);

      return {
        id: info.Id,
        name: info.Name,
      };
    } catch (error) {
      this.logger.error(`Failed to create network ${name}: ${error.message}`);
      throw error;
    }
  }

  async deleteNetwork(nameOrId: string): Promise<void> {
    try {
      this.logger.log(`Deleting network: ${nameOrId}`);
      const network = this.docker.getNetwork(nameOrId);
      await network.remove();
      this.logger.log(`Network deleted: ${nameOrId}`);
    } catch (error) {
      if (error.statusCode === 404) {
        this.logger.warn(`Network not found: ${nameOrId}`);
        return;
      }
      this.logger.error(
        `Failed to delete network ${nameOrId}: ${error.message}`,
      );
      throw error;
    }
  }

  async attachContainerToNetwork(
    containerNameOrId: string,
    networkNameOrId: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Attaching container ${containerNameOrId} to network ${networkNameOrId}`,
      );

      const network = this.docker.getNetwork(networkNameOrId);
      await network.connect({
        Container: containerNameOrId,
      });

      this.logger.log(
        `Container ${containerNameOrId} attached to network ${networkNameOrId}`,
      );
    } catch (error) {
      if (error.message.includes('already exists')) {
        this.logger.warn(
          `Container ${containerNameOrId} already attached to network ${networkNameOrId}`,
        );
        return;
      }
      this.logger.error(
        `Failed to attach container to network: ${error.message}`,
      );
      throw error;
    }
  }

  async detachContainerFromNetwork(
    containerNameOrId: string,
    networkNameOrId: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Detaching container ${containerNameOrId} from network ${networkNameOrId}`,
      );

      const network = this.docker.getNetwork(networkNameOrId);
      await network.disconnect({
        Container: containerNameOrId,
        Force: true,
      });

      this.logger.log(
        `Container ${containerNameOrId} detached from network ${networkNameOrId}`,
      );
    } catch (error) {
      if (error.statusCode === 404) {
        this.logger.warn(
          `Container or network not found: ${containerNameOrId} / ${networkNameOrId}`,
        );
        return;
      }
      this.logger.error(
        `Failed to detach container from network: ${error.message}`,
      );
      throw error;
    }
  }

  async listNetworks(managed = true): Promise<Docker.NetworkInspectInfo[]> {
    try {
      const filters: any = {};

      if (managed) {
        filters.label = ['com.deployment-platform.managed=true'];
      }

      const networks = await this.docker.listNetworks({ filters });

      // Get detailed info for each network
      const networkDetails = await Promise.all(
        networks.map(async (net) => {
          const network = this.docker.getNetwork(net.Id);
          return await network.inspect();
        }),
      );

      return networkDetails;
    } catch (error) {
      this.logger.error(`Failed to list networks: ${error.message}`);
      throw error;
    }
  }

  async getNetwork(
    nameOrId: string,
  ): Promise<Docker.NetworkInspectInfo | null> {
    try {
      const network = this.docker.getNetwork(nameOrId);
      return await network.inspect();
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async networkExists(nameOrId: string): Promise<boolean> {
    try {
      const network = this.docker.getNetwork(nameOrId);
      await network.inspect();
      return true;
    } catch (error) {
      if (error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }
}
