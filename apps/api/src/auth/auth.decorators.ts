import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE = 'public_route';
export const ALLOW_PASSWORD_CHANGE = 'allow_password_change';
export const REQUIRED_PERMISSIONS = 'required_permissions';
export const REPORT_DOWNLOAD = 'report_download';
export const ALLOW_MFA_SETUP = 'allow_mfa_setup';
export const REQUIRED_ROLES = 'required_roles';

export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export const AllowPasswordChange = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE, true);
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
export const MonitoringReportDownload = () =>
  SetMetadata(REPORT_DOWNLOAD, true);
export const AllowMfaSetup = () => SetMetadata(ALLOW_MFA_SETUP, true);
export const RequireRoles = (...roles: string[]) =>
  SetMetadata(REQUIRED_ROLES, roles);
