import {
  Controller,
  Post,
  Body,
  Logger,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);
  private readonly webhookSecret: string;

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly configService: ConfigService,
  ) {
    // Generate a consistent secret from bot token (or use a dedicated env var)
    const botToken = this.configService.get<string>('telegram.botToken');
    // Use first 32 chars of bot token hash as secret
    this.webhookSecret = botToken ? botToken.substring(0, 32) : '';
  }

  @Post('webhook')
  async handleWebhook(
    @Body() update: any,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string,
  ) {
    // Validate secret token to prevent unauthorized requests
    if (!secretToken || secretToken !== this.webhookSecret) {
      this.logger.warn(
        `Rejected webhook request with invalid secret token from ${update?.message?.from?.id || 'unknown'}`,
      );
      throw new UnauthorizedException('Invalid secret token');
    }

    try {
      this.logger.debug('Received authenticated webhook update');
      await this.bot.handleUpdate(update);
      return { ok: true };
    } catch (error) {
      this.logger.error(`Webhook error: ${error.message}`, error.stack);
      return { ok: false, error: error.message };
    }
  }
}
