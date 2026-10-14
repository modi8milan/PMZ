import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../src/config/environment.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthRepository } from '../src/auth/auth.repository.js';
import type {
  AuthSession,
  AuthUser,
  SecurityEvent,
} from '../src/auth/auth.types.js';
import {
  AuthorizationService,
  REPORT_DOWNLOAD_ROLES,
} from '../src/auth/authorization.service.js';
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  passwordPolicyErrors,
  totp,
  verifyPassword,
  verifyTotp,
} from '../src/security/security.crypto.js';

const key = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const config = new ConfigService<Environment, true>({
  PASSWORD_EXPIRY_DAYS: 30,
  PASSWORD_HISTORY_COUNT: 5,
  SESSION_IDLE_MINUTES: 30,
  SESSION_ABSOLUTE_HOURS: 8,
  LOGIN_MAX_FAILURES: 5,
  LOCKOUT_MINUTES: 15,
  RESET_TOKEN_MINUTES: 30,
  MFA_ENCRYPTION_KEY: key,
} as Environment);
function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    username: 'monitor.one',
    fullName: 'Monitor One',
    email: null,
    departmentId: null,
    status: 'active',
    passwordHash: '',
    passwordExpiresAt: new Date(Date.now() + 86_400_000),
    mustChangePassword: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    mfaSecretEncrypted: null,
    mfaEnabled: false,
    mfaRequired: false,
    authVersion: 1,
    roles: ['CRA_MONITOR'],
    permissions: ['View', 'Edit'],
    ...overrides,
  };
}

class FakeRepository {
  account: AuthUser | null = null;
  events: SecurityEvent[] = [];
  failed: { user: AuthUser | null; lock: Date | null } | null = null;
  createdSession: Record<string, unknown> | null = null;
  revoked = '';
  changed: { hash: string; expires: Date } | null = null;
  history: string[] = [];
  resetAvailable = true;
  recoveryValid = false;
  mfaDisabled = false;
  async findUserByUsername() {
    return this.account;
  }
  async findUserById() {
    return this.account;
  }
  async recordFailedLogin(value: AuthUser | null, lock: Date | null) {
    this.failed = { user: value, lock };
  }
  async event(value: SecurityEvent) {
    this.events.push(value);
  }
  async clearFailedLogins() {}
  async createSession(value: Record<string, unknown>) {
    this.createdSession = value;
    return 'session-id';
  }
  async findSession() {
    return null;
  }
  async touchSession() {}
  async rotateCsrf() {}
  async revokeSession(_id: string, reason: string) {
    this.revoked = reason;
  }
  async revokeUserSessions() {}
  async passwordHistory() {
    return this.history;
  }
  async changePassword(_u: AuthUser, hash: string, expires: Date) {
    this.changed = { hash, expires };
  }
  async findResetUser() {
    return this.resetAvailable ? this.account : null;
  }
  async consumeReset() {
    if (!this.resetAvailable) return null;
    this.resetAvailable = false;
    return this.account?.id ?? null;
  }
  async consumeRecoveryCode() {
    const valid = this.recoveryValid;
    this.recoveryValid = false;
    return valid;
  }
  async issueReset() {
    return 'reset-id';
  }
  async setMfaSecret() {}
  async enableMfa() {}
  async disableMfa() {
    this.mfaDisabled = true;
  }
  async userCount() {
    return 0;
  }
  async bootstrap() {
    return this.account?.id ?? null;
  }
}
function service(repository: FakeRepository) {
  return new AuthService(repository as unknown as AuthRepository, config);
}

describe('password and MFA primitives', () => {
  it('enforces length, composition, common-password and username controls', () => {
    assert.ok(passwordPolicyErrors('short1', 'user').length > 0);
    assert.ok(passwordPolicyErrors('password1234', 'user').length > 0);
    assert.ok(passwordPolicyErrors('Monitor.One42!', 'monitor.one').length > 0);
    assert.deepEqual(
      passwordPolicyErrors('Cedar-River-42!', 'monitor.one'),
      [],
    );
  });
  it('hashes passwords with scrypt and verifies without plaintext storage', async () => {
    const encoded = await hashPassword('Cedar-River-42!');
    assert.match(encoded, /^scrypt\$/);
    assert.doesNotMatch(encoded, /Cedar/);
    assert.equal(await verifyPassword('Cedar-River-42!', encoded), true);
    assert.equal(await verifyPassword('wrong', encoded), false);
  });
  it('encrypts TOTP secrets and accepts only a valid time-window code', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const encrypted = encryptSecret(secret, key);
    assert.doesNotMatch(encrypted, /JBSWY/);
    assert.equal(decryptSecret(encrypted, key), secret);
    const now = 1_800_000_000_000;
    assert.equal(verifyTotp(secret, totp(secret, now), now), true);
    assert.equal(verifyTotp(secret, '000000', now), false);
  });
});

