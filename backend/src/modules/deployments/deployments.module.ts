import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DeploymentsService } from './deployments.service';
import { DeploymentsController } from './deployments.controller';
import { DockerModule } from '../../integrations/docker/docker.module';

@Module({
  imports: [DockerModule, EventEmitterModule],
  providers: [DeploymentsService],
  controllers: [DeploymentsController],
  exports: [DeploymentsService],
})
export class DeploymentsModule {}
