import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { ContainerService } from '../../integrations/docker/container.service';
import { VolumeService } from '../../integrations/docker/volume.service';
import { ClaudeSessionStatus } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class ClaudeSessionsService {
  private readonly logger = new Logger(ClaudeSessionsService.name);
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly containerService: ContainerService,
    private readonly volumeService: VolumeService,
  ) {
    // Initialize encryption key from environment
    const secret = process.env.API_KEY_ENCRYPTION_SECRET || 'default-secret-key-change-me-32ch';
    this.encryptionKey = Buffer.from(secret.slice(0, 32));
  }

  async createSession(userId: string, projectName: string, config?: any) {
    this.logger.log(`Creating Claude session "${projectName}" for user ${userId}`);

    // Validate project name
    if (!/^[a-zA-Z0-9_-]+$/.test(projectName)) {
      throw new BadRequestException(
        'Project name can only contain alphanumeric characters, hyphens, and underscores',
      );
    }

    // Check if project name already exists for this user
    const existing = await this.prisma.claudeSession.findUnique({
      where: {
        userId_projectName: { userId, projectName },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Project with name "${projectName}" already exists`,
      );
    }

    // Generate unique names
    const timestamp = Date.now();
    const containerName = `claude_${projectName}_${timestamp}`;
    const workspaceVolume = `workspace_${projectName}_${timestamp}`;

    // Create database record
    const session = await this.prisma.claudeSession.create({
      data: {
        userId,
        projectName,
        containerName,
        workspaceVolume,
        status: ClaudeSessionStatus.CREATING,
        environmentId: config?.environmentId,
        cpuLimit: config?.cpuLimit || parseFloat(process.env.CLAUDE_CODE_DEFAULT_CPU_LIMIT || '2.0'),
        memoryLimit: config?.memoryLimit || BigInt(process.env.CLAUDE_CODE_DEFAULT_MEMORY_LIMIT || '4294967296'),
        allowDockerAccess: config?.allowDockerAccess !== undefined ? config.allowDockerAccess : true,
        anthropicApiKey: config?.anthropicApiKey ? await this.encryptApiKey(config.anthropicApiKey) : null,
      },
    });

    // Start container creation asynchronously
    this.createContainer(session.id).catch((error) => {
      this.logger.error(`Failed to create container for session ${session.id}: ${error.message}`);
    });

    return session;
  }

  async createContainer(sessionId: string) {
    const session = await this.prisma.claudeSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    try {
      // Update status to STARTING
      await this.prisma.claudeSession.update({
        where: { id: sessionId },
        data: { status: ClaudeSessionStatus.STARTING },
      });

      // Create workspace volume
      this.logger.log(`Creating workspace volume ${session.workspaceVolume}`);
      await this.volumeService.createVolume(session.workspaceVolume, {
        'com.deployment-platform.claude-session': sessionId,
        'com.deployment-platform.user': session.userId,
        'com.deployment-platform.project': session.projectName,
      });

      // Decrypt API key if present
      const anthropicApiKey = session.anthropicApiKey
        ? await this.decryptApiKey(session.anthropicApiKey)
        : process.env.ANTHROPIC_API_KEY;

      // Prepare container configuration
      const containerConfig = {
        name: session.containerName,
        image: process.env.CLAUDE_CODE_IMAGE || 'claude-code',
        tag: 'latest',
        replicas: 1,
        env: {
          SESSION_ID: sessionId,
          PROJECT_NAME: session.projectName,
          ANTHROPIC_API_KEY: anthropicApiKey,
          ALLOW_DOCKER_ACCESS: session.allowDockerAccess ? 'true' : 'false',
          MCP_SERVER_URL: 'http://backend:3000/mcp/sse',
        },
        volumes: [
          { name: session.workspaceVolume, path: '/workspace', readOnly: false },
        ],
        networks: ['backend'],
        labels: {
          'com.deployment-platform.claude-session': sessionId,
          'com.deployment-platform.user': session.userId,
          'com.deployment-platform.project': session.projectName,
        },
        cpuLimit: session.cpuLimit || 2.0,
        memoryLimit: session.memoryLimit ? Number(session.memoryLimit) : 4 * 1024 * 1024 * 1024,
      };

      // Optionally mount Docker socket if allowed
      if (session.allowDockerAccess) {
        containerConfig.volumes.push({
          name: '/var/run/docker.sock',
          path: '/var/run/docker.sock',
          readOnly: false,
        });
      }

      // Create Docker service
      this.logger.log(`Creating Docker service ${session.containerName}`);
      await this.containerService.createService(containerConfig);

      // Get container ID
      const service = await this.containerService.getService(session.containerName);
      const inspection = await service.inspect();
      const containerId = inspection.ID;

      // Update session with container ID and status
      await this.prisma.claudeSession.update({
        where: { id: sessionId },
        data: {
          containerId,
          status: ClaudeSessionStatus.ACTIVE,
          lastActiveAt: new Date(),
        },
      });

      this.logger.log(`Claude session ${sessionId} created successfully`);
    } catch (error) {
      // Update session status to ERROR
      await this.prisma.claudeSession.update({
        where: { id: sessionId },
        data: {
          status: ClaudeSessionStatus.ERROR,
          errorMessage: error.message,
        },
      });

      this.logger.error(`Failed to create container for session ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  async getSession(userId: string, sessionId: string) {
    const session = await this.prisma.claudeSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      include: {
        environment: true,
        conversations: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return session;
  }

  async listSessions(userId: string) {
    return this.prisma.claudeSession.findMany({
      where: {
        userId,
        status: {
          notIn: [ClaudeSessionStatus.DELETED],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async stopSession(sessionId: string, userId: string) {
    this.logger.log(`Stopping Claude session ${sessionId}`);

    const session = await this.getSession(userId, sessionId);

    if (session.status === ClaudeSessionStatus.STOPPED) {
      throw new ConflictException('Session is already stopped');
    }

    if (session.status === ClaudeSessionStatus.STOPPING) {
      throw new ConflictException('Session is already being stopped');
    }

    // Update status to STOPPING
    await this.prisma.claudeSession.update({
      where: { id: sessionId },
      data: { status: ClaudeSessionStatus.STOPPING },
    });

    try {
      // Stop the Docker service
      if (session.containerName) {
        await this.containerService.removeService(session.containerName);
      }

      // Update status to STOPPED
      await this.prisma.claudeSession.update({
        where: { id: sessionId },
        data: { status: ClaudeSessionStatus.STOPPED },
      });

      this.logger.log(`Session ${sessionId} stopped successfully`);
      return { message: 'Session stopped successfully' };
    } catch (error) {
      // Update status to ERROR
      await this.prisma.claudeSession.update({
        where: { id: sessionId },
        data: {
          status: ClaudeSessionStatus.ERROR,
          errorMessage: `Failed to stop: ${error.message}`,
        },
      });

      this.logger.error(`Failed to stop session ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  async deleteSession(sessionId: string, userId: string) {
    this.logger.log(`Deleting Claude session ${sessionId}`);

    const session = await this.getSession(userId, sessionId);

    if (session.status === ClaudeSessionStatus.DELETING) {
      throw new ConflictException('Session is already being deleted');
    }

    if (session.status === ClaudeSessionStatus.DELETED) {
      throw new ConflictException('Session is already deleted');
    }

    // Update status to DELETING
    await this.prisma.claudeSession.update({
      where: { id: sessionId },
      data: { status: ClaudeSessionStatus.DELETING },
    });

    try {
      // Remove Docker service if it exists
      if (session.containerName) {
        try {
          await this.containerService.removeService(session.containerName);
        } catch (error) {
          this.logger.warn(`Failed to remove service ${session.containerName}: ${error.message}`);
        }
      }

      // Delete workspace volume
      if (session.workspaceVolume) {
        try {
          await this.volumeService.deleteVolume(session.workspaceVolume);
        } catch (error) {
          this.logger.warn(`Failed to delete volume ${session.workspaceVolume}: ${error.message}`);
        }
      }

      // Update status to DELETED
      await this.prisma.claudeSession.update({
        where: { id: sessionId },
        data: { status: ClaudeSessionStatus.DELETED },
      });

      this.logger.log(`Session ${sessionId} deleted successfully`);
      return { message: 'Session deleted successfully' };
    } catch (error) {
      // Update status to ERROR
      await this.prisma.claudeSession.update({
        where: { id: sessionId },
        data: {
          status: ClaudeSessionStatus.ERROR,
          errorMessage: `Deletion failed: ${error.message}`,
        },
      });

      this.logger.error(`Failed to delete session ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  private async encryptApiKey(apiKey: string): Promise<string> {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  private async decryptApiKey(encryptedData: string): Promise<string> {
    const [ivHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
