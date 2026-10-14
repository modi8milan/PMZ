import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
  AuditEventsQueryDto,
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
  private requiredReason(value?: string): string {
    const reason = value?.trim();
    if (!reason) throw new BadRequestException('A reason is required.');
    return reason;
  }
  private async roleManager(actorId: string) {
    const actor = await this.authRepository.findUserById(actorId);
    if (
      !actor ||
      !actor.roles.some((role) =>
        ['QMS', 'SYSTEM_ADMINISTRATOR'].includes(role),
      )
    )
      throw new ForbiddenException();
    return actor;
  }
  async lists() {
    const [departments, roles, permissions] = await Promise.all([
      this.db.query(
        'SELECT id,code,name,active FROM zenovel.departments ORDER BY name',
      ),
      this.db
        .query(`SELECT r.id,r.code,r.name,r.description,r.active,r.mfa_required AS "mfaRequired",r.system_role AS "systemRole",
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
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ConflictException();
    }
    const reason = this.requiredReason(input.reason);
    const resetToken = await this.auth.issueReset(
      actorId,
      id,
      requestId,
      reason,
    );
    await this.authRepository.event({
      actorUserId: actorId,
      subjectUserId: id,
      eventType: 'user_created',
      outcome: 'success',
      requestId,
      reason,
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
    const reason =
      input.status !== undefined || input.roleIds !== undefined
        ? this.requiredReason(input.reason)
        : undefined;
    const actor = input.roleIds
      ? await this.authRepository.findUserById(actorId)
      : null;
    if (
      input.status === 'inactive' &&
      current.roles.includes('SYSTEM_ADMINISTRATOR')
    ) {
      const remaining = await this.db.query<{ count: string }>(
        `SELECT count(DISTINCT u.id)::text AS count FROM zenovel.users u
         JOIN zenovel.user_roles ur ON ur.user_id=u.id JOIN zenovel.roles r ON r.id=ur.role_id
         WHERE u.status='active' AND r.code='SYSTEM_ADMINISTRATOR' AND u.id<>$1`,
        [userId],
      );
      if (Number(remaining.rows[0]?.count ?? 0) === 0)
        throw new BadRequestException(
          'The last active system administrator cannot be deactivated.',
        );
    }
    let roleChange: { beforeRoles: string; afterRoles: string } | undefined;
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
        const validRoles = await client.query<{ id: string; code: string }>(
          'SELECT id,code FROM zenovel.roles WHERE id=ANY($1::uuid[]) AND active=true',
          [input.roleIds],
        );
        if (validRoles.rows.length !== input.roleIds.length)
          throw new BadRequestException('One or more roles are unavailable.');
        if (
          validRoles.rows.some(
            (role) => role.code === 'SYSTEM_ADMINISTRATOR',
          ) &&
          !actor?.roles.includes('SYSTEM_ADMINISTRATOR')
        )
          throw new ForbiddenException(
            'Only a system administrator can assign that role.',
          );
        if (
          current.roles.includes('SYSTEM_ADMINISTRATOR') &&
          !validRoles.rows.some((role) => role.code === 'SYSTEM_ADMINISTRATOR')
        ) {
          const remaining = await client.query<{ count: string }>(
            `SELECT count(DISTINCT u.id)::text AS count FROM zenovel.users u
             JOIN zenovel.user_roles ur ON ur.user_id=u.id JOIN zenovel.roles r ON r.id=ur.role_id
             WHERE u.status='active' AND r.code='SYSTEM_ADMINISTRATOR' AND u.id<>$1`,
            [userId],
          );
          if (Number(remaining.rows[0]?.count ?? 0) === 0)
            throw new BadRequestException(
              'The last active system administrator cannot lose that role.',
            );
        }
        roleChange = {
          beforeRoles: [...current.roles].sort().join(','),
          afterRoles: validRoles.rows
            .map((role) => role.code)
            .sort()
            .join(','),
        };
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
      reason,
      context: roleChange,
    });
    return { success: true };
  }
  async revokeSessions(
    actorId: string,
    userId: string,
    reasonValue: string,
    requestId?: string,
  ) {
    const reason = this.requiredReason(reasonValue);
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
      reason,
    });
    return { success: true };
  }
  async issueReset(
    actorId: string,
    userId: string,
    reasonValue: string,
    requestId?: string,
  ) {
    const reason = this.requiredReason(reasonValue);
    return {
      resetToken: await this.auth.issueReset(
        actorId,
        userId,
        requestId,
        reason,
      ),
      delivery:
        'Provide this single-use token through an approved out-of-band channel.',
    };
  }
  async createRole(actorId: string, input: CreateRoleDto, requestId?: string) {
    await this.roleManager(actorId);
    const reason = this.requiredReason(input.reason);
    const id = randomUUID();
    if (input.permissions.includes('Administer'))
      throw new BadRequestException(
        'Administrator access is restricted to the protected system administrator role.',
      );
    if (input.permissions.includes('Download'))
      throw new BadRequestException(
        'Monitoring-report download cannot be granted to a custom role.',
      );
    try {
      await this.db.transaction(async (client) => {
        const known = await client.query<{ code: string }>(
          'SELECT code FROM zenovel.permissions WHERE code=ANY($1::text[])',
          [input.permissions],
        );
        if (known.rows.length !== input.permissions.length)
          throw new BadRequestException(
            'One or more access rights are unavailable.',
          );
        await client.query(
          'INSERT INTO zenovel.roles(id,code,name,description,mfa_required) VALUES($1,$2,$3,$4,$5)',
          [
            id,
            input.code,
            input.name,
            input.description ?? null,
            input.mfaRequired ?? false,
          ],
        );
        for (const permission of input.permissions)
          await client.query(
            `INSERT INTO zenovel.role_permissions(role_id,permission_id,granted_by)
             SELECT $1,id,$3 FROM zenovel.permissions WHERE code=$2`,
            [id, permission, actorId],
          );
      });
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      )
        throw error;
      throw new ConflictException();
    }
    await this.authRepository.event({
      actorUserId: actorId,
      eventType: 'role_created',
      outcome: 'success',
      requestId,
      reason,
      context: { roleId: id, permissions: input.permissions.sort().join(',') },
    });
    return { id };
  }
  async setRolePermissions(
    actorId: string,
    roleId: string,
    input: RolePermissionsDto,
    requestId?: string,
  ) {
    const actor = await this.roleManager(actorId);
    const reason = this.requiredReason(input.reason);
    const role = await this.db.query<{ code: string; systemRole: boolean }>(
      'SELECT code,system_role AS "systemRole" FROM zenovel.roles WHERE id=$1',
      [roleId],
    );
    const code = role.rows[0]?.code;
    if (!code) throw new BadRequestException();
    if (
      input.permissions.includes('Administer') &&
      (!actor.roles.includes('SYSTEM_ADMINISTRATOR') ||
        code !== 'SYSTEM_ADMINISTRATOR')
    )
      throw new ForbiddenException(
        'Administrator access is restricted to the protected system administrator role.',
      );
    if (
      code === 'SYSTEM_ADMINISTRATOR' &&
      !input.permissions.includes('Administer')
    )
      throw new BadRequestException(
        'Administrator access cannot be removed from the protected system administrator role.',
      );
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
      reason,
      context: { roleId, permissions: input.permissions.sort().join(',') },
    });
    return { success: true };
  }
  async updateRole(
    actorId: string,
    roleId: string,
    input: UpdateRoleDto,
    requestId?: string,
  ) {
    const actor = await this.roleManager(actorId);
    const reason = this.requiredReason(input.reason);
    const role = await this.db.query<{ code: string; systemRole: boolean }>(
      'SELECT code,system_role AS "systemRole" FROM zenovel.roles WHERE id=$1',
      [roleId],
    );
    const current = role.rows[0];
    if (!current) throw new BadRequestException();
    if (
      current.code === 'SYSTEM_ADMINISTRATOR' &&
      (input.name !== undefined ||
        input.description !== undefined ||
        input.active !== undefined ||
        input.mfaRequired !== undefined)
    )
      throw new BadRequestException(
        'The essential system administrator role is protected.',
      );
    await this.db.transaction(async (client) => {
      await client.query(
        `UPDATE zenovel.roles SET name=COALESCE($2,name),description=COALESCE($3,description),
        active=COALESCE($4,active),mfa_required=COALESCE($5,mfa_required),updated_at=now()
        WHERE id=$1`,
        [
          roleId,
          input.name ?? null,
          input.description ?? null,
          input.active ?? null,
          input.mfaRequired ?? null,
        ],
      );
      if (input.permissions !== undefined) {
        if (
          input.permissions.includes('Administer') &&
          (!actor.roles.includes('SYSTEM_ADMINISTRATOR') ||
            current.code !== 'SYSTEM_ADMINISTRATOR')
        )
          throw new ForbiddenException(
            'Administrator access cannot be granted to this role.',
          );
        if (
          current.code === 'SYSTEM_ADMINISTRATOR' &&
          !input.permissions.includes('Administer')
        )
          throw new BadRequestException(
            'Administrator access cannot be removed from the protected system administrator role.',
          );
        if (
          input.permissions.includes('Download') &&
          !REPORT_DOWNLOAD_ROLES.has(current.code)
        )
          throw new BadRequestException(
            'Monitoring-report download cannot be granted to this role category.',
          );
        const known = await client.query<{ code: string }>(
          'SELECT code FROM zenovel.permissions WHERE code=ANY($1::text[])',
          [input.permissions],
        );
        if (known.rows.length !== input.permissions.length)
          throw new BadRequestException(
            'One or more access rights are unavailable.',
          );
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
      }
      await client.query(
        `UPDATE zenovel.users SET auth_version=auth_version+1
         WHERE id IN (SELECT user_id FROM zenovel.user_roles WHERE role_id=$1)`,
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
      eventType: 'role_changed',
      outcome: 'success',
      requestId,
      reason,
      context: { roleId },
    });
    return { success: true };
  }
  async retireRole(
    actorId: string,
    roleId: string,
    reasonValue: string,
    requestId?: string,
  ) {
    await this.roleManager(actorId);
    const reason = this.requiredReason(reasonValue);
    const role = await this.db.query<{
      code: string;
      systemRole: boolean;
      assignments: string;
    }>(
      `SELECT r.code,r.system_role AS "systemRole",count(ur.user_id)::text AS assignments
       FROM zenovel.roles r LEFT JOIN zenovel.user_roles ur ON ur.role_id=r.id
       WHERE r.id=$1 GROUP BY r.id`,
      [roleId],
    );
    const current = role.rows[0];
    if (!current) throw new BadRequestException();
    if (current.systemRole)
      throw new BadRequestException('System roles cannot be retired.');
    if (Number(current.assignments) > 0)
      throw new BadRequestException(
        'Remove this role from all users before retiring it.',
      );
    await this.db.query(
      'UPDATE zenovel.roles SET active=false,updated_at=now() WHERE id=$1',
      [roleId],
    );
    await this.authRepository.event({
      actorUserId: actorId,
      eventType: 'role_retired',
      outcome: 'success',
      requestId,
      reason,
      context: { roleId },
    });
    return { success: true };
  }
  async resetMfa(
    actorId: string,
    userId: string,
    currentPassword: string,
    authenticatorCode: string | undefined,
    recoveryCode: string | undefined,
    reasonValue: string,
    requestId?: string,
  ) {
    const reason = this.requiredReason(reasonValue);
    const actor = await this.authRepository.findUserById(actorId);
    if (!actor || !(await verifyPassword(currentPassword, actor.passwordHash)))
      throw new BadRequestException('Re-authentication failed.');
    await this.auth.verifyMfaStepUp(actor, authenticatorCode, recoveryCode);
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
      reason,
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
  async auditUsers() {
    const result = await this.db.query(
      'SELECT id,full_name AS "fullName" FROM zenovel.users ORDER BY full_name',
    );
    return result.rows;
  }
  async events(filters: AuditEventsQueryDto) {
    const result = await this.db.query(
      `SELECT e.id,e.actor_user_id AS "actorUserId",a.full_name AS "actorName",
       e.event_type AS "eventType",e.reason,e.created_at AS "createdAt"
       FROM zenovel.security_events e LEFT JOIN zenovel.users a ON a.id=e.actor_user_id
       WHERE ($1::date IS NULL OR e.created_at >= $1::date)
         AND ($2::date IS NULL OR e.created_at < $2::date + interval '1 day')
         AND ($3::text IS NULL OR a.full_name ILIKE '%' || $3 || '%' OR e.actor_user_id::text ILIKE '%' || $3 || '%')
         AND ($4::text IS NULL OR e.reason ILIKE '%' || $4 || '%')
       ORDER BY e.created_at DESC LIMIT 500`,
      [
        filters.from ?? null,
        filters.to ?? null,
        filters.user?.trim() || null,
        filters.reason?.trim() || null,
      ],
    );
    return result.rows;
  }
}
