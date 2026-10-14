import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import type { AuthSession, AuthUser, SecurityEvent } from './auth.types.js';

type UserRow = {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  department_id: string | null;
  status: 'active' | 'inactive';
  password_hash: string;
  password_expires_at: Date;
  must_change_password: boolean;
  failed_login_attempts: number;
  locked_until: Date | null;
  mfa_secret_encrypted: string | null;
  mfa_enabled: boolean;
  auth_version: number;
};

@Injectable()
export class AuthRepository {
  constructor(private readonly db: DatabaseService) {}

  private async permissions(
    userId: string,
  ): Promise<{ roles: string[]; permissions: string[]; mfaRequired: boolean }> {
    const result = await this.db.query<{
      role: string;
      permission: string | null;
      mfa_required: boolean;
    }>(
      `
      SELECT r.code AS role, p.code AS permission, r.mfa_required
      FROM zenovel.user_roles ur
      JOIN zenovel.roles r ON r.id = ur.role_id AND r.active = true
      LEFT JOIN zenovel.role_permissions rp ON rp.role_id = r.id
      LEFT JOIN zenovel.permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1`,
      [userId],
    );
    return {
      roles: [...new Set(result.rows.map((row) => row.role))],
      permissions: [
        ...new Set(
          result.rows.flatMap((row) =>
            row.permission ? [row.permission] : [],
          ),
        ),
      ],
      mfaRequired: result.rows.some((row) => row.mfa_required),
    };
  }

  private async mapUser(row: UserRow): Promise<AuthUser> {
    const access = await this.permissions(row.id);
    return {
      id: row.id,
      username: row.username,
      fullName: row.full_name,
      email: row.email,
      departmentId: row.department_id,
      status: row.status,
      passwordHash: row.password_hash,
      passwordExpiresAt: new Date(row.password_expires_at),
      mustChangePassword: row.must_change_password,
      failedLoginAttempts: row.failed_login_attempts,
      lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
      mfaSecretEncrypted: row.mfa_secret_encrypted,
      mfaEnabled: row.mfa_enabled,
      authVersion: row.auth_version,
      ...access,
    };
  }

