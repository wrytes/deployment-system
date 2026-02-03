import { Injectable, Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(@InjectBot() private readonly bot: Telegraf) {}

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
