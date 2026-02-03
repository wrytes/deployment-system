import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ClaudeSessionsService } from './claude-sessions.service';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';

@Controller('claude-sessions')
@UseGuards(ApiKeyGuard)
export class ClaudeSessionsController {
  constructor(private readonly claudeSessionsService: ClaudeSessionsService) {}

  @Post()
  async createSession(
    @Request() req,
    @Body() body: { projectName: string; config?: any },
  ) {
    const userId = req.user.id;
    return this.claudeSessionsService.createSession(
      userId,
      body.projectName,
      body.config,
    );
  }

  @Get()
  async listSessions(@Request() req) {
    const userId = req.user.id;
    return this.claudeSessionsService.listSessions(userId);
  }

  @Get(':sessionId')
  async getSession(@Request() req, @Param('sessionId') sessionId: string) {
    const userId = req.user.id;
    return this.claudeSessionsService.getSession(userId, sessionId);
  }

  @Post(':sessionId/stop')
  async stopSession(@Request() req, @Param('sessionId') sessionId: string) {
    const userId = req.user.id;
    return this.claudeSessionsService.stopSession(sessionId, userId);
  }

  @Delete(':sessionId')
  async deleteSession(@Request() req, @Param('sessionId') sessionId: string) {
    const userId = req.user.id;
    return this.claudeSessionsService.deleteSession(sessionId, userId);
  }
}
