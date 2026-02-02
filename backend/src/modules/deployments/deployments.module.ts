import { Module } from '@nestjs/common';
import { DeploymentsService } from './deployments.service';
import { DeploymentsController } from './deployments.controller';
import { DockerModule } from '../../integrations/docker/docker.module';

@Module({
  imports: [DockerModule],
  providers: [DeploymentsService],
  controllers: [DeploymentsController],
  exports: [DeploymentsService],
})
export class DeploymentsModule {}
