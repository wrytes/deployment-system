import { Module } from '@nestjs/common';
import { EnvironmentsService } from './environments.service';
import { EnvironmentsController } from './environments.controller';
import { DockerModule } from '../../integrations/docker/docker.module';

@Module({
  imports: [DockerModule],
  providers: [EnvironmentsService],
  controllers: [EnvironmentsController],
  exports: [EnvironmentsService],
})
export class EnvironmentsModule {}
