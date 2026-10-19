import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { Environment } from '../src/config/environment.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthRepository } from '../src/auth/auth.repository.js';
import { AuthenticationGuard } from '../src/auth/auth.guard.js';
import { PermissionGuard } from '../src/auth/permission.guard.js';
import { AuthController } from '../src/auth/auth.controller.js';
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
  randomNumericToken,
  randomToken,
  tokenHash,
  totp,
  verifyPassword,
  verifyTotp,
} from '../src/security/security.crypto.js';
import { AdminController } from '../src/admin/admin.controller.js';
import { AdminService } from '../src/admin/admin.service.js';
import { SafeLogger } from '../src/common/safe-logger.js';
import { setup } from '../src/setup.js';
import { DatabaseService } from '../src/database/database.service.js';
import { UpdateUserDto } from '../src/admin/admin.dto.js';
import { ResetPasswordDto } from '../src/auth/auth.dto.js';
import { validate } from 'class-validator';
import { UnauthorizedException } from '@nestjs/common';

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
  async changePassword(account: AuthUser, hash: string, expires: Date) {
    this.changed = { hash, expires };
    account.passwordHash = hash;
    account.passwordExpiresAt = expires;
    account.mustChangePassword = false;
  }
  async findResetUser() {
    return this.resetAvailable ? this.account : null;
  }
  async consumeReset(
    _username: string,
    _tokenHashValue: string,
    passwordHash: string,
    expiresAt: Date,
  ) {
    if (!this.resetAvailable) return null;
    this.resetAvailable = false;
    if (this.account) {
      this.account.passwordHash = passwordHash;
      this.account.passwordExpiresAt = expiresAt;
      this.account.mustChangePassword = false;
    }
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

class ResetFlowRepository {
  tokenHashValue: string | null = null;
  tokenExpiresAt: Date | null = null;
  tokenUsed = false;
  events: SecurityEvent[] = [];
  createdSession = false;

  constructor(public account: AuthUser) {}

  async findUserById(id: string) {
    return id === this.account.id ? this.account : null;
  }
  async findUserByUsername(username: string) {
    return username === this.account.username ? this.account : null;
  }
  async issueReset(
    _userId: string,
    tokenHashValue: string,
    _createdBy: string,
    expiresAt: Date,
  ) {
    this.tokenHashValue = tokenHashValue;
    this.tokenExpiresAt = expiresAt;
    this.tokenUsed = false;
    return 'isolated-reset-id';
  }
  async findResetUser(username: string, tokenHashValue: string) {
    return username.toLowerCase() === this.account.username.toLowerCase() &&
      tokenHashValue === this.tokenHashValue &&
      !this.tokenUsed &&
      Boolean(this.tokenExpiresAt && this.tokenExpiresAt > new Date())
      ? this.account
      : null;
  }
  async consumeReset(
    username: string,
    tokenHashValue: string,
    passwordHash: string,
    expiresAt: Date,
  ) {
    if (!(await this.findResetUser(username, tokenHashValue))) return null;
    this.tokenUsed = true;
    this.account = {
      ...this.account,
      passwordHash,
      passwordExpiresAt: expiresAt,
      mustChangePassword: false,
      authVersion: this.account.authVersion + 1,
    };
    return this.account.id;
  }
  async passwordHistory() {
    return [];
  }
  async event(value: SecurityEvent) {
    this.events.push(value);
  }
  async recordFailedLogin() {}
  async clearFailedLogins() {}
  async createSession() {
    this.createdSession = true;
    return 'isolated-new-user-session';
  }
  async consumeRecoveryCode() {
    return false;
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
  it('generates exactly ten unbiased numeric setup-token digits and preserves leading zeroes', () => {
    for (let index = 0; index < 100; index += 1)
      assert.match(randomNumericToken(), /^\d{10}$/);
    assert.equal(
      randomNumericToken(10, (size) => Buffer.alloc(size, 0)),
      '0000000000',
    );
  });
  it('accepts ten-digit setup tokens and unexpired legacy token formats at validation', async () => {
    const numeric = Object.assign(new ResetPasswordDto(), {
      username: 'monitor.one',
      token: '0123456789',
      newPassword: 'Harbor-Stone-84!',
    });
    const legacy = Object.assign(new ResetPasswordDto(), {
      username: 'monitor.one',
      token: randomToken(),
      newPassword: 'Harbor-Stone-84!',
    });

    assert.equal((await validate(numeric)).length, 0);
    assert.equal((await validate(legacy)).length, 0);
  });
});

describe('public login guard regression', () => {
  it('reaches login logic without a session while protected routes still require one', async () => {
    const login = mock.fn(async () => {
      throw new UnauthorizedException('Invalid credentials.');
    });
    const authenticate = mock.fn(async () => null);
    const auth = {
      login,
      authenticate,
      verifyCsrf: mock.fn(() => false),
    };
    const guardConfig = new ConfigService<Environment, true>({
      NODE_ENV: 'test',
      CORS_ORIGINS: ['http://localhost:3000'],
      SESSION_COOKIE_NAME: 'zenovel_session',
      SESSION_ABSOLUTE_HOURS: 8,
      BOOTSTRAP_TOKEN: 'isolated-bootstrap-token-with-32-characters',
      BUSINESS_TIME_ZONE: 'Asia/Kolkata',
    } as Environment);
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthRepository, useValue: {} },
        { provide: AuthService, useValue: auth },
        { provide: ConfigService, useValue: guardConfig },
        AuthorizationService,
        { provide: APP_GUARD, useClass: AuthenticationGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
    }).compile();
    const app = module.createNestApplication<NestExpressApplication>({
      logger: false,
      bodyParser: false,
    });
    setup(app, new SafeLogger());
    try {
      await app.init();
      const invalid = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send({ username: 'unknown.user', password: 'invalid-password' })
        .expect(401);
      assert.equal(invalid.body.code, 'AUTHENTICATION_REQUIRED');
      assert.equal(invalid.body.message, 'Authentication is required.');
      assert.equal(login.mock.callCount(), 1);
      assert.equal(authenticate.mock.callCount(), 0);

      const protectedResponse = await request(app.getHttpServer())
        .get('/api/v1/auth/session')
        .expect(401);
      assert.equal(protectedResponse.body.code, 'AUTHENTICATION_REQUIRED');
      assert.equal(login.mock.callCount(), 1);
      assert.equal(authenticate.mock.callCount(), 1);
    } finally {
      await app.close();
    }
  });
});

