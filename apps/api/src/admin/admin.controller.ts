import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { RequirePermissions } from '../auth/auth.decorators.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AdminService } from './admin.service.js';
import {
  CreateDepartmentDto,
  CreateRoleDto,
  CreateUserDto,
  ReauthenticateDto,
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
  @Get('catalog') catalog() {
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
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const c = this.context(request, response);
    return this.admin.revokeSessions(c.actorId, id, c.requestId);
  }
  @Post('users/:id/reset') reset(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const c = this.context(request, response);
    return this.admin.issueReset(c.actorId, id, c.requestId);
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
      c.requestId,
    );
  }
  @Post('roles') createRole(
    @Body() body: CreateRoleDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const c = this.context(request, response);
    return this.admin.createRole(c.actorId, body, c.requestId);
  }
  @Patch('roles/:id') updateRole(
    @Param('id') id: string,
    @Body() body: UpdateRoleDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const c = this.context(request, response);
    return this.admin.updateRole(c.actorId, id, body, c.requestId);
  }
  @Put('roles/:id/permissions') setPermissions(
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
  @Get('security-events') @RequirePermissions('AuditReview') events() {
    return this.admin.events();
  }
}
