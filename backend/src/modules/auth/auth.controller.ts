import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBody,
  ApiSecurity,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@Controller('auth')
@ApiTags('Authentication')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify magic link and receive API key',
    description:
      'Exchange a magic link token for an API key. ' +
      'Magic links are generated via Telegram bot `/api_create` command and expire in 15 minutes.',
  })
  @ApiQuery({
    name: 'token',
    required: true,
    description: '32-character magic link token from Telegram bot',
    example: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
  })
  @ApiResponse({
    status: 200,
    description: 'API key created successfully',
    schema: {
      example: {
        apiKey: 'rw_prod_abcd1234efgh5678.xyz9876abc1234def',
        expiresAt: null,
        message: 'API key created successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired magic link token',
  })
  async verifyMagicLink(@Query('token') token: string) {
    const result = await this.authService.verifyMagicLink(token);
    return {
      apiKey: result.apiKey,
      expiresAt: result.expiresAt,
      message: 'API key created successfully',
    };
  }

  @Get('keys')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'List API keys',
    description:
      'List all active API keys for the authenticated user. ' +
      'Shows key ID, scopes, expiry, and last used timestamp.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of API keys',
    schema: {
      example: {
        keys: [
          {
            keyId: 'abcd1234efgh5678',
            scopes: [
              'ENVIRONMENTS_READ',
              'ENVIRONMENTS_WRITE',
              'DEPLOYMENTS_READ',
            ],
            expiresAt: null,
            lastUsedAt: '2026-02-03T10:30:00.000Z',
            createdAt: '2026-02-01T08:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing API key',
  })
  async listApiKeys(@CurrentUser() user: User) {
    const keys = await this.authService.listApiKeys(user.id);
    return { keys };
  }

  @Post('revoke')
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Revoke API key',
    description:
      'Permanently revoke an API key. The key will no longer work for authentication.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['keyId'],
      properties: {
        keyId: {
          type: 'string',
          description: '16-character key ID to revoke',
          example: 'abcd1234efgh5678',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'API key revoked successfully',
    schema: {
      example: {
        message: 'API key revoked successfully',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'API key not found',
  })
  async revokeApiKey(@CurrentUser() user: User, @Body('keyId') keyId: string) {
    await this.authService.revokeApiKey(user.id, keyId);
    return { message: 'API key revoked successfully' };
  }
}
