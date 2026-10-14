import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from './authorization.service.js';
import { REPORT_DOWNLOAD, REQUIRED_PERMISSIONS } from './auth.decorators.js';
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
    if (
      !this.authorization.hasPermissions(request.auth.user, permissions) ||
      (reportDownload &&
        !this.authorization.canDownloadMonitoringReport(request.auth.user))
    ) {
      throw new ForbiddenException();
    }
    return true;
  }
}
