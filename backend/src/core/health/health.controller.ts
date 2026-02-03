import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';

@Controller('health')
@ApiTags('Health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaHealth: PrismaHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    private prismaService: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'System health check',
    description:
      'Checks database connectivity, memory usage (heap and RSS), and disk space. ' +
      'Returns detailed status for each health indicator.',
  })
  @ApiResponse({
    status: 200,
    description: 'All health checks passed',
    schema: {
      example: {
        status: 'ok',
        info: {
          database: { status: 'up' },
          memory_heap: { status: 'up' },
          memory_rss: { status: 'up' },
          storage: { status: 'up' },
        },
        error: {},
        details: {
          database: { status: 'up' },
          memory_heap: { status: 'up' },
          memory_rss: { status: 'up' },
          storage: { status: 'up' },
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Service unhealthy - one or more health checks failed',
  })
  check() {
    return this.health.check([
      // Database health check
      () => this.prismaHealth.pingCheck('database', this.prismaService),

      // Memory heap check (should not exceed 300MB)
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),

      // Memory RSS check (should not exceed 300MB)
      () => this.memory.checkRSS('memory_rss', 300 * 1024 * 1024),

      // Disk storage check (should have at least 50% free)
      () =>
        this.disk.checkStorage('storage', {
          path: '/',
          thresholdPercent: 0.5,
        }),
    ]);
  }
}
