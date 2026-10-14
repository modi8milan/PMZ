import { Injectable } from '@nestjs/common';
import type { AuthUser } from './auth.types.js';

export const REPORT_DOWNLOAD_ROLES = new Set([
  'PROJECT_MANAGER',
  'QMS',
  'ASSOCIATE_DIRECTOR_GCP',
]);

export type ResourceScope = {
  assignedUserIds?: string[];
  organizationWide?: boolean;
};

@Injectable()
export class AuthorizationService {
  hasPermissions(user: AuthUser, permissions: string[]): boolean {
    return permissions.every((permission) =>
      user.permissions.includes(permission),
    );
  }
  canDownloadMonitoringReport(user: AuthUser): boolean {
    return (
      user.permissions.includes('Download') &&
      user.roles.some((role) => REPORT_DOWNLOAD_ROLES.has(role))
    );
  }
  canAccessResource(user: AuthUser, scope: ResourceScope): boolean {
    return Boolean(
      scope.organizationWide || scope.assignedUserIds?.includes(user.id),
    );
  }
}
