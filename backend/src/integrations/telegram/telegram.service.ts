import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Set webhook in production
    const webhookDomain = this.configService.get<string>(
      'telegram.webhookDomain',
    );
    const webhookPath = this.configService.get<string>('telegram.webhookPath');
    const isProduction = this.configService.get<boolean>('app.isProduction');

    if (webhookDomain && isProduction) {
      try {
        const webhookUrl = `https://${webhookDomain}${webhookPath}`;
        await this.bot.telegram.setWebhook(webhookUrl);
        this.logger.log(`Webhook set to: ${webhookUrl}`);

        // Verify webhook was set
        const webhookInfo = await this.bot.telegram.getWebhookInfo();
        this.logger.log(
          `Webhook verified: ${webhookInfo.url} (pending: ${webhookInfo.pending_update_count})`,
        );
      } catch (error) {
        this.logger.error(`Failed to set webhook: ${error.message}`);
      }
    }
  }

  async sendMessage(chatId: number, message: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(chatId, message);
    } catch (error) {
      this.logger.error(
        `Failed to send message to ${chatId}: ${error.message}`,
      );
      throw error;
    }
  }

  async sendMarkdownMessage(chatId: number, message: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      this.logger.error(
        `Failed to send markdown message to ${chatId}: ${error.message}`,
      );
      throw error;
    }
  }

  async sendErrorAlert(chatId: number, error: string): Promise<void> {
    const message = `⚠️ *Error*\n\n\`\`\`\n${error}\n\`\`\``;
    await this.sendMarkdownMessage(chatId, message);
  }

  async sendDeploymentNotification(
    chatId: number,
    environmentName: string,
    status: string,
  ): Promise<void> {
    const emoji =
      status === 'RUNNING' ? '✅' : status === 'FAILED' ? '❌' : '⏳';
    const message = `${emoji} *Deployment Update*\n\nEnvironment: \`${environmentName}\`\nStatus: *${status}*`;
    await this.sendMarkdownMessage(chatId, message);
  }
}
