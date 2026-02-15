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
import * as crypto from 'crypto';

@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);
  private readonly webhookSecret: string;

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly configService: ConfigService,
  ) {
    // Generate a valid secret token from bot token
    // Telegram secret tokens must only contain A-Z, a-z, 0-9, _, -
    const botToken = this.configService.get<string>('telegram.botToken');
    this.webhookSecret = botToken
      ? crypto.createHash('sha256').update(botToken).digest('hex').substring(0, 32)
      : '';
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
