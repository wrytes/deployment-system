#!/usr/bin/env node
/**
 * Standalone MCP Server for STDIO transport
 * This script runs the MCP server in STDIO mode for Claude Code CLI integration
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('MCPStdio');

  try {
    // Create the NestJS application context (no HTTP server)
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'], // Minimize logging to avoid polluting stdio
    });

    logger.log('MCP STDIO server started successfully');
    logger.log('Listening on stdin/stdout for MCP protocol messages');

    // Keep the process alive
    process.on('SIGINT', async () => {
      logger.log('Received SIGINT, shutting down gracefully');
      await app.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.log('Received SIGTERM, shutting down gracefully');
      await app.close();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start MCP STDIO server', error);
    process.exit(1);
  }
}

bootstrap();
