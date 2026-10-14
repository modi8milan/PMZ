import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from './authorization.service.js';
import {
  REPORT_DOWNLOAD,
  REQUIRED_PERMISSIONS,
  REQUIRED_ROLES,
} from './auth.decorators.js';
import type { AuthenticatedRequest } from './auth.types.js';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationService,
  ) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) return true;
    const permissions =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const reportDownload = this.reflector.getAllAndOverride<boolean>(
      REPORT_DOWNLOAD,
      [context.getHandler(), context.getClass()],
    );
    const roles =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_ROLES, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (
      !this.authorization.hasPermissions(request.auth.user, permissions) ||
      (roles.length > 0 &&
        !roles.some((role) => request.auth!.user.roles.includes(role))) ||
      (reportDownload &&
        !this.authorization.canDownloadMonitoringReport(request.auth.user))
    ) {
      throw new ForbiddenException();
    }
    return true;
  }
}
