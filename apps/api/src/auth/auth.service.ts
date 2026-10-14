import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { Environment } from '../config/environment.js';
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  hashPassword,
  passwordPolicyErrors,
  randomToken,
  tokenHash,
  verifyPassword,
  verifyTotp,
} from '../security/security.crypto.js';
import { AuthRepository } from './auth.repository.js';
import type { AuthSession, AuthUser } from './auth.types.js';

export type LoginResult = {
  sessionToken: string;
  csrfToken: string;
  session: AuthSession;
};

@Injectable()
export class AuthService {
  private readonly dummyPasswordHash = hashPassword(randomToken(32));
  private readonly expiryDays: number;
  private readonly historyCount: number;
  private readonly idleMinutes: number;
  private readonly absoluteHours: number;
  private readonly maxFailures: number;
  private readonly lockoutMinutes: number;
  private readonly resetMinutes: number;
  private readonly encryptionKey: string;
  constructor(
    private readonly repository: AuthRepository,
    config: ConfigService<Environment, true>,
  ) {
    this.expiryDays = config.get('PASSWORD_EXPIRY_DAYS', { infer: true });
    this.historyCount = config.get('PASSWORD_HISTORY_COUNT', { infer: true });
    this.idleMinutes = config.get('SESSION_IDLE_MINUTES', { infer: true });
    this.absoluteHours = config.get('SESSION_ABSOLUTE_HOURS', { infer: true });
    this.maxFailures = config.get('LOGIN_MAX_FAILURES', { infer: true });
    this.lockoutMinutes = config.get('LOCKOUT_MINUTES', { infer: true });
    this.resetMinutes = config.get('RESET_TOKEN_MINUTES', { infer: true });
    this.encryptionKey = config.get('MFA_ENCRYPTION_KEY', { infer: true });
  }
  private passwordExpiry(now = new Date()): Date {
    return new Date(now.getTime() + this.expiryDays * 86_400_000);
  }
  private async assertNewPassword(
    user: Pick<AuthUser, 'id' | 'username' | 'passwordHash'>,
    password: string,
  ) {
    const errors = passwordPolicyErrors(password, user.username);
    if (errors.length) throw new BadRequestException(errors[0]);
    const history = [
      user.passwordHash,
      ...(await this.repository.passwordHistory(user.id, this.historyCount)),
    ].slice(0, this.historyCount);
    for (const previous of history)
      if (await verifyPassword(password, previous))
        throw new BadRequestException('A recent password cannot be reused.');
  }
  private genericFailure(): never {
    throw new UnauthorizedException('Invalid credentials.');
  }

  async login(input: {
    username: string;
    password: string;
    mfaCode?: string;
    ip?: string;
    userAgent?: string;
    requestId?: string;
  }): Promise<LoginResult> {
    const user = await this.repository.findUserByUsername(input.username);
    const validPassword = await verifyPassword(
      input.password,
      user?.passwordHash ?? (await this.dummyPasswordHash),
    );
    const locked = Boolean(
      user?.lockedUntil && user.lockedUntil.getTime() > Date.now(),
    );
    if (!user || user.status !== 'active' || !validPassword || locked) {
      const shouldLock = Boolean(
        user && !locked && user.failedLoginAttempts + 1 >= this.maxFailures,
      );
      await this.repository.recordFailedLogin(
        user,
        shouldLock ? new Date(Date.now() + this.lockoutMinutes * 60_000) : null,
      );
      await this.repository.event({
        subjectUserId: user?.id,
        eventType: shouldLock ? 'account_lockout' : 'login_failure',
        outcome: 'failure',
        requestId: input.requestId,
        context: { identityHash: tokenHash(input.username.toLowerCase()) },
      });
      return this.genericFailure();
    }
    if (user.mfaEnabled) {
      if (!user.mfaSecretEncrypted || !input.mfaCode) {
        await this.repository.event({
          subjectUserId: user.id,
          eventType: 'mfa_verification',
          outcome: 'failure',
          requestId: input.requestId,
        });
        return this.genericFailure();
      }
      const secret = decryptSecret(user.mfaSecretEncrypted, this.encryptionKey);
      const validTotp = verifyTotp(secret, input.mfaCode);
      const validRecovery = validTotp
        ? false
        : await this.repository.consumeRecoveryCode(
            user.id,
            tokenHash(input.mfaCode.toUpperCase()),
          );
      if (!validTotp && !validRecovery) {
        await this.repository.event({
          subjectUserId: user.id,
          eventType: 'mfa_verification',
          outcome: 'failure',
          requestId: input.requestId,
        });
        return this.genericFailure();
      }
      await this.repository.event({
        actorUserId: user.id,
        subjectUserId: user.id,
        eventType: 'mfa_verification',
        outcome: 'success',
        requestId: input.requestId,
      });
    }
    await this.repository.clearFailedLogins(user.id);
    const sessionToken = randomToken();
    const csrfToken = randomToken();
    const now = Date.now();
    const id = await this.repository.createSession({
      user,
      tokenHash: tokenHash(sessionToken),
      csrfTokenHash: tokenHash(csrfToken),
      idleExpiresAt: new Date(now + this.idleMinutes * 60_000),
      absoluteExpiresAt: new Date(now + this.absoluteHours * 3_600_000),
      ipHash: input.ip ? tokenHash(input.ip) : undefined,
      userAgentHash: input.userAgent ? tokenHash(input.userAgent) : undefined,
    });
    await this.repository.event({
      actorUserId: user.id,
      subjectUserId: user.id,
      eventType: 'login_success',
      outcome: 'success',
      requestId: input.requestId,
    });
    return {
      sessionToken,
      csrfToken,
      session: {
        id,
        user,
        csrfTokenHash: tokenHash(csrfToken),
        absoluteExpiresAt: new Date(now + this.absoluteHours * 3_600_000),
      },
    };
  }

