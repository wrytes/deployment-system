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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiSecurity,
} from '@nestjs/swagger';
import { EnvironmentsService } from './environments.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ScopesGuard } from '../../common/guards/scopes.guard';
import { RequireScopes } from '../../common/decorators/require-scopes.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { ApiKeyScope } from '@prisma/client';

@Controller('environments')
@UseGuards(ApiKeyGuard, ScopesGuard)
@ApiTags('Environments')
@ApiSecurity('api-key')
export class EnvironmentsController {
  constructor(private readonly environmentsService: EnvironmentsService) {}

  @Post()
  @RequireScopes(ApiKeyScope.ENVIRONMENTS_WRITE)
  @ApiOperation({
    summary: 'Create environment',
    description:
      'Create a new isolated environment with private overlay network. ' +
      'Each environment gets its own Docker overlay network for container isolation. ' +
      '\n\n**Required scope**: `ENVIRONMENTS_WRITE`',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          description:
            'Environment name (alphanumeric, hyphens, underscores only)',
          example: 'my-app-prod',
          pattern: '^[a-zA-Z0-9_-]+$',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Environment created successfully',
    schema: {
      example: {
        environment: {
          id: 'clx123abc456def',
          name: 'my-app-prod',
          overlayNetworkId: 'overlay_env_my-app-prod_1738579200',
          status: 'ACTIVE',
          isPublic: false,
          publicDomain: null,
          createdAt: '2026-02-03T12:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing ENVIRONMENTS_WRITE scope',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid environment name',
  })
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
  @ApiOperation({
    summary: 'List environments',
    description:
      'List all environments for the authenticated user. ' +
      '\n\n**Required scope**: `ENVIRONMENTS_READ`',
  })
  @ApiResponse({
    status: 200,
    description: 'List of environments',
    schema: {
      example: {
        environments: [
          {
            id: 'clx123abc456def',
            name: 'my-app-prod',
            status: 'ACTIVE',
            isPublic: true,
            publicDomain: 'my-app.example.com',
            createdAt: '2026-02-03T12:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing ENVIRONMENTS_READ scope',
  })
  async listEnvironments(@CurrentUser() user: User) {
    const environments = await this.environmentsService.listEnvironments(
      user.id,
    );
    return { environments };
  }

  @Get(':id')
  @RequireScopes(ApiKeyScope.ENVIRONMENTS_READ)
  @ApiOperation({
    summary: 'Get environment details',
    description:
      'Get detailed information about a specific environment. ' +
      '\n\n**Required scope**: `ENVIRONMENTS_READ`',
  })
  @ApiParam({
    name: 'id',
    description: 'Environment ID (CUID)',
    example: 'clx123abc456def',
  })
  @ApiResponse({
    status: 200,
    description: 'Environment details',
    schema: {
      example: {
        environment: {
          id: 'clx123abc456def',
          name: 'my-app-prod',
          overlayNetworkId: 'overlay_env_my-app-prod_1738579200',
          status: 'ACTIVE',
          isPublic: true,
          publicDomain: 'my-app.example.com',
          createdAt: '2026-02-03T12:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
  })
  @ApiResponse({
    status: 404,
    description: 'Environment not found',
  })
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
  @ApiOperation({
    summary: 'Delete environment',
    description:
      'Delete an environment and all its deployments. ' +
      'This will stop and remove all containers, volumes, and the overlay network. ' +
      '\n\n**Required scope**: `ENVIRONMENTS_WRITE`',
  })
  @ApiParam({
    name: 'id',
    description: 'Environment ID to delete',
    example: 'clx123abc456def',
  })
  @ApiResponse({
    status: 200,
    description: 'Environment deleted successfully',
    schema: {
      example: {
        message: 'Environment deleted successfully',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing ENVIRONMENTS_WRITE scope',
  })
  @ApiResponse({
    status: 404,
    description: 'Environment not found',
  })
  async deleteEnvironment(
    @CurrentUser() user: User,
    @Param('id') environmentId: string,
  ) {
    return this.environmentsService.deleteEnvironment(user.id, environmentId);
  }

  @Post(':id/public')
  @RequireScopes(ApiKeyScope.ENVIRONMENTS_WRITE)
  @ApiOperation({
    summary: 'Enable public access',
    description:
      'Make an environment publicly accessible via HTTPS with automatic SSL. ' +
      "This configures Nginx reverse proxy and requests Let's Encrypt certificate. " +
      "Domain must point to this server's IP address. " +
      '\n\n**Required scope**: `ENVIRONMENTS_WRITE`',
  })
  @ApiParam({
    name: 'id',
    description: 'Environment ID to make public',
    example: 'clx123abc456def',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['domain'],
      properties: {
        domain: {
          type: 'string',
          description:
            'Domain name for public access (must point to this server)',
          example: 'my-app.example.com',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Public access enabled successfully',
    schema: {
      example: {
        environment: {
          id: 'clx123abc456def',
          name: 'my-app-prod',
          isPublic: true,
          publicDomain: 'my-app.example.com',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
  })
  @ApiResponse({
    status: 404,
    description: 'Environment not found',
  })
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
