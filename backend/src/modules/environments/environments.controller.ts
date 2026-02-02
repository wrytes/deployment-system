import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EnvironmentsService } from './environments.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ScopesGuard } from '../../common/guards/scopes.guard';
import { RequireScopes } from '../../common/decorators/require-scopes.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, ApiKeyScope } from '@prisma/client';

@Controller('environments')
@UseGuards(ApiKeyGuard, ScopesGuard)
export class EnvironmentsController {
  constructor(private readonly environmentsService: EnvironmentsService) {}

  @Post()
  @RequireScopes(ApiKeyScope.ENVIRONMENTS_WRITE)
  async createEnvironment(
    @CurrentUser() user: User,
    @Body('name') name: string,
  ) {
    const environment = await this.environmentsService.createEnvironment(
      user.id,
      name,
    );
    return { environment };
  }

  @Get()
  @RequireScopes(ApiKeyScope.ENVIRONMENTS_READ)
  async listEnvironments(@CurrentUser() user: User) {
    const environments = await this.environmentsService.listEnvironments(
      user.id,
    );
    return { environments };
  }

  @Get(':id')
  @RequireScopes(ApiKeyScope.ENVIRONMENTS_READ)
  async getEnvironment(
    @CurrentUser() user: User,
    @Param('id') environmentId: string,
  ) {
    const environment = await this.environmentsService.getEnvironment(
      user.id,
      environmentId,
    );
    return { environment };
  }

  @Delete(':id')
  @RequireScopes(ApiKeyScope.ENVIRONMENTS_WRITE)
  @HttpCode(HttpStatus.OK)
  async deleteEnvironment(
    @CurrentUser() user: User,
    @Param('id') environmentId: string,
  ) {
    return this.environmentsService.deleteEnvironment(user.id, environmentId);
  }

  @Post(':id/public')
  @RequireScopes(ApiKeyScope.ENVIRONMENTS_WRITE)
  async makePublic(
    @CurrentUser() user: User,
    @Param('id') environmentId: string,
    @Body('domain') domain: string,
  ) {
    const environment = await this.environmentsService.makePublic(
      user.id,
      environmentId,
      domain,
    );
    return { environment };
  }
}