  async authenticate(rawToken: string): Promise<AuthSession | null> {
    if (!rawToken) return null;
    const session = await this.repository.findSession(tokenHash(rawToken));
    if (session)
      await this.repository.touchSession(
        session.id,
        new Date(Date.now() + this.idleMinutes * 60_000),
      );
    return session;
  }
  verifyCsrf(session: AuthSession, value: string): boolean {
    const expected = Buffer.from(session.csrfTokenHash);
    const actual = Buffer.from(tokenHash(value));
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }
  async rotateCsrf(session: AuthSession): Promise<string> {
    const csrf = randomToken();
    await this.repository.rotateCsrf(session.id, tokenHash(csrf));
    return csrf;
  }
  async logout(session: AuthSession, requestId?: string): Promise<void> {
    await this.repository.revokeSession(session.id, 'logout');
    await this.repository.event({
      actorUserId: session.user.id,
      subjectUserId: session.user.id,
      eventType: 'logout',
      outcome: 'success',
      requestId,
    });
  }
  async changePassword(
    user: AuthUser,
    current: string,
    next: string,
    requestId?: string,
  ): Promise<void> {
    if (!(await verifyPassword(current, user.passwordHash)))
      throw new UnauthorizedException();
    await this.assertNewPassword(user, next);
    await this.repository.changePassword(
      user,
      await hashPassword(next),
      this.passwordExpiry(),
    );
    await this.repository.event({
      actorUserId: user.id,
      subjectUserId: user.id,
      eventType: 'password_change',
      outcome: 'success',
      requestId,
    });
  }
  async requestRecovery(username: string, requestId?: string): Promise<void> {
    const user = await this.repository.findUserByUsername(username);
    await this.repository.event({
      subjectUserId: user?.id,
      eventType: 'password_recovery_requested',
      outcome: 'success',
      requestId,
      context: { identityHash: tokenHash(username.toLowerCase()) },
    });
  }
  async issueReset(
    actorId: string,
    userId: string,
    requestId?: string,
  ): Promise<string> {
    const user = await this.repository.findUserById(userId);
    if (!user) throw new BadRequestException();
    const token = randomToken();
    await this.repository.issueReset(
      userId,
      tokenHash(token),
      actorId,
      new Date(Date.now() + this.resetMinutes * 60_000),
    );
    await this.repository.event({
      actorUserId: actorId,
      subjectUserId: userId,
      eventType: 'password_reset_issued',
      outcome: 'success',
      requestId,
    });
    return token;
  }
  async completeReset(
    token: string,
    password: string,
    requestId?: string,
  ): Promise<void> {
    if (!token) throw new BadRequestException();
    const resetHash = tokenHash(token);
    const user = await this.repository.findResetUser(resetHash);
    if (!user)
      throw new BadRequestException('Reset token is invalid or expired.');
    await this.assertNewPassword(user, password);
    const userId = await this.repository.consumeReset(
      resetHash,
      await hashPassword(password),
      this.passwordExpiry(),
    );
    if (!userId)
      throw new BadRequestException('Reset token is invalid or expired.');
    await this.repository.event({
      subjectUserId: userId,
      eventType: 'password_reset_completed',
      outcome: 'success',
      requestId,
    });
  }
  async beginMfa(
    user: AuthUser,
    password: string,
    requestId?: string,
  ): Promise<{ secret: string; uri: string }> {
    if (!(await verifyPassword(password, user.passwordHash)))
      throw new UnauthorizedException();
    const secret = generateTotpSecret();
    await this.repository.setMfaSecret(
      user.id,
      encryptSecret(secret, this.encryptionKey),
    );
    await this.repository.event({
      actorUserId: user.id,
      subjectUserId: user.id,
      eventType: 'mfa_enrollment_started',
      outcome: 'success',
      requestId,
    });
    return {
      secret,
      uri: `otpauth://totp/ZENOVEL:${encodeURIComponent(user.username)}?secret=${secret}&issuer=ZENOVEL&algorithm=SHA1&digits=6&period=30`,
    };
  }
  async confirmMfa(
    userId: string,
    code: string,
    requestId?: string,
  ): Promise<string[]> {
    const user = await this.repository.findUserById(userId);
    if (
      !user?.mfaSecretEncrypted ||
      !verifyTotp(
        decryptSecret(user.mfaSecretEncrypted, this.encryptionKey),
        code,
      )
    )
      throw new BadRequestException('Verification code is invalid.');
    const codes = Array.from({ length: 8 }, () =>
      `${randomToken(12).slice(0, 6)}-${randomToken(12).slice(0, 6)}`.toUpperCase(),
    );
    await this.repository.enableMfa(
      user.id,
      codes.map((value) => tokenHash(value)),
    );
    await this.repository.event({
      actorUserId: user.id,
      subjectUserId: user.id,
      eventType: 'mfa_enabled',
      outcome: 'success',
      requestId,
    });
    return codes;
  }
  async disableMfa(
    user: AuthUser,
    password: string,
    code: string,
    requestId?: string,
  ): Promise<void> {
    if (user.mfaRequired)
      throw new BadRequestException('MFA is required by an assigned role.');
    if (
      !user.mfaEnabled ||
      !user.mfaSecretEncrypted ||
      !(await verifyPassword(password, user.passwordHash))
    )
      throw new UnauthorizedException();
    const validTotp = verifyTotp(
      decryptSecret(user.mfaSecretEncrypted, this.encryptionKey),
      code,
    );
    const validRecovery = validTotp
      ? false
      : await this.repository.consumeRecoveryCode(
          user.id,
          tokenHash(code.toUpperCase()),
        );
    if (!validTotp && !validRecovery) throw new UnauthorizedException();
    await this.repository.disableMfa(user.id);
    await this.repository.event({
      actorUserId: user.id,
      subjectUserId: user.id,
      eventType: 'mfa_disabled',
      outcome: 'success',
      requestId,
    });
  }
  async bootstrap(input: {
    token: string;
    expectedToken: string;
    username: string;
    fullName: string;
    password: string;
    requestId?: string;
  }): Promise<void> {
    const supplied = Buffer.from(input.token);
    const expected = Buffer.from(input.expectedToken);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      throw new UnauthorizedException();
    const errors = passwordPolicyErrors(input.password, input.username);
    if (errors.length) throw new BadRequestException(errors[0]);
    const id = await this.repository.bootstrap({
      username: input.username,
      fullName: input.fullName,
      passwordHash: await hashPassword(input.password),
      expiresAt: this.passwordExpiry(),
    });
    if (!id) throw new ConflictException('Bootstrap is already closed.');
    await this.repository.event({
      actorUserId: id,
      subjectUserId: id,
      eventType: 'bootstrap_administrator_created',
      outcome: 'success',
      requestId: input.requestId,
      context: { bootstrapId: randomUUID() },
    });
  }
}
