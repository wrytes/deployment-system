import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaService } from './core/database/prisma.service';

async function bootstrap() {
  // Create app with buffer logs
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Get config service
  const configService = app.get(ConfigService);

  // Use Pino logger
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Enable CORS
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Enable shutdown hooks for Prisma
  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  // Configure Swagger/OpenAPI documentation
  const config = new DocumentBuilder()
    .setTitle('Docker Swarm Deployment Platform API')
    .setDescription(
      'REST API for managing isolated Docker Swarm deployments with automatic SSL.\n\n' +
        '## Authentication\n' +
        'All endpoints (except /auth/verify) require API key authentication.\n' +
        'Include the `X-API-Key` header with format: `rw_prod_{keyId}.{secret}`\n\n' +
        '## Getting Started\n' +
        '1. Use Telegram bot `/api_create` to generate magic link\n' +
        '2. Visit magic link to retrieve API key\n' +
        '3. Use API key in `X-API-Key` header for all requests\n\n' +
        '## Architecture\n' +
        '- **Environments**: Isolated overlay networks for container groups\n' +
        '- **Deployments**: Container deployments within environments\n' +
        "- **Public Access**: Automatic SSL via Let's Encrypt + Nginx",
    )
    .setVersion('1.0.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-API-Key',
        in: 'header',
        description: 'API key in format: rw_prod_{keyId}.{secret}',
      },
      'api-key',
    )
    .addTag('Authentication', 'API key management and verification')
    .addTag(
      'Environments',
      'Isolated deployment environments with overlay networks',
    )
    .addTag('Deployments', 'Container deployments and status tracking')
    .addTag('Health', 'System health monitoring')
    .addTag('Root', 'Base API endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Docker Swarm Platform - API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
    },
  });

  // Get port and base URL from config
  const port = configService.get<number>('app.port', 3000);
  const baseUrl = configService.get<string>('app.baseUrl');

  // Start server
  await app.listen(port);

  logger.log(`🚀 Application is running on: ${baseUrl}`);
  logger.log(`📚 API Documentation: ${baseUrl}/api/docs`);
  logger.log(`📊 Health check: ${baseUrl}/health`);
  logger.log(`🔧 Environment: ${configService.get('app.nodeEnv')}`);
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
