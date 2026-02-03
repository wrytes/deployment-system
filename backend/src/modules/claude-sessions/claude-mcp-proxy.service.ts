import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';

const execAsync = promisify(exec);

@Injectable()
export class ClaudeMcpProxyService {
  private readonly logger = new Logger(ClaudeMcpProxyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendMessage(
    sessionId: string,
    userId: string,
    message: string,
    telegramMsgId?: number,
  ): Promise<string> {
    this.logger.log(`Sending message to Claude session ${sessionId}`);

    // Verify session belongs to user
    const session = await this.prisma.claudeSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Session is not active (current status: ${session.status})`,
      );
    }

    // Record user message
    const userMessageId = crypto.randomUUID();
    await this.recordConversation(
      sessionId,
      userMessageId,
      'user',
      message,
      telegramMsgId ? BigInt(telegramMsgId) : null,
    );

    try {
      // Execute message in container via docker exec
      const response = await this.executeInContainer(session.containerName, message);

      // Record assistant response
      const assistantMessageId = crypto.randomUUID();
      await this.recordConversation(
        sessionId,
        assistantMessageId,
        'assistant',
        response,
        null,
      );

      // Update last active time
      await this.prisma.claudeSession.update({
        where: { id: sessionId },
        data: { lastActiveAt: new Date() },
      });

      return response;
    } catch (error) {
      this.logger.error(
        `Failed to send message to session ${sessionId}: ${error.message}`,
      );
      throw new BadRequestException(
        `Failed to communicate with Claude: ${error.message}`,
      );
    }
  }

  async executeInContainer(containerName: string, input: string): Promise<string> {
    try {
      // Get the actual container ID running the service
      const { stdout: containerList } = await execAsync(
        `docker ps --filter "name=${containerName}" --format "{{.ID}}" | head -1`,
      );

      const containerId = containerList.trim();
      if (!containerId) {
        throw new Error('Container is not running');
      }

      // Escape input for shell
      const escapedInput = input.replace(/'/g, "'\\''");

      // Execute command in container
      // TODO: Replace with actual Claude Code CLI invocation when available
      // For now, simulate with a simple echo
      const { stdout, stderr } = await execAsync(
        `docker exec ${containerId} bash -c 'echo "Received: ${escapedInput}" && echo "This is a placeholder response. Claude Code CLI integration pending."'`,
      );

      if (stderr) {
        this.logger.warn(`Container stderr: ${stderr}`);
      }

      return stdout.trim() || 'No response from Claude';
    } catch (error) {
      this.logger.error(`Container execution failed: ${error.message}`);
      throw error;
    }
  }

  async recordConversation(
    sessionId: string,
    messageId: string,
    role: string,
    content: string,
    telegramMsgId: bigint | null,
    metadata?: any,
  ): Promise<void> {
    await this.prisma.claudeConversation.create({
      data: {
        sessionId,
        messageId,
        role,
        content,
        telegramMsgId,
        metadata,
      },
    });
  }

  async getConversationHistory(
    sessionId: string,
    userId: string,
    limit: number = 50,
  ) {
    // Verify session belongs to user
    const session = await this.prisma.claudeSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return this.prisma.claudeConversation.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }
}
