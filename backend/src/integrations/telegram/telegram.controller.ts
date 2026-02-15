import { Controller, Post, Body, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(@InjectBot() private readonly bot: Telegraf) {}

  @Post('webhook')
  async handleWebhook(@Body() update: any) {
    try {
      this.logger.debug('Received webhook update');
      await this.bot.handleUpdate(update);
      return { ok: true };
    } catch (error) {
      this.logger.error(`Webhook error: ${error.message}`, error.stack);
      return { ok: false, error: error.message };
    }
  }
}
