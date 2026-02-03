import { Update, Start, Command, Ctx, InjectBot } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';
import { Logger, OnModuleInit } from '@nestjs/common';
import { AuthService } from '../../modules/auth/auth.service';
import { EnvironmentsService } from '../../modules/environments/environments.service';
import { DeploymentsService } from '../../modules/deployments/deployments.service';
import { TelegramService } from './telegram.service';
import { ConfigService } from '@nestjs/config';
import { ApiKeyScope } from '@prisma/client';

@Update()
export class TelegramUpdate implements OnModuleInit {
  private readonly logger = new Logger(TelegramUpdate.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly authService: AuthService,
    private readonly environmentsService: EnvironmentsService,
    private readonly deploymentsService: DeploymentsService,
    private readonly telegramService: TelegramService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Set bot commands menu
    try {
      await this.bot.telegram.setMyCommands([
        { command: 'start', description: 'Initialize your account' },
        { command: 'api_create', description: 'Generate a new API key' },
        { command: 'api_list', description: 'List your active API keys' },
        { command: 'api_revoke', description: 'Revoke an API key' },
        { command: 'help', description: 'Show help message' },
      ]);
      this.logger.log('Bot commands menu configured');
    } catch (error) {
      this.logger.error(`Failed to set bot commands: ${error.message}`);
    }
  }

  @Start()
  async onStart(@Ctx() ctx: Context) {
    try {
      if (!ctx.from) {
        await ctx.reply('Unable to identify user.');
        return;
      }

      const telegramId = BigInt(ctx.from.id);
      const telegramHandle = ctx.from.username;

      // Get or create user
      const { isNew } = await this.authService.getOrCreateUser(
        telegramId,
        telegramHandle,
      );

      if (isNew) {
        await ctx.reply(
          `👋 Welcome to the Docker Swarm Deployment Platform!\n\n` +
            `Your account has been created.\n\n` +
            `Use /api_create to generate an API key to get started.`,
        );
      } else {
        await ctx.reply(
          `👋 Welcome back!\n\n` +
            `Available commands:\n` +
            `/api_create - Generate a new API key\n` +
            `/api_list - List your API keys\n` +
            `/api_revoke - Revoke an API key\n` +
            `/help - Show this help message`,
        );
      }
    } catch (error) {
      this.logger.error(`Error in /start command: ${error.message}`);
      await ctx.reply('An error occurred. Please try again later.');
    }
  }

  @Command('api_create')
  async onApiCreate(@Ctx() ctx: Context) {
    try {
      if (!ctx.from) {
        await ctx.reply('Unable to identify user.');
        return;
      }

      const telegramId = BigInt(ctx.from.id);
      const telegramHandle = ctx.from.username;

      // Get or create user
      const { id: userId } = await this.authService.getOrCreateUser(
        telegramId,
        telegramHandle,
      );

      // Create magic link with write permissions
      const { token, expiresAt } = await this.authService.createMagicLink(
        userId,
        [
          ApiKeyScope.ENVIRONMENTS_READ,
          ApiKeyScope.ENVIRONMENTS_WRITE,
          ApiKeyScope.DEPLOYMENTS_READ,
          ApiKeyScope.DEPLOYMENTS_WRITE,
          ApiKeyScope.LOGS_READ,
        ],
      );

      // Get base URL from config
      const port = this.configService.get<number>('app.port', 3000);
      const magicLink = `http://localhost:${port}/auth/verify?token=${token}`;

      await ctx.reply(
        `🔑 *API Key Magic Link*\n\n` +
          `Click the link below to get your API key:\n` +
          `${magicLink}\n\n` +
          `⏰ This link expires at: ${expiresAt.toLocaleString()}\n\n` +
          `⚠️ Keep your API key secret!`,
        { parse_mode: 'Markdown' },
      );

      this.logger.log(`Magic link created for user ${userId}`);
    } catch (error) {
      this.logger.error(`Error in /api_create command: ${error.message}`);
      await ctx.reply('Failed to create magic link. Please try again.');
    }
  }

  @Command('api_list')
  async onApiList(@Ctx() ctx: Context) {
    try {
      if (!ctx.from) {
        await ctx.reply('Unable to identify user.');
        return;
      }

      const telegramId = BigInt(ctx.from.id);

      // Get user
      const { id: userId } = await this.authService.getOrCreateUser(telegramId);

      // List API keys
      const keys = await this.authService.listApiKeys(userId);

      if (keys.length === 0) {
        await ctx.reply(
          'You have no active API keys.\n\nUse /api_create to generate one.',
        );
        return;
      }

      let message = '🔑 Your API Keys\n\n';

      for (const key of keys) {
        const expiry = key.expiresAt
          ? `Expires: ${key.expiresAt.toLocaleString()}`
          : 'Never expires';
        const lastUsed = key.lastUsedAt
          ? `Last used: ${key.lastUsedAt.toLocaleString()}`
          : 'Never used';

        // Escape underscores in scopes for display
        const scopesText = key.scopes.join(', ').replace(/_/g, ' ');

        message +=
          `Key ID: ${key.keyId}\n` +
          `Scopes: ${scopesText}\n` +
          `${expiry}\n` +
          `${lastUsed}\n` +
          `Created: ${key.createdAt.toLocaleString()}\n\n`;
      }

      message += `Use /api_revoke <key_id> to revoke a key.`;

      await ctx.reply(message);
    } catch (error) {
      this.logger.error(`Error in /api_list command: ${error.message}`);
      await ctx.reply('Failed to list API keys. Please try again.');
    }
  }

  @Command('api_revoke')
  async onApiRevoke(@Ctx() ctx: Context) {
    try {
      if (!ctx.from) {
        await ctx.reply('Unable to identify user.');
        return;
      }

      const telegramId = BigInt(ctx.from.id);
      const message = (ctx.message as any).text;
      const parts = message.split(' ');

      if (parts.length < 2) {
        await ctx.reply(
          'Usage: /api_revoke <key_id>\n\n' +
            'Use /api_list to see your API key IDs.',
        );
        return;
      }

      const keyId = parts[1];

      // Get user
      const { id: userId } = await this.authService.getOrCreateUser(telegramId);

      // Revoke key
      await this.authService.revokeApiKey(userId, keyId);

      await ctx.reply(`✅ API key \`${keyId}\` has been revoked.`, {
        parse_mode: 'Markdown',
      });

      this.logger.log(`API key ${keyId} revoked for user ${userId}`);
    } catch (error) {
      this.logger.error(`Error in /api_revoke command: ${error.message}`);

      if (error.message.includes('not found')) {
        await ctx.reply('API key not found.');
      } else {
        await ctx.reply('Failed to revoke API key. Please try again.');
      }
    }
  }

  @Command('help')
  async onHelp(@Ctx() ctx: Context) {
    const helpText =
      `🚀 Docker Swarm Deployment Platform\n\n` +
      `Available Commands:\n\n` +
      `/start - Initialize your account\n` +
      `/api_create - Generate a new API key\n` +
      `/api_list - List your active API keys\n` +
      `/api_revoke <key_id> - Revoke an API key\n` +
      `/help - Show this help message\n\n` +
      `Getting Started:\n` +
      `1. Use /api_create to get an API key\n` +
      `2. Click the magic link to retrieve your key\n` +
      `3. Use the API key with the REST API\n\n` +
      `📚 API Documentation:\n` +
      `Full documentation available at:\n` +
      `http://localhost:3000/api/docs\n\n` +
      `API Base URL: http://localhost:3000\n` +
      `Authentication: Include X-API-Key header in all requests`;

    await ctx.reply(helpText);
  }
}
