import { Injectable, Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private activeClaudeSessions: Map<string, string> = new Map(); // telegramId -> sessionId

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
    const emoji = status === 'RUNNING' ? '✅' : status === 'FAILED' ? '❌' : '⏳';
    const message = `${emoji} *Deployment Update*\n\nEnvironment: \`${environmentName}\`\nStatus: *${status}*`;
    await this.sendMarkdownMessage(chatId, message);
  }

  // Claude session management
  async setActiveClaudeSession(
    telegramId: bigint,
    sessionId: string,
  ): Promise<void> {
    const key = telegramId.toString();
    this.activeClaudeSessions.set(key, sessionId);
    this.logger.log(
      `Telegram user ${telegramId} is now talking to Claude session ${sessionId}`,
    );
  }

  async getActiveClaudeSession(telegramId: bigint): Promise<string | null> {
    const key = telegramId.toString();
    return this.activeClaudeSessions.get(key) || null;
  }

  async clearActiveClaudeSession(telegramId: bigint): Promise<void> {
    const key = telegramId.toString();
    this.activeClaudeSessions.delete(key);
    this.logger.log(
      `Cleared active Claude session for Telegram user ${telegramId}`,
    );
  }
}
