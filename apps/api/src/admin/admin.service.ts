import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import {
  hashPassword,
  randomToken,
  verifyPassword,
} from '../security/security.crypto.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { AuthService } from '../auth/auth.service.js';
import { REPORT_DOWNLOAD_ROLES } from '../auth/authorization.service.js';
import type {
  CreateDepartmentDto,
  CreateRoleDto,
  CreateUserDto,
  RolePermissionsDto,
  UpdateDepartmentDto,
  UpdateRoleDto,
  UpdateUserDto,
} from './admin.dto.js';

@Injectable()
export class AdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly authRepository: AuthRepository,
    private readonly auth: AuthService,
  ) {}
  async lists() {
    const [departments, roles, permissions] = await Promise.all([
      this.db.query(
        'SELECT id,code,name,active FROM zenovel.departments ORDER BY name',
      ),
      this.db
        .query(`SELECT r.id,r.code,r.name,r.active,r.mfa_required AS "mfaRequired",r.system_role AS "systemRole",
        COALESCE(array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL),'{}') AS permissions
        FROM zenovel.roles r LEFT JOIN zenovel.role_permissions rp ON rp.role_id=r.id
        LEFT JOIN zenovel.permissions p ON p.id=rp.permission_id GROUP BY r.id ORDER BY r.name`),
      this.db.query(
        'SELECT id,code,description FROM zenovel.permissions ORDER BY code',
      ),
    ]);
    return {
      departments: departments.rows,
      roles: roles.rows,
      permissions: permissions.rows,
    };
  }
  async users() {
    const result = await this.db
      .query(`SELECT u.id,u.username,u.full_name AS "fullName",u.email,u.status,
      u.department_id AS "departmentId",d.name AS department,u.must_change_password AS "mustChangePassword",
      u.password_expires_at AS "passwordExpiresAt",u.mfa_enabled AS "mfaEnabled",
      COALESCE(array_agg(r.code ORDER BY r.code) FILTER (WHERE r.code IS NOT NULL),'{}') AS roles
      FROM zenovel.users u LEFT JOIN zenovel.departments d ON d.id=u.department_id
      LEFT JOIN zenovel.user_roles ur ON ur.user_id=u.id LEFT JOIN zenovel.roles r ON r.id=ur.role_id
      GROUP BY u.id,d.name ORDER BY u.full_name`);
    return result.rows;
  }
  async createUser(actorId: string, input: CreateUserDto, requestId?: string) {
    const id = randomUUID();
    const unusablePassword = await hashPassword(randomToken(48));
    try {
      await this.db.transaction(async (client) => {
        const validRoles = await client.query<{ id: string }>(
          'SELECT id FROM zenovel.roles WHERE id=ANY($1::uuid[]) AND active=true',
          [input.roleIds],
        );
        if (validRoles.rows.length !== input.roleIds.length)
          throw new BadRequestException('One or more roles are unavailable.');
        await client.query(
          `INSERT INTO zenovel.users(id,username,full_name,email,department_id,password_hash,password_expires_at,must_change_password)
          VALUES($1,$2,$3,$4,$5,$6,now(),true)`,
          [
            id,
            input.username,
            input.fullName,
            input.email ?? null,
            input.departmentId ?? null,
            unusablePassword,
          ],
        );
        for (const roleId of input.roleIds)
          await client.query(
            `INSERT INTO zenovel.user_roles(user_id,role_id,assigned_by)
          SELECT $1,id,$3 FROM zenovel.roles WHERE id=$2 AND active=true`,
            [id, roleId, actorId],
          );
      });
    } catch {
      throw new ConflictException();
    }
    const resetToken = await this.auth.issueReset(actorId, id, requestId);
    await this.authRepository.event({
      actorUserId: actorId,
      subjectUserId: id,
      eventType: 'user_created',
      outcome: 'success',
      requestId,
    });
    return {
      id,
      resetToken,
      delivery:
        'Provide this single-use token through an approved out-of-band channel.',
    };
  }
  async updateUser(
    actorId: string,
    userId: string,
    input: UpdateUserDto,
    requestId?: string,
  ) {
    if (actorId === userId && input.status === 'inactive')
      throw new BadRequestException(
        'You cannot deactivate your own active session.',
      );
    const current = await this.authRepository.findUserById(userId);
    if (!current) throw new BadRequestException();
    await this.db.transaction(async (client) => {
      await client.query(
        `UPDATE zenovel.users SET full_name=COALESCE($2,full_name),email=COALESCE($3,email),
        department_id=COALESCE($4,department_id),status=COALESCE($5,status),
        deactivated_at=CASE WHEN $5='inactive' THEN now() WHEN $5='active' THEN NULL ELSE deactivated_at END,
        auth_version=CASE WHEN $5 IS NOT NULL OR $6::boolean THEN auth_version+1 ELSE auth_version END,updated_at=now() WHERE id=$1`,
        [
          userId,
          input.fullName ?? null,
          input.email ?? null,
          input.departmentId ?? null,
          input.status ?? null,
          input.roleIds !== undefined,
        ],
      );
      if (input.roleIds) {
        const validRoles = await client.query<{ id: string }>(
          'SELECT id FROM zenovel.roles WHERE id=ANY($1::uuid[]) AND active=true',
          [input.roleIds],
        );
        if (validRoles.rows.length !== input.roleIds.length)
          throw new BadRequestException('One or more roles are unavailable.');
        await client.query('DELETE FROM zenovel.user_roles WHERE user_id=$1', [
          userId,
        ]);
        for (const roleId of input.roleIds)
          await client.query(
            `INSERT INTO zenovel.user_roles(user_id,role_id,assigned_by)
          SELECT $1,id,$3 FROM zenovel.roles WHERE id=$2 AND active=true`,
            [userId, roleId, actorId],
          );
      }
      if (input.status !== undefined || input.roleIds !== undefined)
        await client.query(
          `UPDATE zenovel.sessions SET revoked_at=COALESCE(revoked_at,now()),
        revoked_reason=CASE WHEN $2='inactive' THEN 'account_deactivated' ELSE 'privileges_changed' END WHERE user_id=$1`,
          [userId, input.status ?? null],
        );
    });
    const eventType =
      input.status === 'inactive'
        ? 'user_deactivated'
        : input.status === 'active'
          ? 'user_activated'
          : input.roleIds
            ? 'user_roles_changed'
            : 'user_updated';
    await this.authRepository.event({
      actorUserId: actorId,
      subjectUserId: userId,
      eventType,
      outcome: 'success',
      requestId,
    });
    return { success: true };
  }
  async revokeSessions(actorId: string, userId: string, requestId?: string) {
    await this.authRepository.revokeUserSessions(
      userId,
      'administrator_revocation',
    );
    await this.authRepository.event({
      actorUserId: actorId,
      subjectUserId: userId,
      eventType: 'sessions_revoked',
      outcome: 'success',
      requestId,
    });
    return { success: true };
  }
  async issueReset(actorId: string, userId: string, requestId?: string) {
    return {
      resetToken: await this.auth.issueReset(actorId, userId, requestId),
      delivery:
        'Provide this single-use token through an approved out-of-band channel.',
    };
  }
  async createRole(actorId: string, input: CreateRoleDto, requestId?: string) {
    const id = randomUUID();
    try {
      await this.db.query(
        'INSERT INTO zenovel.roles(id,code,name,mfa_required) VALUES($1,$2,$3,$4)',
        [id, input.code, input.name, input.mfaRequired ?? false],
      );
    } catch {
      throw new ConflictException();
    }
    await this.authRepository.event({
      actorUserId: actorId,
      eventType: 'role_created',
      outcome: 'success',
      requestId,
      context: { roleId: id },
    });
    return { id };
  }
  async setRolePermissions(
    actorId: string,
    roleId: string,
    input: RolePermissionsDto,
    requestId?: string,
  ) {
    const role = await this.db.query<{ code: string }>(
      'SELECT code FROM zenovel.roles WHERE id=$1',
      [roleId],
    );
    const code = role.rows[0]?.code;
    if (!code) throw new BadRequestException();
    if (
      input.permissions.includes('Download') &&
      !REPORT_DOWNLOAD_ROLES.has(code)
    )
      throw new BadRequestException(
        'Monitoring-report download cannot be granted to this role category.',
      );
    await this.db.transaction(async (client) => {
      const known = await client.query<{ code: string }>(
        'SELECT code FROM zenovel.permissions WHERE code=ANY($1::text[])',
        [input.permissions],
      );
      if (known.rows.length !== input.permissions.length)
        throw new BadRequestException();
      await client.query(
        'DELETE FROM zenovel.role_permissions WHERE role_id=$1',
        [roleId],
      );
      for (const permission of input.permissions)
        await client.query(
          `INSERT INTO zenovel.role_permissions(role_id,permission_id,granted_by)
        SELECT $1,id,$3 FROM zenovel.permissions WHERE code=$2`,
          [roleId, permission, actorId],
        );
      await client.query(
        `UPDATE zenovel.users SET auth_version=auth_version+1 WHERE id IN (SELECT user_id FROM zenovel.user_roles WHERE role_id=$1)`,
        [roleId],
      );
      await client.query(
        `UPDATE zenovel.sessions SET revoked_at=COALESCE(revoked_at,now()),revoked_reason='privileges_changed'
        WHERE user_id IN (SELECT user_id FROM zenovel.user_roles WHERE role_id=$1)`,
        [roleId],
      );
    });
    await this.authRepository.event({
      actorUserId: actorId,
      eventType: 'role_permissions_changed',
      outcome: 'success',
      requestId,
      context: { roleId },
    });
    return { success: true };
  }
  async updateRole(
    actorId: string,
    roleId: string,
    input: UpdateRoleDto,
    requestId?: string,
  ) {
    const result = await this.db.query(
      `UPDATE zenovel.roles SET name=COALESCE($2,name),active=COALESCE($3,active),
      mfa_required=COALESCE($4,mfa_required),updated_at=now() WHERE id=$1 RETURNING id`,
      [
        roleId,
        input.name ?? null,
        input.active ?? null,
        input.mfaRequired ?? null,
      ],
    );
    if (!result.rowCount) throw new BadRequestException();
    await this.db.query(
      `UPDATE zenovel.sessions SET revoked_at=COALESCE(revoked_at,now()),revoked_reason='privileges_changed'
      WHERE user_id IN (SELECT user_id FROM zenovel.user_roles WHERE role_id=$1)`,
      [roleId],
    );
    await this.authRepository.event({
      actorUserId: actorId,
      eventType: 'role_changed',
      outcome: 'success',
      requestId,
      context: { roleId },
    });
    return { success: true };
  }
  async resetMfa(
    actorId: string,
    userId: string,
    currentPassword: string,
    requestId?: string,
  ) {
    const actor = await this.authRepository.findUserById(actorId);
    if (!actor || !(await verifyPassword(currentPassword, actor.passwordHash)))
      throw new BadRequestException('Re-authentication failed.');
    const result = await this.db.query(
      `UPDATE zenovel.users SET mfa_enabled=false,mfa_secret_encrypted=NULL,auth_version=auth_version+1,updated_at=now()
      WHERE id=$1 RETURNING id`,
      [userId],
    );
    if (!result.rowCount) throw new BadRequestException();
    await this.db.query(
      'DELETE FROM zenovel.mfa_recovery_codes WHERE user_id=$1',
      [userId],
    );
    await this.authRepository.revokeUserSessions(userId, 'mfa_reset');
    await this.authRepository.event({
      actorUserId: actorId,
      subjectUserId: userId,
      eventType: 'mfa_reset',
      outcome: 'success',
      requestId,
    });
    return { success: true };
  }
  async createDepartment(
    actorId: string,
    input: CreateDepartmentDto,
    requestId?: string,
  ) {
    const id = randomUUID();
    try {
      await this.db.query(
        'INSERT INTO zenovel.departments(id,code,name) VALUES($1,$2,$3)',
        [id, input.code, input.name],
      );
    } catch {
      throw new ConflictException();
    }
    await this.authRepository.event({
      actorUserId: actorId,
      eventType: 'department_created',
      outcome: 'success',
      requestId,
      context: { departmentId: id },
    });
    return { id };
  }
  async updateDepartment(
    actorId: string,
    id: string,
    input: UpdateDepartmentDto,
    requestId?: string,
  ) {
    const result = await this.db.query(
      'UPDATE zenovel.departments SET name=COALESCE($2,name),active=COALESCE($3,active),updated_at=now() WHERE id=$1 RETURNING id',
      [id, input.name ?? null, input.active ?? null],
    );
    if (!result.rowCount) throw new BadRequestException();
    await this.authRepository.event({
      actorUserId: actorId,
      eventType: 'department_changed',
      outcome: 'success',
      requestId,
      context: { departmentId: id },
    });
    return { success: true };
  }
  async events() {
    const result = await this.db
      .query(`SELECT id,actor_user_id AS "actorUserId",subject_user_id AS "subjectUserId",event_type AS "eventType",
    outcome,request_id AS "requestId",context,created_at AS "createdAt" FROM zenovel.security_events ORDER BY created_at DESC LIMIT 200`);
    return result.rows;
  }
}
