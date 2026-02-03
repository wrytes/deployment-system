import { Module } from '@nestjs/common';
import { ClaudeSessionsService } from './claude-sessions.service';
import { ClaudeSessionsController } from './claude-sessions.controller';
import { ClaudeMcpProxyService } from './claude-mcp-proxy.service';
import { DockerModule } from '../../integrations/docker/docker.module';

@Module({
  imports: [DockerModule],
  controllers: [ClaudeSessionsController],
  providers: [ClaudeSessionsService, ClaudeMcpProxyService],
  exports: [ClaudeSessionsService, ClaudeMcpProxyService],
})
export class ClaudeSessionsModule {}
