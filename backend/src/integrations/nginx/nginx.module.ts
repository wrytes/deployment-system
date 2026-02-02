import { Module } from '@nestjs/common';
import { NginxService } from './nginx.service';
import { DockerModule } from '../docker/docker.module';

@Module({
  imports: [DockerModule],
  providers: [NginxService],
  exports: [NginxService],
})
export class NginxModule {}
