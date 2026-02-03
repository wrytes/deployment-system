import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@Controller()
@ApiTags('Root')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({
    summary: 'Welcome message',
    description: 'Returns a welcome message for the API',
  })
  @ApiResponse({
    status: 200,
    description: 'Welcome message',
    schema: {
      type: 'string',
      example: 'Docker Swarm Deployment Platform API',
    },
  })
  getHello(): string {
    return this.appService.getHello();
  }
}
