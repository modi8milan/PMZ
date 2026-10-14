import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Environment } from '../config/environment.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedRequest } from './auth.types.js';
import {
  ALLOW_MFA_SETUP,
  ALLOW_PASSWORD_CHANGE,
  PUBLIC_ROUTE,
} from './auth.decorators.js';

function cookie(request: Request, name: string): string {
  const source = request.headers.cookie ?? '';
  for (const item of source.split(';')) {
    const [key, ...value] = item.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return '';
}

@Injectable()
export class AuthenticationGuard implements CanActivate {
  private readonly cookieName: string;
  private readonly origins: string[];
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    config: ConfigService<Environment, true>,
  ) {
    this.cookieName = config.get('SESSION_COOKIE_NAME', { infer: true });
    this.origins = config.get('CORS_ORIGINS', { infer: true });
  }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await this.auth.authenticate(
      cookie(request, this.cookieName),
    );
    if (!session) throw new UnauthorizedException();
    request.auth = session;
    const expired =
      session.user.mustChangePassword ||
      session.user.passwordExpiresAt.getTime() <= Date.now();
    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PASSWORD_CHANGE,
      [context.getHandler(), context.getClass()],
    );
    if (expired && !allowed)
      throw new ForbiddenException('Password change is required.');
    const mfaSetupAllowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_MFA_SETUP,
      [context.getHandler(), context.getClass()],
    );
    if (
      !expired &&
      session.user.mfaRequired &&
      !session.user.mfaEnabled &&
      !mfaSetupAllowed
    )
      throw new ForbiddenException('MFA enrollment is required.');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.origin;
      const csrf = request.headers['x-csrf-token'];
      if (
        !origin ||
        !this.origins.includes(origin) ||
        typeof csrf !== 'string' ||
        !this.auth.verifyCsrf(session, csrf)
      ) {
        throw new ForbiddenException('Request verification failed.');
      }
    }
    return true;
  }
}
