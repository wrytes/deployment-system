import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../core/database/prisma.service';
import { TelegramService } from '../../integrations/telegram/telegram.service';
import {
  EnvironmentActiveEvent,
  EnvironmentErrorEvent,
  EnvironmentDeletedEvent,
  EnvironmentMadePublicEvent,
  DeploymentSuccessEvent,
  DeploymentFailedEvent,
  DeploymentStartedEvent,
  DeploymentStoppedEvent,
} from '../events/notification.events';

@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
  ) {}

  @OnEvent('environment.active')
  async handleEnvironmentActive(event: EnvironmentActiveEvent) {
    await this.sendNotification(
      event.userId,
      'ENVIRONMENT_ACTIVE',
      async (user) => {
        if (!user.notifyEnvironmentActive) return false;

        const message = this.formatEnvironmentActiveMessage(event);
        await this.telegramService.sendMarkdownMessage(
          Number(user.telegramId),
          message,
        );
        return true;
      },
    );
  }

  @OnEvent('environment.error')
  async handleEnvironmentError(event: EnvironmentErrorEvent) {
    await this.sendNotification(
      event.userId,
      'ENVIRONMENT_ERROR',
      async (user) => {
        if (!user.notifyErrors) return false;

        const message = this.formatEnvironmentErrorMessage(event);
        await this.telegramService.sendMarkdownMessage(
          Number(user.telegramId),
          message,
        );
        return true;
      },
    );
  }

  @OnEvent('environment.deleted')
  async handleEnvironmentDeleted(event: EnvironmentDeletedEvent) {
    await this.sendNotification(
      event.userId,
      'ENVIRONMENT_DELETED',
      async (user) => {
        if (!user.notifyEnvironmentDeleted) return false;

        const message = this.formatEnvironmentDeletedMessage(event);
        await this.telegramService.sendMarkdownMessage(
          Number(user.telegramId),
          message,
        );
        return true;
      },
    );
  }

  @OnEvent('environment.made_public')
  async handleEnvironmentMadePublic(event: EnvironmentMadePublicEvent) {
    await this.sendNotification(
      event.userId,
      'ENVIRONMENT_MADE_PUBLIC',
      async (user) => {
        if (!user.notifyEnvironmentMadePublic) return false;

        const message = this.formatEnvironmentMadePublicMessage(event);
        await this.telegramService.sendMarkdownMessage(
          Number(user.telegramId),
          message,
        );
        return true;
      },
    );
  }

  @OnEvent('deployment.success')
  async handleDeploymentSuccess(event: DeploymentSuccessEvent) {
    await this.sendNotification(
      event.userId,
      'DEPLOYMENT_SUCCESS',
      async (user) => {
        if (!user.notifyDeploymentSuccess) return false;

        const message = this.formatDeploymentSuccessMessage(event);
        await this.telegramService.sendMarkdownMessage(
          Number(user.telegramId),
          message,
        );
        return true;
      },
    );
  }

  @OnEvent('deployment.failed')
  async handleDeploymentFailed(event: DeploymentFailedEvent) {
    await this.sendNotification(
      event.userId,
      'DEPLOYMENT_FAILED',
      async (user) => {
        if (!user.notifyErrors) return false;

        const message = this.formatDeploymentFailedMessage(event);
        await this.telegramService.sendMarkdownMessage(
          Number(user.telegramId),
          message,
        );
        return true;
      },
    );
  }

  @OnEvent('deployment.started')
  async handleDeploymentStarted(event: DeploymentStartedEvent) {
    await this.sendNotification(
      event.userId,
      'DEPLOYMENT_STARTED',
      async (user) => {
        if (!user.notifyDeploymentStarted) return false;

        const message = this.formatDeploymentStartedMessage(event);
        await this.telegramService.sendMarkdownMessage(
          Number(user.telegramId),
          message,
        );
        return true;
      },
    );
  }

  @OnEvent('deployment.stopped')
  async handleDeploymentStopped(event: DeploymentStoppedEvent) {
    await this.sendNotification(
      event.userId,
      'DEPLOYMENT_STOPPED',
      async (user) => {
        if (!user.notifyDeploymentStopped) return false;

        const message = this.formatDeploymentStoppedMessage(event);
        await this.telegramService.sendMarkdownMessage(
          Number(user.telegramId),
          message,
        );
        return true;
      },
    );
  }

  private async sendNotification(
    userId: string,
    eventType: string,
    sendFn: (user: any) => Promise<boolean>,
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.telegramId) {
        this.logger.debug(
          `User ${userId} has no Telegram ID, skipping notification`,
        );
        return;
      }

      const sent = await sendFn(user);
      if (sent) {
        this.logger.log(`Sent ${eventType} notification to user ${userId}`);
      } else {
        this.logger.debug(
          `User ${userId} has disabled ${eventType} notifications`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to send ${eventType} notification to user ${userId}: ${error.message}`,
      );
      // Don't throw - notification failures should not break the main flow
    }
  }

  // Message Formatters
  private formatEnvironmentActiveMessage(
    event: EnvironmentActiveEvent,
  ): string {
    return (
      `✅ *Environment Active*\n\n` +
      `Environment: \`${event.environmentName}\`\n` +
      `Network: \`${event.overlayNetworkId}\`\n` +
      `Status: *ACTIVE*\n\n` +
      `Your environment is ready to receive deployments.`
    );
  }

  private formatEnvironmentErrorMessage(event: EnvironmentErrorEvent): string {
    const operationText = {
      creation: 'Creation Failed',
      deletion: 'Deletion Failed',
      public_config: 'Public Configuration Failed',
    }[event.operation];

    return (
      `❌ *Environment Error*\n\n` +
      `Environment: \`${event.environmentName}\`\n` +
      `Operation: *${operationText}*\n\n` +
      `Error:\n\`\`\`\n${event.errorMessage}\n\`\`\``
    );
  }

  private formatEnvironmentDeletedMessage(
    event: EnvironmentDeletedEvent,
  ): string {
    return (
      `🗑️ *Environment Deleted*\n\n` +
      `Environment: \`${event.environmentName}\`\n` +
      `Status: *DELETED*\n\n` +
      `All associated services and networks have been removed.`
    );
  }

  private formatEnvironmentMadePublicMessage(
    event: EnvironmentMadePublicEvent,
  ): string {
    return (
      `🌐 *Environment Made Public*\n\n` +
      `Environment: \`${event.environmentName}\`\n` +
      `Status: *PUBLIC*\n\n` +
      `Nginx-proxy attached. You can now create deployments with virtualHost.`
    );
  }

  private formatDeploymentSuccessMessage(
    event: DeploymentSuccessEvent,
  ): string {
    const deploymentType = event.isGitDeployment ? 'Git' : 'Image';

    let message =
      `✅ *Deployment Successful*\n\n` +
      `Environment: \`${event.environmentName}\`\n` +
      `Type: *${deploymentType}*\n` +
      `Image: \`${event.image}:${event.tag}\`\n` +
      `Status: *RUNNING*`;

    // Add public access info if virtualHost is configured
    if (event.virtualHost && event.virtualPort) {
      message +=
        `\n\n` +
        `🌐 *Public Access*\n` +
        `Domain: \`${event.virtualHost}\`\n` +
        `Port: \`${event.virtualPort}\`\n\n` +
        `Visit: https://${event.virtualHost}`;
    } else {
      message += `\n\n` + `Your deployment is now live and running.`;
    }

    return message;
  }

  private formatDeploymentFailedMessage(event: DeploymentFailedEvent): string {
    const deploymentType = event.isGitDeployment ? 'Git' : 'Image';

    return (
      `❌ *Deployment Failed*\n\n` +
      `Job ID: \`${event.deploymentId}\`\n` +
      `Environment: \`${event.environmentName}\`\n` +
      `Type: *${deploymentType}*\n` +
      `Image: \`${event.image}\`\n` +
      `Status: *FAILED*\n\n` +
      `Error:\n\`\`\`\n${event.errorMessage}\n\`\`\``
    );
  }

  private formatDeploymentStartedMessage(
    event: DeploymentStartedEvent,
  ): string {
    const deploymentType = event.isGitDeployment ? 'Git' : 'Image';

    return (
      `🚀 *Deployment Started*\n\n` +
      `Job ID: \`${event.deploymentId}\`\n` +
      `Environment: \`${event.environmentName}\`\n` +
      `Type: *${deploymentType}*\n` +
      `Image: \`${event.image}:${event.tag}\`\n` +
      `Status: *PULLING_IMAGE*\n\n` +
      `Your deployment has begun processing.`
    );
  }

  private formatDeploymentStoppedMessage(
    event: DeploymentStoppedEvent,
  ): string {
    return (
      `⏹️ *Deployment Stopped*\n\n` +
      `Job ID: \`${event.deploymentId}\`\n` +
      `Environment: \`${event.environmentName}\`\n` +
      `Image: \`${event.image}:${event.tag}\`\n` +
      `Status: *STOPPED*\n\n` +
      `Your deployment has been stopped.`
    );
  }
}
