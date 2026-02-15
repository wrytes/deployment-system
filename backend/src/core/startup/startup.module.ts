import { Module } from '@nestjs/common';
import { StartupService } from './startup.service';
import { DatabaseModule } from '../database/database.module';
import { DockerModule } from '../../integrations/docker/docker.module';

@Module({
  imports: [DatabaseModule, DockerModule],
  providers: [StartupService],
  exports: [StartupService],
})
export class StartupModule {}
