import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { TelegramUpdate } from './telegram.update';
import { AuthModule } from '../../modules/auth/auth.module';
import { EnvironmentsModule } from '../../modules/environments/environments.module';
import { DeploymentsModule } from '../../modules/deployments/deployments.module';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const botToken = configService.get<string>('telegram.botToken');
        const webhookDomain = configService.get<string>('telegram.webhookDomain');
        const webhookPath = configService.get<string>('telegram.webhookPath');

        if (!botToken) {
          // If no bot token, return minimal config to prevent crashes
          return {
            token: 'disabled',
            options: {
              telegram: {
                webhookReply: false,
              },
            },
          };
        }

        const config: any = {
          token: botToken,
        };

        // Use webhook in production, polling in development
        if (webhookDomain && configService.get('app.isProduction')) {
          config.launchOptions = {
            webhook: {
              domain: webhookDomain,
              hookPath: webhookPath,
            },
          };
        }

        return config;
      },
      inject: [ConfigService],
    }),
    AuthModule,
    EnvironmentsModule,
    DeploymentsModule,
  ],
  providers: [TelegramService, TelegramUpdate],
  exports: [TelegramService],
})
export class TelegramModule {}
