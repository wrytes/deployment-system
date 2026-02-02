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
import { AuthService } from './auth.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('verify')
  @HttpCode(HttpStatus.OK)
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
  async listApiKeys(@CurrentUser() user: User) {
    const keys = await this.authService.listApiKeys(user.id);
    return { keys };
  }

  @Post('revoke')
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async revokeApiKey(
    @CurrentUser() user: User,
    @Body('keyId') keyId: string,
  ) {
    await this.authService.revokeApiKey(user.id, keyId);
    return { message: 'API key revoked successfully' };
  }
}
