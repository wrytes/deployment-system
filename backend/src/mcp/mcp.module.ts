import { Module } from '@nestjs/common';
import { McpModule as ReKogMcpModule, McpTransportType } from '@rekog/mcp-nest';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { ScopesGuard } from '../common/guards/scopes.guard';
import { EnvironmentsModule } from '../modules/environments/environments.module';
import { DeploymentsModule } from '../modules/deployments/deployments.module';
import { EnvironmentTools } from './tools/environment.tools';
import { DeploymentTools } from './tools/deployment.tools';

@Module({
  imports: [
    EnvironmentsModule,
    DeploymentsModule,

    // Initialize MCP server with multiple transports
    ReKogMcpModule.forRoot({
      name: 'docker-swarm-deployment',
      version: '1.0.0',
      transport: [
        McpTransportType.SSE,              // For Claude Code web
        McpTransportType.STREAMABLE_HTTP,  // For stateless deployments
        McpTransportType.STDIO,            // For local development
      ],
      guards: [ApiKeyGuard, ScopesGuard],  // Reuse existing auth
      allowUnauthenticatedAccess: false,
      sse: {
        pingEnabled: true,
        pingIntervalMs: 30000,
      },
      streamableHttp: {
        enableJsonResponse: true,
        statelessMode: true,
      },
    }),

    // Register tool providers
    ReKogMcpModule.forFeature([EnvironmentTools, DeploymentTools], 'docker-swarm-deployment'),
  ],
  providers: [EnvironmentTools, DeploymentTools],
  exports: [EnvironmentTools, DeploymentTools],
})
export class McpModule {}