  async findUserByUsername(username: string): Promise<AuthUser | null> {
    const result = await this.db.query<UserRow>(
      'SELECT * FROM zenovel.users WHERE lower(username) = lower($1)',
      [username],
    );
    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }
  async findUserById(id: string): Promise<AuthUser | null> {
    const result = await this.db.query<UserRow>(
      'SELECT * FROM zenovel.users WHERE id = $1',
      [id],
    );
    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  async recordFailedLogin(
    user: AuthUser | null,
    lockUntil: Date | null,
  ): Promise<void> {
    if (!user) return;
    await this.db.query(
      `UPDATE zenovel.users SET failed_login_attempts = failed_login_attempts + 1,
      locked_until = COALESCE($2, locked_until), updated_at = now() WHERE id = $1`,
      [user.id, lockUntil],
    );
  }
  async clearFailedLogins(userId: string): Promise<void> {
    await this.db.query(
      'UPDATE zenovel.users SET failed_login_attempts = 0, locked_until = NULL, updated_at = now() WHERE id = $1',
      [userId],
    );
  }

  async createSession(input: {
    user: AuthUser;
    tokenHash: string;
    csrfTokenHash: string;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
    ipHash?: string;
    userAgentHash?: string;
  }): Promise<string> {
    const id = randomUUID();
    await this.db.query(
      `INSERT INTO zenovel.sessions
      (id, user_id, token_hash, csrf_token_hash, auth_version, idle_expires_at, absolute_expires_at, ip_hash, user_agent_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        input.user.id,
        input.tokenHash,
        input.csrfTokenHash,
        input.user.authVersion,
        input.idleExpiresAt,
        input.absoluteExpiresAt,
        input.ipHash ?? null,
        input.userAgentHash ?? null,
      ],
    );
    return id;
  }

  async findSession(tokenHashValue: string): Promise<AuthSession | null> {
    const result = await this.db.query<
      UserRow & {
        session_id: string;
        csrf_token_hash: string;
        absolute_expires_at: Date;
      }
    >(
      `
      SELECT u.*, s.id AS session_id, s.csrf_token_hash, s.absolute_expires_at
      FROM zenovel.sessions s JOIN zenovel.users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.idle_expires_at > now()
        AND s.absolute_expires_at > now() AND s.auth_version = u.auth_version AND u.status = 'active'`,
      [tokenHashValue],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.session_id,
      user: await this.mapUser(row),
      csrfTokenHash: row.csrf_token_hash,
      absoluteExpiresAt: new Date(row.absolute_expires_at),
    };
  }
  async touchSession(id: string, idleExpiresAt: Date): Promise<void> {
    await this.db.query(
      'UPDATE zenovel.sessions SET last_seen_at = now(), idle_expires_at = LEAST($2, absolute_expires_at) WHERE id = $1',
      [id, idleExpiresAt],
    );
  }
  async rotateCsrf(id: string, csrfTokenHash: string): Promise<void> {
    await this.db.query(
      'UPDATE zenovel.sessions SET csrf_token_hash = $2 WHERE id = $1 AND revoked_at IS NULL',
      [id, csrfTokenHash],
    );
  }
  async revokeSession(id: string, reason: string): Promise<void> {
    await this.db.query(
      'UPDATE zenovel.sessions SET revoked_at = COALESCE(revoked_at, now()), revoked_reason = COALESCE(revoked_reason, $2) WHERE id = $1',
      [id, reason],
    );
  }
  async revokeUserSessions(userId: string, reason: string): Promise<void> {
    await this.db.query(
      'UPDATE zenovel.sessions SET revoked_at = COALESCE(revoked_at, now()), revoked_reason = COALESCE(revoked_reason, $2) WHERE user_id = $1',
      [userId, reason],
    );
  }

  async passwordHistory(userId: string, limit: number): Promise<string[]> {
    const result = await this.db.query<{ password_hash: string }>(
      'SELECT password_hash FROM zenovel.password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit],
    );
    return result.rows.map((row) => row.password_hash);
  }
  async changePassword(
    user: AuthUser,
    passwordHash: string,
    expiresAt: Date,
    mustChange = false,
  ): Promise<void> {
    await this.db.transaction(async (client) => {
      await client.query(
        'INSERT INTO zenovel.password_history(user_id, password_hash) VALUES ($1,$2)',
        [user.id, user.passwordHash],
      );
      await client.query(
        `UPDATE zenovel.users SET password_hash=$2, password_changed_at=now(), password_expires_at=$3,
        must_change_password=$4, auth_version=auth_version+1, failed_login_attempts=0, locked_until=NULL, updated_at=now() WHERE id=$1`,
        [user.id, passwordHash, expiresAt, mustChange],
      );
      await client.query(
        `UPDATE zenovel.sessions SET revoked_at=COALESCE(revoked_at,now()), revoked_reason='password_changed' WHERE user_id=$1`,
        [user.id],
      );
    });
  }

  async issueReset(
    userId: string,
    tokenHashValue: string,
    createdBy: string,
    expiresAt: Date,
  ): Promise<string> {
    const id = randomUUID();
    await this.db.query(
      `INSERT INTO zenovel.password_reset_tokens(id,user_id,token_hash,created_by,expires_at,requires_password_change)
      VALUES($1,$2,$3,$4,$5,true)`,
      [id, userId, tokenHashValue, createdBy, expiresAt],
    );
    return id;
  }
  async consumeReset(
    tokenHashValue: string,
    passwordHash: string,
    expiresAt: Date,
  ): Promise<string | null> {
    return this.db.transaction(async (client) => {
      const token = await client.query<{ id: string; user_id: string }>(
        `SELECT id,user_id FROM zenovel.password_reset_tokens
        WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
        [tokenHashValue],
      );
      const row = token.rows[0];
      if (!row) return null;
      const user = await client.query<{ password_hash: string }>(
        'SELECT password_hash FROM zenovel.users WHERE id=$1 FOR UPDATE',
        [row.user_id],
      );
      if (!user.rows[0]) return null;
      await client.query(
        'UPDATE zenovel.password_reset_tokens SET used_at=now() WHERE id=$1',
        [row.id],
      );
      await client.query(
        'INSERT INTO zenovel.password_history(user_id,password_hash) VALUES($1,$2)',
        [row.user_id, user.rows[0].password_hash],
      );
      await client.query(
        `UPDATE zenovel.users SET password_hash=$2,password_changed_at=now(),password_expires_at=$3,
        must_change_password=true,auth_version=auth_version+1,updated_at=now() WHERE id=$1`,
        [row.user_id, passwordHash, expiresAt],
      );
      await client.query(
        `UPDATE zenovel.sessions SET revoked_at=COALESCE(revoked_at,now()),revoked_reason='password_reset' WHERE user_id=$1`,
        [row.user_id],
      );
      return row.user_id;
    });
  }
  async findResetUser(tokenHashValue: string): Promise<AuthUser | null> {
    const result = await this.db.query<UserRow>(
      `SELECT u.* FROM zenovel.password_reset_tokens t
      JOIN zenovel.users u ON u.id=t.user_id WHERE t.token_hash=$1 AND t.used_at IS NULL AND t.expires_at>now()`,
      [tokenHashValue],
    );
    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  async setMfaSecret(userId: string, encrypted: string): Promise<void> {
    await this.db.query(
      'UPDATE zenovel.users SET mfa_secret_encrypted=$2,mfa_enabled=false,updated_at=now() WHERE id=$1',
      [userId, encrypted],
    );
  }
  async enableMfa(userId: string, recoveryHashes: string[]): Promise<void> {
    await this.db.transaction(async (client) => {
      await client.query(
        'UPDATE zenovel.users SET mfa_enabled=true,auth_version=auth_version+1,updated_at=now() WHERE id=$1',
        [userId],
      );
      await client.query(
        'DELETE FROM zenovel.mfa_recovery_codes WHERE user_id=$1',
        [userId],
      );
      for (const hash of recoveryHashes)
        await client.query(
          'INSERT INTO zenovel.mfa_recovery_codes(id,user_id,code_hash) VALUES($1,$2,$3)',
          [randomUUID(), userId, hash],
        );
      await client.query(
        `UPDATE zenovel.sessions SET revoked_at=COALESCE(revoked_at,now()),revoked_reason='mfa_enabled' WHERE user_id=$1`,
        [userId],
      );
    });
  }
  async consumeRecoveryCode(
    userId: string,
    codeHash: string,
  ): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE zenovel.mfa_recovery_codes SET used_at=now()
      WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING id`,
      [userId, codeHash],
    );
    return result.rowCount === 1;
  }
  async disableMfa(userId: string): Promise<void> {
    await this.db.transaction(async (client) => {
      await client.query(
        `UPDATE zenovel.users SET mfa_enabled=false,mfa_secret_encrypted=NULL,
        auth_version=auth_version+1,updated_at=now() WHERE id=$1`,
        [userId],
      );
      await client.query(
        'DELETE FROM zenovel.mfa_recovery_codes WHERE user_id=$1',
        [userId],
      );
      await client.query(
        `UPDATE zenovel.sessions SET revoked_at=COALESCE(revoked_at,now()),
        revoked_reason='mfa_disabled' WHERE user_id=$1`,
        [userId],
      );
    });
  }

  async event(event: SecurityEvent): Promise<void> {
    const forbidden = /password|token|secret|recovery|cookie/i;
    const context = Object.fromEntries(
      Object.entries(event.context ?? {}).filter(
        ([key]) => !forbidden.test(key),
      ),
    );
    await this.db.query(
      `INSERT INTO zenovel.security_events
      (id,actor_user_id,subject_user_id,event_type,outcome,request_id,reason,context)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        randomUUID(),
        event.actorUserId ?? null,
        event.subjectUserId ?? null,
        event.eventType,
        event.outcome,
        event.requestId ?? null,
        event.reason ?? null,
        JSON.stringify(context),
      ],
    );
  }

  async userCount(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM zenovel.users',
    );
    return Number(result.rows[0]?.count ?? 0);
  }
  async bootstrap(input: {
    username: string;
    fullName: string;
    passwordHash: string;
    expiresAt: Date;
  }): Promise<string | null> {
    return this.db.transaction(async (client: PoolClient) => {
      await client.query('LOCK TABLE zenovel.users IN EXCLUSIVE MODE');
      const count = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM zenovel.users',
      );
      if (Number(count.rows[0]?.count) !== 0) return null;
      const id = randomUUID();
      await client.query(
        `INSERT INTO zenovel.users(id,username,full_name,password_hash,password_expires_at,must_change_password)
        VALUES($1,$2,$3,$4,$5,true)`,
        [
          id,
          input.username,
          input.fullName,
          input.passwordHash,
          input.expiresAt,
        ],
      );
      await client.query(
        `INSERT INTO zenovel.user_roles(user_id,role_id)
        SELECT $1,id FROM zenovel.roles WHERE code='SYSTEM_ADMINISTRATOR'`,
        [id],
      );
      return id;
    });
  }
}
