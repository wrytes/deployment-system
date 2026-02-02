import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyScope } from '@prisma/client';
import { SCOPES_KEY } from '../decorators/require-scopes.decorator';

@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<ApiKeyScope[]>(
      SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const apiKey = request.apiKey;

    if (!apiKey) {
      throw new ForbiddenException('API key not found in request');
    }

    // Check if user has ADMIN scope (grants all permissions)
    if (apiKey.scopes.includes(ApiKeyScope.ADMIN)) {
      return true;
    }

    // Check if API key has all required scopes
    const hasAllScopes = requiredScopes.every((scope) =>
      apiKey.scopes.includes(scope),
    );

    if (!hasAllScopes) {
      throw new ForbiddenException(
        `Insufficient permissions. Required scopes: ${requiredScopes.join(', ')}`,
      );
    }

    return true;
  }
}