describe('first-administrator bootstrap token regression', () => {
  it('keeps bootstrap public while rejecting a mismatched token before account creation', async () => {
    const bootstrap = mock.fn(async () => {
      throw new Error('bootstrap must not be called by this test');
    });
    const repository = {
      userCount: mock.fn(async () => 0),
      bootstrap,
      event: mock.fn(async () => undefined),
    };
    const expectedToken = 'isolated-bootstrap-token-with-32-characters';
    const guardConfig = new ConfigService<Environment, true>({
      NODE_ENV: 'test',
      CORS_ORIGINS: ['http://localhost:3000'],
      SESSION_COOKIE_NAME: 'zenovel_session',
      SESSION_ABSOLUTE_HOURS: 8,
      SESSION_IDLE_MINUTES: 30,
      PASSWORD_EXPIRY_DAYS: 30,
      PASSWORD_HISTORY_COUNT: 5,
      LOGIN_MAX_FAILURES: 5,
      LOCKOUT_MINUTES: 15,
      RESET_TOKEN_MINUTES: 30,
      MFA_ENCRYPTION_KEY: key,
      BOOTSTRAP_TOKEN: expectedToken,
      BUSINESS_TIME_ZONE: 'Asia/Kolkata',
    } as Environment);
    const auth = new AuthService(
      repository as unknown as AuthRepository,
      guardConfig,
    );
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthRepository, useValue: repository },
        { provide: AuthService, useValue: auth },
        { provide: ConfigService, useValue: guardConfig },
        AuthorizationService,
        { provide: APP_GUARD, useClass: AuthenticationGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
    }).compile();
    const app = module.createNestApplication<NestExpressApplication>({
      logger: false,
      bodyParser: false,
    });
    setup(app, new SafeLogger());
    const body = {
      username: 'bootstrap.probe',
      fullName: 'Bootstrap Probe',
      password: '!!!!!!!!!!!!',
    };
    try {
      await app.init();
      const mismatched = await request(app.getHttpServer())
        .post('/api/v1/auth/bootstrap')
        .set(
          'X-Bootstrap-Token',
          'different-bootstrap-token-with-32-characters',
        )
        .send(body)
        .expect(401);
      assert.equal(mismatched.body.code, 'AUTHENTICATION_REQUIRED');
      assert.equal(bootstrap.mock.callCount(), 0);

      const matching = await request(app.getHttpServer())
        .post('/api/v1/auth/bootstrap')
        .set('X-Bootstrap-Token', expectedToken)
        .send(body)
        .expect(400);
      assert.equal(matching.body.code, 'INVALID_REQUEST');
      assert.equal(
        matching.body.message,
        'Password must contain letters and numbers.',
      );
      assert.equal(bootstrap.mock.callCount(), 0);
    } finally {
      await app.close();
    }
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
  it('rejects password change when the authenticated session is missing', async () => {
    const repository = {
      findSession: mock.fn(async () => null),
      touchSession: mock.fn(async () => undefined),
    };
    const guardConfig = new ConfigService<Environment, true>({
      NODE_ENV: 'test',
      CORS_ORIGINS: ['http://localhost:3000'],
      SESSION_COOKIE_NAME: 'zenovel_session',
      SESSION_ABSOLUTE_HOURS: 8,
      SESSION_IDLE_MINUTES: 30,
      PASSWORD_EXPIRY_DAYS: 30,
      PASSWORD_HISTORY_COUNT: 5,
      LOGIN_MAX_FAILURES: 5,
      LOCKOUT_MINUTES: 15,
      RESET_TOKEN_MINUTES: 30,
      MFA_ENCRYPTION_KEY: key,
      BOOTSTRAP_TOKEN: 'isolated-bootstrap-token-with-32-characters',
    } as Environment);
    const auth = new AuthService(
      repository as unknown as AuthRepository,
      guardConfig,
    );
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthRepository, useValue: repository },
        { provide: AuthService, useValue: auth },
        { provide: ConfigService, useValue: guardConfig },
        { provide: APP_GUARD, useClass: AuthenticationGuard },
      ],
    }).compile();
    const app = module.createNestApplication<NestExpressApplication>({
      logger: false,
      bodyParser: false,
    });
    setup(app, new SafeLogger());
    try {
      await app.init();
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/password')
        .set('Origin', 'http://localhost:3000')
        .send({
          currentPassword: 'not-disclosed',
          newPassword: 'Harbor-Stone-84!',
        })
        .expect(401);
      assert.equal(response.body.code, 'AUTHENTICATION_REQUIRED');
    } finally {
      await app.close();
    }
  });
  it('rejects the original session after administrator revocation', async () => {
    const cra = user({
      id: '00000000-0000-4000-8000-000000000011',
      username: 'revoked.monitor',
      roles: ['CRA_MONITOR'],
      permissions: ['View', 'Edit', 'Comment', 'Respond'],
      mfaRequired: true,
    });
    const administrator = user({
      id: '00000000-0000-4000-8000-000000000012',
      username: 'system.administrator',
      roles: ['SYSTEM_ADMINISTRATOR'],
      permissions: ['View', 'Administer', 'AuditReview'],
      mfaEnabled: true,
    });
    const originalCookie = 'isolated-original-cra-cookie';
    const freshCookie = 'isolated-fresh-cra-cookie';
    const administratorCookie = 'isolated-administrator-cookie';
    const administratorCsrf = 'isolated-administrator-csrf';
    type StoredSession = {
      session: AuthSession;
      revoked: boolean;
      revokedReason?: string;
    };
    const sessions = new Map<string, StoredSession>();
    const addSession = (
      rawCookie: string,
      id: string,
      account: AuthUser,
      csrfTokenHash: string,
    ) => {
      sessions.set(tokenHash(rawCookie), {
        session: {
          id,
          user: account,
          csrfTokenHash,
          absoluteExpiresAt: new Date(Date.now() + 3_600_000),
        },
        revoked: false,
      });
    };
    addSession(
      originalCookie,
      '00000000-0000-4000-8000-000000000021',
      cra,
      tokenHash('unused-cra-csrf'),
    );
    addSession(
      administratorCookie,
      '00000000-0000-4000-8000-000000000022',
      administrator,
      tokenHash(administratorCsrf),
    );
    const events: SecurityEvent[] = [];
    const statefulRepository = {
      findSession: mock.fn(async (hash: string) => {
        const stored = sessions.get(hash);
        return stored && !stored.revoked ? stored.session : null;
      }),
      touchSession: mock.fn(async () => undefined),
      rotateCsrf: mock.fn(async (id: string, hash: string) => {
        for (const stored of sessions.values())
          if (stored.session.id === id && !stored.revoked)
            stored.session.csrfTokenHash = hash;
      }),
      revokeUserSessions: mock.fn(async (userId: string, reason: string) => {
        for (const stored of sessions.values())
          if (stored.session.user.id === userId && !stored.revoked) {
            stored.revoked = true;
            stored.revokedReason = reason;
          }
      }),
      event: mock.fn(async (event: SecurityEvent) => {
        events.push(event);
      }),
    };
    const sessionConfig = new ConfigService<Environment, true>({
      NODE_ENV: 'test',
      CORS_ORIGINS: ['http://localhost:3000'],
      SESSION_COOKIE_NAME: 'zenovel_session',
      SESSION_ABSOLUTE_HOURS: 8,
      SESSION_IDLE_MINUTES: 30,
      PASSWORD_EXPIRY_DAYS: 30,
      PASSWORD_HISTORY_COUNT: 5,
      LOGIN_MAX_FAILURES: 5,
      LOCKOUT_MINUTES: 15,
      RESET_TOKEN_MINUTES: 30,
      MFA_ENCRYPTION_KEY: key,
      BOOTSTRAP_TOKEN: 'isolated-bootstrap-token-with-32-characters',
    } as Environment);
    const auth = new AuthService(
      statefulRepository as unknown as AuthRepository,
      sessionConfig,
    );
    const database = { query: mock.fn() };
    const module = await Test.createTestingModule({
      controllers: [AuthController, AdminController],
      providers: [
        {
          provide: AuthRepository,
          useValue: statefulRepository,
        },
        { provide: AuthService, useValue: auth },
        { provide: DatabaseService, useValue: database },
        { provide: ConfigService, useValue: sessionConfig },
        AdminService,
        AuthorizationService,
        { provide: APP_GUARD, useClass: AuthenticationGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
    }).compile();
    const app = module.createNestApplication<NestExpressApplication>({
      logger: false,
      bodyParser: false,
    });
    setup(app, new SafeLogger());

    try {
      await app.init();
      const beforeRevocation = await request(app.getHttpServer())
        .get('/api/v1/auth/session')
        .set('Cookie', `zenovel_session=${originalCookie}`)
        .expect(200);
      assert.equal(beforeRevocation.body.user.username, cra.username);
      assert.equal(beforeRevocation.body.user.mfaRequired, false);
      assert.equal(beforeRevocation.body.mfaEnrollmentRequired, false);

      await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${cra.id}/revoke-sessions`)
        .set('Cookie', `zenovel_session=${administratorCookie}`)
        .set('Origin', 'http://localhost:3000')
        .set('X-CSRF-Token', administratorCsrf)
        .send({ reason: 'Acceptance test session revocation.' })
        .expect(201);

      const original = sessions.get(tokenHash(originalCookie));
      assert.equal(original?.revoked, true);
      assert.equal(original?.revokedReason, 'administrator_revocation');
      assert.equal(events.at(-1)?.eventType, 'sessions_revoked');

      const afterRevocation = await request(app.getHttpServer())
        .get('/api/v1/auth/session')
        .set('Cookie', `zenovel_session=${originalCookie}`)
        .expect(401);
      assert.equal(afterRevocation.body.code, 'AUTHENTICATION_REQUIRED');
      assert.equal(afterRevocation.body.message, 'Authentication is required.');
      assert.equal('user' in afterRevocation.body, false);

      addSession(
        freshCookie,
        '00000000-0000-4000-8000-000000000023',
        cra,
        tokenHash('unused-fresh-cra-csrf'),
      );
      const freshSession = await request(app.getHttpServer())
        .get('/api/v1/auth/session')
        .set('Cookie', `zenovel_session=${freshCookie}`)
        .expect(200);
      assert.equal(freshSession.body.user.username, cra.username);
      assert.equal(database.query.mock.callCount(), 0);
    } finally {
      await app.close();
    }
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
  it('allows a standard user with legacy MFA state to use password-only login and password change', async () => {
    const repo = new FakeRepository();
    repo.account = user({
      passwordHash: await hashPassword('Cedar-River-42!'),
      mfaEnabled: true,
      mfaRequired: true,
      mfaSecretEncrypted: encryptSecret('JBSWY3DPEHPK3PXP', key),
    });
    const auth = service(repo);

    await auth.login({
      username: repo.account.username,
      password: 'Cedar-River-42!',
    });
    await auth.changePassword(
      repo.account,
      'Cedar-River-42!',
      'Harbor-Stone-84!',
    );
    await auth.login({
      username: repo.account.username,
      password: 'Harbor-Stone-84!',
    });

    assert.ok(repo.createdSession);
    assert.ok(repo.changed);
    assert.equal(repo.recoveryValid, false);
  });
  it('distinguishes current-password and MFA step-up failures during password change', async () => {
    const repo = new FakeRepository();
    const secret = 'JBSWY3DPEHPK3PXP';
    repo.account = user({
      passwordHash: await hashPassword('Cedar-River-42!'),
      mfaEnabled: true,
      mfaRequired: true,
      mfaSecretEncrypted: encryptSecret(secret, key),
      roles: ['SYSTEM_ADMINISTRATOR'],
      permissions: ['Administer'],
    });
    const auth = service(repo);
    await assert.rejects(
      () => auth.changePassword(repo.account!, 'wrong', 'Harbor-Stone-84!'),
      /Current password is incorrect/,
    );
    await assert.rejects(
      () =>
        auth.changePassword(
          repo.account!,
          'Cedar-River-42!',
          'Harbor-Stone-84!',
        ),
      /authenticator code or one-time recovery code/,
    );
    await assert.rejects(
      () =>
        auth.changePassword(
          repo.account!,
          'Cedar-River-42!',
          'Harbor-Stone-84!',
          '000000',
        ),
      /Authenticator code is invalid/,
    );
    await auth.changePassword(
      repo.account!,
      'Cedar-River-42!',
      'Harbor-Stone-84!',
      totp(secret),
    );
    assert.ok(repo.changed);
  });
  it('enforces reset-token single use without a redundant password-change gate', async () => {
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
      'monitor.one',
      'long-enough-single-use-reset-token',
      'Harbor-Stone-84!',
    );
    await assert.rejects(
      () =>
        auth.completeReset(
          'monitor.one',
          'long-enough-single-use-reset-token',
          'Ocean-Field-95!',
        ),
      /invalid, expired/,
    );
  });
  it('completes administrator-token onboarding through the HTTP endpoint with safe failures', async () => {
    const account = user({
      id: '00000000-0000-4000-8000-000000000091',
      username: 'new.monitor',
      passwordHash: await hashPassword('Initial-Harbor-73!'),
      mustChangePassword: true,
    });
    const repository = new ResetFlowRepository(account);
    const resetConfig = new ConfigService<Environment, true>({
      NODE_ENV: 'test',
      CORS_ORIGINS: ['http://localhost:3000'],
      SESSION_COOKIE_NAME: 'zenovel_session',
      SESSION_ABSOLUTE_HOURS: 8,
      SESSION_IDLE_MINUTES: 30,
      PASSWORD_EXPIRY_DAYS: 30,
      PASSWORD_HISTORY_COUNT: 5,
      LOGIN_MAX_FAILURES: 5,
      LOCKOUT_MINUTES: 15,
      RESET_TOKEN_MINUTES: 30,
      MFA_ENCRYPTION_KEY: key,
      BOOTSTRAP_TOKEN: 'isolated-bootstrap-token-with-32-characters',
    } as Environment);
    const auth = new AuthService(
      repository as unknown as AuthRepository,
      resetConfig,
    );
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthRepository, useValue: repository },
        { provide: AuthService, useValue: auth },
        { provide: ConfigService, useValue: resetConfig },
      ],
    }).compile();
    const app = module.createNestApplication<NestExpressApplication>({
      logger: false,
      bodyParser: false,
    });
    setup(app, new SafeLogger());

    try {
      await app.init();
      const issuedAt = Date.now();
      const issuedToken = await auth.issueReset(
        '00000000-0000-4000-8000-000000000092',
        account.id,
      );
      assert.equal(repository.tokenHashValue, tokenHash(issuedToken));
      assert.notEqual(repository.tokenHashValue, issuedToken);
      assert.match(issuedToken, /^\d{10}$/);
      assert.ok(repository.tokenExpiresAt);
      const expiryMinutes =
        (repository.tokenExpiresAt!.getTime() - issuedAt) / 60_000;
      assert.ok(expiryMinutes >= 29.99 && expiryMinutes <= 30.01);

      const completed = await request(app.getHttpServer())
        .post('/api/v1/auth/reset')
        .set('Origin', 'http://localhost:3000')
        .send({
          username: account.username,
          token: issuedToken,
          newPassword: 'Harbor-Stone-84!',
        })
        .expect(201);
      assert.deepEqual(completed.body, {
        success: true,
        loginRequired: true,
      });
      assert.equal(repository.tokenUsed, true);
      assert.equal(
        await verifyPassword(
          'Harbor-Stone-84!',
          repository.account.passwordHash,
        ),
        true,
      );

      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send({
          username: repository.account.username,
          password: 'Harbor-Stone-84!',
        })
        .expect(201);
      assert.equal(login.body.passwordExpired, false);
      assert.equal(repository.createdSession, true);

      const reused = await request(app.getHttpServer())
        .post('/api/v1/auth/reset')
        .set('Origin', 'http://localhost:3000')
        .send({
          username: account.username,
          token: issuedToken,
          newPassword: 'Ocean-Field-95!',
        })
        .expect(400);
      assert.equal(reused.body.code, 'INVALID_REQUEST');
      assert.equal(
        reused.body.message,
        'User ID or setup token is invalid, expired, or already used.',
      );
      assert.doesNotMatch(JSON.stringify(reused.body), new RegExp(issuedToken));

      const invalidToken = randomToken();
      const invalid = await request(app.getHttpServer())
        .post('/api/v1/auth/reset')
        .set('Origin', 'http://localhost:3000')
        .send({
          username: account.username,
          token: invalidToken,
          newPassword: 'Ocean-Field-95!',
        })
        .expect(400);
      assert.equal(
        invalid.body.message,
        'User ID or setup token is invalid, expired, or already used.',
      );
      assert.doesNotMatch(
        JSON.stringify(invalid.body),
        new RegExp(invalidToken),
      );

      const policyToken = await auth.issueReset(
        '00000000-0000-4000-8000-000000000092',
        account.id,
      );
      const policyFailure = await request(app.getHttpServer())
        .post('/api/v1/auth/reset')
        .set('Origin', 'http://localhost:3000')
        .send({
          username: account.username,
          token: policyToken,
          newPassword: 'OnlyLettersHere!',
        })
        .expect(400);
      assert.equal(
        policyFailure.body.message,
        'Password must contain letters and numbers.',
      );
      assert.equal(repository.tokenUsed, false);

      const mismatch = await request(app.getHttpServer())
        .post('/api/v1/auth/reset')
        .set('Origin', 'http://localhost:3000')
        .send({
          username: 'unrelated.user',
          token: policyToken,
          newPassword: 'Ocean-Field-95!',
        })
        .expect(400);
      assert.equal(
        mismatch.body.message,
        'User ID or setup token is invalid, expired, or already used.',
      );
      assert.equal(repository.tokenUsed, false);

      const expiredToken = await auth.issueReset(
        '00000000-0000-4000-8000-000000000092',
        account.id,
      );
      repository.tokenExpiresAt = new Date(Date.now() - 1);
      const expired = await request(app.getHttpServer())
        .post('/api/v1/auth/reset')
        .set('Origin', 'http://localhost:3000')
        .send({
          username: account.username,
          token: expiredToken,
          newPassword: 'Ocean-Field-95!',
        })
        .expect(400);
      assert.equal(
        expired.body.message,
        'User ID or setup token is invalid, expired, or already used.',
      );

      const malformed = await request(app.getHttpServer())
        .post('/api/v1/auth/reset')
        .set('Origin', 'http://localhost:3000')
        .send({
          username: account.username,
          token: 'short',
          newPassword: 'short',
        })
        .expect(400);
      assert.equal(malformed.body.code, 'INVALID_REQUEST');
      assert.match(
        malformed.body.message,
        /Setup token must contain exactly 10 digits|New password must be at least 12 characters/,
      );
      assert.doesNotMatch(
        JSON.stringify(malformed.body),
        /short|stack|passwordHash/,
      );
    } finally {
      await app.close();
    }
  });
  it('temporarily throttles failed setup-token guesses by User ID and source IP', async () => {
    const repository = new ResetFlowRepository(
      user({
        username: 'rate.limited',
        passwordHash: await hashPassword('Initial-Harbor-73!'),
      }),
    );
    const auth = new AuthService(
      repository as unknown as AuthRepository,
      config,
    );
    for (let attempt = 0; attempt < 5; attempt += 1)
      await assert.rejects(
        () =>
          auth.completeReset(
            'rate.limited',
            '0000000000',
            'Harbor-Stone-84!',
            '192.0.2.20',
          ),
        /invalid, expired, or already used/,
      );

    await assert.rejects(
      () =>
        auth.completeReset(
          'rate.limited',
          '0000000000',
          'Harbor-Stone-84!',
          '192.0.2.20',
        ),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'getStatus' in error &&
        typeof error.getStatus === 'function' &&
        error.getStatus() === 429,
    );
    await assert.rejects(
      () =>
        auth.completeReset(
          'rate.limited',
          '0000000000',
          'Harbor-Stone-84!',
          '192.0.2.21',
        ),
      /invalid, expired, or already used/,
    );
  });
  it('requires System Administrator MFA and accepts its recovery code once', async () => {
    const repo = new FakeRepository();
    repo.recoveryValid = true;
    repo.account = user({
      passwordHash: await hashPassword('Cedar-River-42!'),
      mfaEnabled: true,
      mfaRequired: true,
      mfaSecretEncrypted: encryptSecret('JBSWY3DPEHPK3PXP', key),
      roles: ['SYSTEM_ADMINISTRATOR'],
      permissions: ['Administer'],
    });
    const auth = service(repo);
    await assert.rejects(
      () =>
        auth.login({
          username: 'monitor.one',
          password: 'Cedar-River-42!',
        }),
      /System Administrator authenticator code or one-time recovery code/,
    );
    await auth.login({
      username: 'monitor.one',
      password: 'Cedar-River-42!',
      mfaCode: 'ABCD-EFGH',
    });
    assert.equal(repo.recoveryValid, false);
    await assert.rejects(
      () =>
        auth.login({
          username: 'monitor.one',
          password: 'Cedar-River-42!',
          mfaCode: 'ABCD-EFGH',
        }),
      /MFA verification failed/,
    );
  });
  it('denies MFA enrollment and recovery workflows to ordinary users', async () => {
    const repo = new FakeRepository();
    repo.account = user({
      passwordHash: await hashPassword('Cedar-River-42!'),
      mfaEnabled: true,
      mfaSecretEncrypted: encryptSecret('JBSWY3DPEHPK3PXP', key),
    });
    const auth = service(repo);

    await assert.rejects(
      () => auth.beginMfa(repo.account!, 'Cedar-River-42!'),
      /only to the System Administrator/,
    );
    await assert.rejects(
      () => auth.confirmMfa(repo.account!.id, totp('JBSWY3DPEHPK3PXP')),
      /only to the System Administrator/,
    );
    await assert.rejects(
      () =>
        auth.disableMfa(
          repo.account!,
          'Cedar-River-42!',
          undefined,
          'ABCD-EFGH',
          'Attempt ordinary MFA change.',
        ),
      /only to the System Administrator/,
    );
    assert.equal(repo.mfaDisabled, false);
  });
});

describe('user role administration', () => {
  it('requires one or more unique role identifiers for a role update', async () => {
    const empty = Object.assign(new UpdateUserDto(), { roleIds: [] });
    const duplicate = Object.assign(new UpdateUserDto(), {
      roleIds: [
        '00000000-0000-4000-8000-000000000041',
        '00000000-0000-4000-8000-000000000041',
      ],
    });

    assert.ok((await validate(empty)).length > 0);
    assert.ok((await validate(duplicate)).length > 0);
    const whitespaceReason = Object.assign(new UpdateUserDto(), {
      roleIds: ['00000000-0000-4000-8000-000000000041'],
      reason: '   ',
    });
    assert.ok((await validate(whitespaceReason)).length > 0);
  });

  it('changes assigned roles, revokes sessions, records before and after roles, and returns the updated user', async () => {
    const actorId = '00000000-0000-4000-8000-000000000031';
    const userId = '00000000-0000-4000-8000-000000000032';
    const projectManagerRoleId = '00000000-0000-4000-8000-000000000041';
    const qmsRoleId = '00000000-0000-4000-8000-000000000042';
    const roles = new Map([
      [projectManagerRoleId, 'PROJECT_MANAGER'],
      [qmsRoleId, 'QMS'],
    ]);
    let assignedRoles = ['CRA_MONITOR'];
    let sessionsRevoked = false;
    const client = {
      query: mock.fn(async (sql: string, values: unknown[] = []) => {
        if (sql.includes('UPDATE zenovel.users SET'))
          return { rows: [], rowCount: 1 };
        if (sql.includes('SELECT id,code FROM zenovel.roles')) {
          const requested = values[0] as string[];
          return {
            rows: requested
              .filter((id) => roles.has(id))
              .map((id) => ({ id, code: roles.get(id)! })),
            rowCount: requested.filter((id) => roles.has(id)).length,
          };
        }
        if (sql.includes('DELETE FROM zenovel.user_roles')) {
          assignedRoles = [];
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO zenovel.user_roles')) {
          assignedRoles.push(roles.get(values[1] as string)!);
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('UPDATE zenovel.sessions SET')) {
          sessionsRevoked = true;
          return { rows: [], rowCount: 1 };
        }
        throw new Error(`Unexpected transaction query: ${sql}`);
      }),
    };
    const database = {
      transaction: mock.fn(
        async (work: (transactionClient: typeof client) => Promise<void>) =>
          work(client),
      ),
      query: mock.fn(async (sql: string) => {
        if (!sql.includes('FROM zenovel.users'))
          throw new Error(`Unexpected database query: ${sql}`);
        return {
          rows: [
            {
              id: userId,
              username: 'monitor.one',
              fullName: 'Monitor One',
              email: null,
              status: 'active',
              departmentId: null,
              department: null,
              mustChangePassword: false,
              passwordExpiresAt: new Date(Date.now() + 86_400_000),
              mfaEnabled: false,
              roles: [...assignedRoles].sort(),
            },
          ],
          rowCount: 1,
        };
      }),
    };
    const events: SecurityEvent[] = [];
    const repository = {
      findUserById: mock.fn(async () =>
        user({ id: userId, roles: ['CRA_MONITOR'] }),
      ),
      event: mock.fn(async (event: SecurityEvent) => {
        events.push(event);
      }),
    };
    const admin = new AdminService(
      database as unknown as DatabaseService,
      repository as unknown as AuthRepository,
      {} as AuthService,
    );

    await admin.updateUser(
      actorId,
      userId,
      {
        roleIds: [projectManagerRoleId, qmsRoleId],
        reason: 'Project responsibilities changed.',
      },
      'role-change-request',
    );
    const updatedUsers = await admin.users();

    assert.ok(updatedUsers[0]);
    assert.deepEqual(updatedUsers[0].roles, ['PROJECT_MANAGER', 'QMS']);
    assert.equal(sessionsRevoked, true);
    assert.equal(events.at(-1)?.eventType, 'user_roles_changed');
    assert.equal(events.at(-1)?.actorUserId, actorId);
    assert.equal(events.at(-1)?.subjectUserId, userId);
    assert.deepEqual(events.at(-1)?.context, {
      beforeRoles: 'CRA_MONITOR',
      afterRoles: 'PROJECT_MANAGER,QMS',
    });
  });

  it('rejects unavailable role identifiers before replacing assignments', async () => {
    const deleteAssignments = mock.fn();
    const client = {
      query: mock.fn(async (sql: string) => {
        if (sql.includes('UPDATE zenovel.users SET'))
          return { rows: [], rowCount: 1 };
        if (sql.includes('SELECT id,code FROM zenovel.roles'))
          return { rows: [], rowCount: 0 };
        if (sql.includes('DELETE FROM zenovel.user_roles')) {
          deleteAssignments();
          return { rows: [], rowCount: 1 };
        }
        throw new Error(`Unexpected transaction query: ${sql}`);
      }),
    };
    const database = {
      transaction: async (
        work: (transactionClient: typeof client) => Promise<void>,
      ) => work(client),
    };
    const repository = {
      findUserById: async () => user(),
    };
    const admin = new AdminService(
      database as unknown as DatabaseService,
      repository as unknown as AuthRepository,
      {} as AuthService,
    );

    await assert.rejects(
      () =>
        admin.updateUser(user().id, '00000000-0000-4000-8000-000000000032', {
          roleIds: ['00000000-0000-4000-8000-000000000099'],
          reason: 'Attempt assignment validation.',
        }),
      /One or more roles are unavailable/,
    );
    assert.equal(deleteAssignments.mock.callCount(), 0);
  });
});

describe('role-management safeguards', () => {
  it('prevents custom administrator roles and refuses retirement with user dependencies', async () => {
    const actorId = '00000000-0000-4000-8000-000000000081';
    const repository = {
      findUserById: mock.fn(async () =>
        user({ id: actorId, roles: ['QMS'], permissions: ['AuditReview'] }),
      ),
    };
    const database = {
      transaction: mock.fn(),
      query: mock.fn(async (sql: string) => {
        if (sql.includes('count(ur.user_id)'))
          return {
            rows: [
              { code: 'CUSTOM_ROLE', systemRole: false, assignments: '1' },
            ],
            rowCount: 1,
          };
        throw new Error(`Unexpected query: ${sql}`);
      }),
    };
    const admin = new AdminService(
      database as unknown as DatabaseService,
      repository as unknown as AuthRepository,
      {} as AuthService,
    );
    await assert.rejects(
      () =>
        admin.createRole(actorId, {
          code: 'CUSTOM_ADMIN',
          name: 'Custom administrator',
          permissions: ['Administer'],
          reason: 'Attempt critical grant.',
        }),
      /Administrator access is restricted/,
    );
    await assert.rejects(
      () =>
        admin.createRole(actorId, {
          code: 'CUSTOM_MFA',
          name: 'Custom MFA role',
          mfaRequired: true,
          permissions: ['View'],
          reason: 'Attempt role-level MFA requirement.',
        }),
      /only for the protected System Administrator role/,
    );
    assert.equal(database.transaction.mock.callCount(), 0);
    await assert.rejects(
      () =>
        admin.retireRole(
          actorId,
          '00000000-0000-4000-8000-000000000082',
          'Role is no longer required.',
        ),
      /Remove this role from all users/,
    );
  });
});

describe('Stage 2 interface refinements', () => {
  it('shows role editing and Audit Trail without rendering permission details', async () => {
    const source = await readFile(
      new URL('../../../web/components/auth-portal.tsx', import.meta.url),
      'utf8',
    );

    assert.match(source, /Edit roles/);
    assert.match(source, /Audit Trail/);
    assert.match(
      source,
      /headings=\{\['Time Stamp', 'User', 'Change', 'Reason for Change'\]\}/,
    );
    assert.match(source, /Authenticator code/);
    assert.match(source, /One-time recovery code/);
    assert.match(source, /mode === 'login' && administratorMfaRequested &&/);
    assert.match(source, /systemAdministrator && session\.user\.mfaEnabled/);
    assert.doesNotMatch(source, /mode === 'login' && \(\s*<>\s*<Field/);
    assert.match(source, /Confirm new password/);
    assert.match(source, /token: token\.trim\(\)/);
    assert.match(source, /Password set successfully/);
    assert.match(source, /Apply filters/);
    assert.match(source, /Clear filters/);
    assert.doesNotMatch(source, /Security events/);
    assert.doesNotMatch(source, /Permission mapping/);
    assert.doesNotMatch(source, /permissions\.join/);
  });
});

describe('authorization invariants', () => {
  const authorization = new AuthorizationService();
  it('denies an authenticated CRA/Monitor access to the administrator user list', async () => {
    const cra = user({
      roles: ['CRA_MONITOR'],
      permissions: ['View', 'Edit', 'Comment', 'Respond'],
    });
    assert.equal(cra.roles.includes('CRA_MONITOR'), true);
    assert.equal(cra.permissions.includes('Administer'), false);

    const session: AuthSession = {
      id: '00000000-0000-4000-8000-000000000002',
      user: cra,
      csrfTokenHash: 'unused-for-read-only-request',
      absoluteExpiresAt: new Date(Date.now() + 3_600_000),
    };
    const sessionRepository = {
      findSession: mock.fn(async () => session),
      touchSession: mock.fn(async () => undefined),
    };
    const auth = new AuthService(
      sessionRepository as unknown as AuthRepository,
      config,
    );
    const users = mock.fn(async () => []);
    const guardConfig = new ConfigService<Environment, true>({
      CORS_ORIGINS: ['http://localhost:3000'],
      SESSION_COOKIE_NAME: 'zenovel_session',
    } as Environment);
    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: { users } },
        { provide: AuthService, useValue: auth },
        { provide: ConfigService, useValue: guardConfig },
        AuthorizationService,
        { provide: APP_GUARD, useClass: AuthenticationGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
    }).compile();
    const app = module.createNestApplication<NestExpressApplication>({
      logger: false,
      bodyParser: false,
    });
    setup(app, new SafeLogger());

    try {
      await app.init();
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/users')
        .set('Cookie', 'zenovel_session=isolated-cra-session')
        .expect(403);

      assert.equal(response.body.code, 'ACCESS_DENIED');
      assert.equal(response.body.message, 'Access is denied.');
      assert.equal(sessionRepository.findSession.mock.callCount(), 1);
      assert.equal(users.mock.callCount(), 0);
    } finally {
      await app.close();
    }
  });
  it('denies an authenticated CRA/Monitor a direct user-role update', async () => {
    const craCsrf = 'isolated-cra-role-edit-csrf';
    const cra: AuthUser = user({
      roles: ['CRA_MONITOR'],
      permissions: ['View', 'Edit', 'Comment', 'Respond'],
    });
    const session: AuthSession = {
      id: '00000000-0000-4000-8000-000000000003',
      user: cra,
      csrfTokenHash: tokenHash(craCsrf),
      absoluteExpiresAt: new Date(Date.now() + 3_600_000),
    };
    const sessionRepository = {
      findSession: mock.fn(async () => session),
      touchSession: mock.fn(async () => undefined),
    };
    const auth = new AuthService(
      sessionRepository as unknown as AuthRepository,
      config,
    );
    const updateUser = mock.fn(async () => ({ success: true }));
    const guardConfig = new ConfigService<Environment, true>({
      CORS_ORIGINS: ['http://localhost:3000'],
      SESSION_COOKIE_NAME: 'zenovel_session',
    } as Environment);
    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: { updateUser } },
        { provide: AuthService, useValue: auth },
        { provide: ConfigService, useValue: guardConfig },
        AuthorizationService,
        { provide: APP_GUARD, useClass: AuthenticationGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
    }).compile();
    const app = module.createNestApplication<NestExpressApplication>({
      logger: false,
      bodyParser: false,
    });
    setup(app, new SafeLogger());

    try {
      await app.init();
      const response = await request(app.getHttpServer())
        .patch('/api/v1/admin/users/00000000-0000-4000-8000-000000000032')
        .set('Cookie', 'zenovel_session=isolated-cra-role-edit-session')
        .set('Origin', 'http://localhost:3000')
        .set('X-CSRF-Token', craCsrf)
        .send({ roleIds: ['00000000-0000-4000-8000-000000000041'] })
        .expect(403);

      assert.equal(response.body.code, 'ACCESS_DENIED');
      assert.equal(response.body.message, 'Access is denied.');
      assert.equal(updateUser.mock.callCount(), 0);
    } finally {
      await app.close();
    }
  });
  it('allows QMS role configuration while denying other business roles', async () => {
    const csrf = 'isolated-role-manager-csrf';
    const qmsCookie = 'isolated-qms-role-manager';
    const craCookie = 'isolated-cra-role-manager';
    const sessions = new Map([
      [
        tokenHash(qmsCookie),
        {
          id: '00000000-0000-4000-8000-000000000071',
          user: user({ roles: ['QMS'], permissions: ['View', 'AuditReview'] }),
          csrfTokenHash: tokenHash(csrf),
          absoluteExpiresAt: new Date(Date.now() + 3_600_000),
        } as AuthSession,
      ],
      [
        tokenHash(craCookie),
        {
          id: '00000000-0000-4000-8000-000000000072',
          user: user({ roles: ['CRA_MONITOR'], permissions: ['View', 'Edit'] }),
          csrfTokenHash: tokenHash(csrf),
          absoluteExpiresAt: new Date(Date.now() + 3_600_000),
        } as AuthSession,
      ],
    ]);
    const repository = {
      findSession: mock.fn(async (hash: string) => sessions.get(hash) ?? null),
      touchSession: mock.fn(async () => undefined),
    };
    const auth = new AuthService(
      repository as unknown as AuthRepository,
      config,
    );
    const createRole = mock.fn(async () => ({ id: 'role-id' }));
    const guardConfig = new ConfigService<Environment, true>({
      CORS_ORIGINS: ['http://localhost:3000'],
      SESSION_COOKIE_NAME: 'zenovel_session',
    } as Environment);
    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: { createRole } },
        { provide: AuthService, useValue: auth },
        { provide: ConfigService, useValue: guardConfig },
        AuthorizationService,
        { provide: APP_GUARD, useClass: AuthenticationGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
    }).compile();
    const app = module.createNestApplication<NestExpressApplication>({
      logger: false,
      bodyParser: false,
    });
    setup(app, new SafeLogger());
    const body = {
      code: 'CUSTOM_REVIEWER',
      name: 'Custom Reviewer',
      permissions: ['View'],
      reason: 'Approved quality role configuration.',
    };
    try {
      await app.init();
      await request(app.getHttpServer())
        .post('/api/v1/admin/roles')
        .set('Cookie', `zenovel_session=${qmsCookie}`)
        .set('Origin', 'http://localhost:3000')
        .set('X-CSRF-Token', csrf)
        .send(body)
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/admin/roles')
        .set('Cookie', `zenovel_session=${craCookie}`)
        .set('Origin', 'http://localhost:3000')
        .set('X-CSRF-Token', csrf)
        .send(body)
        .expect(403);
      assert.equal(createRole.mock.callCount(), 1);
    } finally {
      await app.close();
    }
  });
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
      reason: 'Approved regression verification.',
      context: {
        password: 'hidden',
        resetToken: 'hidden',
        safeCode: 'allowed',
      },
    });
    const context = JSON.parse(String(values[7]));
    assert.equal(values[6], 'Approved regression verification.');
    assert.deepEqual(context, { safeCode: 'allowed' });
    assert.doesNotMatch(JSON.stringify(values), /hidden/);
  });
  it('filters the complete audit query by date, user and reason', async () => {
    let queryValues: unknown[] = [];
    const database = {
      query: mock.fn(async (_sql: string, values: unknown[]) => {
        queryValues = values;
        return { rows: [{ id: 'event-id' }], rowCount: 1 };
      }),
    };
    const admin = new AdminService(
      database as unknown as DatabaseService,
      {} as AuthRepository,
      {} as AuthService,
    );
    const events = await admin.events({
      from: '2026-10-01',
      to: '2026-10-14',
      user: 'quality.user',
      reason: 'approved change',
    });
    assert.equal(events.length, 1);
    assert.deepEqual(queryValues, [
      '2026-10-01',
      '2026-10-14',
      'quality.user',
      'approved change',
    ]);
  });
});
