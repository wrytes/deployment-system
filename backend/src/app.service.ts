import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  getHello() {
    const port = this.configService.get<number>('app.port', 3000);
    const baseUrl = `http://localhost:${port}`;

    return {
      message: '🚀 Docker Swarm Deployment Platform',
      version: '1.0.0',
      description:
        'REST API for managing isolated Docker Swarm deployments with automatic SSL',
      documentation: `${baseUrl}/api/docs`,
      endpoints: {
        health: `${baseUrl}/health`,
        docs: `${baseUrl}/api/docs`,
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
    };
  }
}
