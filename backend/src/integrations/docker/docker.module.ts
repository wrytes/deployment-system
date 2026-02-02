import { Module } from '@nestjs/common';
import { DockerService } from './docker.service';
import { NetworkService } from './network.service';
import { ContainerService } from './container.service';
import { VolumeService } from './volume.service';

@Module({
  providers: [DockerService, NetworkService, ContainerService, VolumeService],
  exports: [DockerService, NetworkService, ContainerService, VolumeService],
})
export class DockerModule {}
