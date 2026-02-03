import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

// Config
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import dockerConfig from './config/docker.config';
import redisConfig from './config/redis.config';
import telegramConfig from './config/telegram.config';
import sslConfig from './config/ssl.config';
import { validationSchema } from './config/validation.schema';

// Core modules
import { DatabaseModule } from './core/database/database.module';
import { HealthModule } from './core/health/health.module';

// Integration modules
import { DockerModule } from './integrations/docker/docker.module';
import { TelegramModule } from './integrations/telegram/telegram.module';

// Feature modules
import { AuthModule } from './modules/auth/auth.module';
import { EnvironmentsModule } from './modules/environments/environments.module';
import { DeploymentsModule } from './modules/deployments/deployments.module';
import { LogsModule } from './modules/logs/logs.module';

// App controller and service
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        databaseConfig,
        dockerConfig,
        redisConfig,
        telegramConfig,
        sslConfig,
      ],
      validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),

    // Logging
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV === 'development'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  translateTime: 'SYS:standard',
                  ignore: 'pid,hostname',
                },
              }
            : undefined,
        level: process.env.LOG_LEVEL || 'info',
      },
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL || '60', 10) * 1000,
        limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
      },
    ]),

    // Core modules
    DatabaseModule,
    HealthModule,

    // Integration modules
    DockerModule,
    TelegramModule,

    // Feature modules
    AuthModule,
    EnvironmentsModule,
    DeploymentsModule,
    LogsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