describe('authentication lifecycle', () => {
  it('creates only hashed opaque session and CSRF identifiers for valid login', async () => {
    const repo = new FakeRepository();
    repo.account = user({
      passwordHash: await hashPassword('Cedar-River-42!'),
    });
    const result = await service(repo).login({
      username: 'monitor.one',
      password: 'Cedar-River-42!',
    });
    assert.ok(result.sessionToken);
    assert.ok(result.csrfToken);
    assert.equal(String(repo.createdSession?.tokenHash).length, 64);
    assert.notEqual(repo.createdSession?.tokenHash, result.sessionToken);
    assert.equal(repo.events.at(-1)?.eventType, 'login_success');
  });
  it('uses generic rejection for invalid credentials, inactive accounts and lockout', async () => {
    const repo = new FakeRepository();
    repo.account = user({
      passwordHash: await hashPassword('Cedar-River-42!'),
      failedLoginAttempts: 4,
    });
    await assert.rejects(
      () => service(repo).login({ username: 'monitor.one', password: 'wrong' }),
      /Invalid credentials/,
    );
    assert.ok(repo.failed?.lock);
    assert.equal(repo.events.at(-1)?.eventType, 'account_lockout');
    repo.account = user({
      passwordHash: await hashPassword('Cedar-River-42!'),
      status: 'inactive',
    });
    await assert.rejects(
      () =>
        service(repo).login({
          username: 'monitor.one',
          password: 'Cedar-River-42!',
        }),
      /Invalid credentials/,
    );
    repo.account = null;
    await assert.rejects(
      () => service(repo).login({ username: 'missing', password: 'anything' }),
      /Invalid credentials/,
    );
  });
  it('rejects expired sessions and revokes logout sessions', async () => {
    const repo = new FakeRepository();
    const auth = service(repo);
    assert.equal(await auth.authenticate('expired-token'), null);
    await auth.logout({
      id: 's1',
      user: user(),
      csrfTokenHash: 'x',
      absoluteExpiresAt: new Date(),
    } as AuthSession);
    assert.equal(repo.revoked, 'logout');
  });
  it('enforces password history and the configurable 30-day expiry', async () => {
    const repo = new FakeRepository();
    repo.account = user({
      passwordHash: await hashPassword('Cedar-River-42!'),
    });
    repo.history = [await hashPassword('Forest-Cloud-73!')];
    const auth = service(repo);
    await assert.rejects(
      () =>
        auth.changePassword(
          repo.account!,
          'Cedar-River-42!',
          'Forest-Cloud-73!',
        ),
      /recent password/,
    );
    const before = Date.now();
    await auth.changePassword(
      repo.account!,
      'Cedar-River-42!',
      'Harbor-Stone-84!',
    );
    assert.ok(repo.changed);
    const days = (repo.changed!.expires.getTime() - before) / 86_400_000;
    assert.ok(days >= 29.99 && days <= 30.01);
  });
  it('enforces reset-token single use and first-login forced change', async () => {
    const repo = new FakeRepository();
    repo.account = user({
      passwordHash: await hashPassword('Cedar-River-42!'),
      mustChangePassword: true,
    });
    const auth = service(repo);
    const login = await auth.login({
      username: 'monitor.one',
      password: 'Cedar-River-42!',
    });
    assert.equal(login.session.user.mustChangePassword, true);
    await auth.completeReset(
      'long-enough-single-use-reset-token',
      'Harbor-Stone-84!',
    );
    await assert.rejects(
      () =>
        auth.completeReset(
          'long-enough-single-use-reset-token',
          'Ocean-Field-95!',
        ),
      /invalid or expired/,
    );
  });
  it('accepts a recovery code once and supports re-authenticated optional MFA disable', async () => {
    const repo = new FakeRepository();
    repo.recoveryValid = true;
    repo.account = user({
      passwordHash: await hashPassword('Cedar-River-42!'),
      mfaEnabled: true,
      mfaSecretEncrypted: encryptSecret('JBSWY3DPEHPK3PXP', key),
    });
    const auth = service(repo);
    await auth.login({
      username: 'monitor.one',
      password: 'Cedar-River-42!',
      mfaCode: 'ABCD-EFGH',
    });
    assert.equal(repo.recoveryValid, false);
    repo.recoveryValid = true;
    await auth.disableMfa(repo.account, 'Cedar-River-42!', 'ABCD-EFGH');
    assert.equal(repo.mfaDisabled, true);
    assert.equal(repo.events.at(-1)?.eventType, 'mfa_disabled');
  });
});

describe('authorization invariants', () => {
  const authorization = new AuthorizationService();
  it('allows report download only for the three approved role categories', () => {
    for (const role of ['ASSOCIATE_DIRECTOR_GCP', 'PROJECT_MANAGER', 'QMS'])
      assert.equal(
        authorization.canDownloadMonitoringReport(
          user({ roles: [role], permissions: ['Download'] }),
        ),
        true,
      );
    for (const role of [
      'CRA_MONITOR',
      'DIRECTOR',
      'DIRECTOR_OPERATIONS',
      'SYSTEM_ADMINISTRATOR',
      'BUSINESS_QUALITY_CONFIG_ADMIN',
    ])
      assert.equal(
        authorization.canDownloadMonitoringReport(
          user({ roles: [role], permissions: ['Download', 'Administer'] }),
        ),
        false,
      );
    assert.deepEqual(
      [...REPORT_DOWNLOAD_ROLES].sort(),
      ['ASSOCIATE_DIRECTOR_GCP', 'PROJECT_MANAGER', 'QMS'].sort(),
    );
  });
  it('requires actual assignment for future resource scope', () => {
    const subject = user();
    assert.equal(
      authorization.canAccessResource(subject, {
        assignedUserIds: [subject.id],
      }),
      true,
    );
    assert.equal(
      authorization.canAccessResource(subject, {
        assignedUserIds: ['someone-else'],
      }),
      false,
    );
  });
});

describe('security-event secret exclusion', () => {
  it('removes secret-like context keys before persistence', async () => {
    let values: unknown[] = [];
    const db = {
      query: async (_sql: string, input: unknown[]) => {
        values = input;
        return { rows: [], rowCount: 1 };
      },
    };
    const repository = new AuthRepository(db as never);
    await repository.event({
      eventType: 'test',
      outcome: 'success',
      context: {
        password: 'hidden',
        resetToken: 'hidden',
        safeCode: 'allowed',
      },
    });
    const context = JSON.parse(String(values[6]));
    assert.deepEqual(context, { safeCode: 'allowed' });
    assert.doesNotMatch(JSON.stringify(values), /hidden/);
  });
});
