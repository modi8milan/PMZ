import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { RequirePermissions, RequireRoles } from '../auth/auth.decorators.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AdminService } from './admin.service.js';
import {
  CreateDepartmentDto,
  AuditEventsQueryDto,
  CreateRoleDto,
  CreateUserDto,
  ReauthenticateDto,
  ReasonDto,
  RolePermissionsDto,
  UpdateDepartmentDto,
  UpdateRoleDto,
  UpdateUserDto,
} from './admin.dto.js';

@Controller('admin')
@RequirePermissions('Administer')
export class AdminController {
  constructor(private readonly admin: AdminService) {}
  private context(request: AuthenticatedRequest, response: Response) {
    return {
      actorId: request.auth!.user.id,
      requestId: response.locals.requestId as string | undefined,
    };
  }
  @Get('catalog')
  @RequirePermissions()
  @RequireRoles('QMS', 'SYSTEM_ADMINISTRATOR')
  catalog() {
    return this.admin.lists();
  }
  @Get('users') users() {
    return this.admin.users();
  }
  @Post('users') createUser(
    @Body() body: CreateUserDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const c = this.context(request, response);
    return this.admin.createUser(c.actorId, body, c.requestId);
  }
  @Patch('users/:id') updateUser(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const c = this.context(request, response);
    return this.admin.updateUser(c.actorId, id, body, c.requestId);
  }
  @Post('users/:id/revoke-sessions') revoke(
    @Param('id') id: string,
    @Body() body: ReasonDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const c = this.context(request, response);
    return this.admin.revokeSessions(c.actorId, id, body.reason, c.requestId);
  }
  @Post('users/:id/reset') reset(
    @Param('id') id: string,
    @Body() body: ReasonDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const c = this.context(request, response);
    return this.admin.issueReset(c.actorId, id, body.reason, c.requestId);
  }
  @Post('users/:id/mfa-reset') resetMfa(
    @Param('id') id: string,
    @Body() body: ReauthenticateDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const c = this.context(request, response);
    return this.admin.resetMfa(
      c.actorId,
      id,
      body.currentPassword,
      body.authenticatorCode,
      body.recoveryCode,
      body.reason,
      c.requestId,
    );
  }
  @Post('roles')
  @RequirePermissions()
  @RequireRoles('QMS', 'SYSTEM_ADMINISTRATOR')
  createRole(
    @Body() body: CreateRoleDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const c = this.context(request, response);
    return this.admin.createRole(c.actorId, body, c.requestId);
  }
  @Patch('roles/:id')
  @RequirePermissions()
  @RequireRoles('QMS', 'SYSTEM_ADMINISTRATOR')
  updateRole(
    @Param('id') id: string,
    @Body() body: UpdateRoleDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const c = this.context(request, response);
    return this.admin.updateRole(c.actorId, id, body, c.requestId);
  }
  @Delete('roles/:id')
  @RequirePermissions()
  @RequireRoles('QMS', 'SYSTEM_ADMINISTRATOR')
  retireRole(
    @Param('id') id: string,
    @Body() body: ReasonDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const c = this.context(request, response);
    return this.admin.retireRole(c.actorId, id, body.reason, c.requestId);
  }
  @Put('roles/:id/permissions')
  @RequirePermissions()
  @RequireRoles('QMS', 'SYSTEM_ADMINISTRATOR')
  setPermissions(
    @Param('id') id: string,
    @Body() body: RolePermissionsDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const c = this.context(request, response);
    return this.admin.setRolePermissions(c.actorId, id, body, c.requestId);
  }
  @Post('departments') createDepartment(
    @Body() body: CreateDepartmentDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const c = this.context(request, response);
    return this.admin.createDepartment(c.actorId, body, c.requestId);
  }
  @Patch('departments/:id') updateDepartment(
    @Param('id') id: string,
    @Body() body: UpdateDepartmentDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const c = this.context(request, response);
    return this.admin.updateDepartment(c.actorId, id, body, c.requestId);
  }
  @Get('audit-users') @RequirePermissions('AuditReview') auditUsers() {
    return this.admin.auditUsers();
  }
  @Get('security-events')
  @RequirePermissions('AuditReview')
  events(@Query() query: AuditEventsQueryDto) {
    return this.admin.events(query);
  }
}
