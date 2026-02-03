import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@Controller()
@ApiTags('Root')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({
    summary: 'API information',
    description:
      'Returns API information, version, documentation links, and getting started guide',
  })
  @ApiResponse({
    status: 200,
    description: 'API information and helpful links',
    schema: {
      example: {
        message: '🚀 Docker Swarm Deployment Platform',
        version: '1.0.0',
        description:
          'REST API for managing isolated Docker Swarm deployments with automatic SSL',
        documentation: 'https://your-domain.com:3030/api/docs',
        endpoints: {
          health: 'https://your-domain.com:3030/health',
          docs: 'https://your-domain.com:3030/api/docs',
        },
        resources: {
          github: 'https://github.com/wrytes/deployment-system',
          telegram: 'Contact @your_bot for API keys',
        },
        gettingStarted: [
          '1. Get API key via Telegram bot',
          '2. Visit the magic link to retrieve your key',
          '3. Use X-API-Key header in all authenticated requests',
          '4. Check /api/docs for full API documentation',
        ],
      },
    },
  })
  getHello() {
    return this.appService.getHello();
  }
}
