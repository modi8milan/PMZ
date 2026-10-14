import type { Request } from 'express';

export type AuthUser = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  departmentId: string | null;
  status: 'active' | 'inactive';
  passwordHash: string;
  passwordExpiresAt: Date;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  mfaSecretEncrypted: string | null;
  mfaEnabled: boolean;
  mfaRequired: boolean;
  authVersion: number;
  roles: string[];
  permissions: string[];
};

export type AuthSession = {
  id: string;
  user: AuthUser;
  csrfTokenHash: string;
  absoluteExpiresAt: Date;
};

export type AuthenticatedRequest = Request & { auth?: AuthSession };

export type SecurityEvent = {
  actorUserId?: string | null;
  subjectUserId?: string | null;
  eventType: string;
  outcome: 'success' | 'failure' | 'denied';
  requestId?: string | null;
  context?: Record<string, string | number | boolean | null>;
};
