import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DeploymentsService } from './deployments.service';
import type { CreateDeploymentDto, CreateDeploymentFromGitDto } from './deployments.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ScopesGuard } from '../../common/guards/scopes.guard';
import { RequireScopes } from '../../common/decorators/require-scopes.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { ApiKeyScope } from '@prisma/client';

@Controller('deployments')
@UseGuards(ApiKeyGuard, ScopesGuard)
export class DeploymentsController {
  constructor(private readonly deploymentsService: DeploymentsService) {}

  @Post()
  @RequireScopes(ApiKeyScope.DEPLOYMENTS_WRITE)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 deployments per minute
  async createDeployment(
    @CurrentUser() user: User,
    @Body() dto: CreateDeploymentDto,
  ) {
    return this.deploymentsService.createDeployment(user.id, dto);
  }

  @Post('from-git')
  @RequireScopes(ApiKeyScope.DEPLOYMENTS_WRITE)
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 Git deployments per minute (more resource intensive)
  async createDeploymentFromGit(
    @CurrentUser() user: User,
    @Body() dto: CreateDeploymentFromGitDto,
  ) {
    return this.deploymentsService.createDeploymentFromGit(user.id, dto);
  }

  @Get('job/:jobId')
  @RequireScopes(ApiKeyScope.DEPLOYMENTS_READ)
  async getDeploymentStatus(
    @CurrentUser() user: User,
    @Param('jobId') jobId: string,
  ) {
    const deployment = await this.deploymentsService.getDeploymentStatus(
      user.id,
      jobId,
    );
    return { deployment };
  }

  @Get('environment/:envId')
  @RequireScopes(ApiKeyScope.DEPLOYMENTS_READ)
  async listDeployments(
    @CurrentUser() user: User,
    @Param('envId') environmentId: string,
  ) {
    const deployments = await this.deploymentsService.listDeployments(
      user.id,
      environmentId,
    );
    return { deployments };
  }

  @Get(':id/logs')
  @RequireScopes(ApiKeyScope.LOGS_READ)
  async getDeploymentLogs(
    @CurrentUser() user: User,
    @Param('id') deploymentId: string,
    @Query('tail') tail?: string,
  ) {
    const tailNum = tail ? parseInt(tail, 10) : 100;
    const logs = await this.deploymentsService.getDeploymentLogs(
      user.id,
      deploymentId,
      tailNum,
    );
    return { logs };
  }
}
