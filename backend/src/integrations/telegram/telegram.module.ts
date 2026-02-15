import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { TelegramUpdate } from './telegram.update';
import { TelegramController } from './telegram.controller';
import { AuthModule } from '../../modules/auth/auth.module';
import { EnvironmentsModule } from '../../modules/environments/environments.module';
import { DeploymentsModule } from '../../modules/deployments/deployments.module';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const botToken = configService.get<string>('telegram.botToken');
        const webhookDomain = configService.get<string>(
          'telegram.webhookDomain',
        );
        const webhookPath = configService.get<string>('telegram.webhookPath');

        if (!botToken) {
          // If no bot token, return minimal config with no launch
          return {
            token: 'disabled',
            launchOptions: false, // Prevent Telegraf from launching
          };
        }

        const config: any = {
          token: botToken,
        };

        // Use webhook in production (handled by TelegramController), polling in development
        if (webhookDomain && configService.get('app.isProduction')) {
          // Disable auto-launch - we handle webhooks manually via TelegramController
          config.launchOptions = false;
        } else {
          // Enable polling for development
          config.launchOptions = {
            dropPendingUpdates: true,
          };
        }

        console.log(
          'Telegram bot configured with token:',
          botToken.substring(0, 10) + '...',
        );

        return config;
      },
      inject: [ConfigService],
    }),
    AuthModule,
    EnvironmentsModule,
    DeploymentsModule,
  ],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramUpdate],
  exports: [TelegramService],
})
export class TelegramModule {}
