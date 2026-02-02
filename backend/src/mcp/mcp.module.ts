import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { EnvironmentsModule } from '../modules/environments/environments.module';
import { DeploymentsModule } from '../modules/deployments/deployments.module';

@Module({
  imports: [EnvironmentsModule, DeploymentsModule],
  controllers: [McpController],
})
export class McpModule {}
