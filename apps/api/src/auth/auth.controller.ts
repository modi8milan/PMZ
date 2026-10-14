import { Body, Controller, Get, Headers, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { Environment } from '../config/environment.js';
import { Throttle } from '@nestjs/throttler';
import {
  AllowMfaSetup,
  AllowPasswordChange,
  Public,
} from './auth.decorators.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedRequest, AuthSession } from './auth.types.js';
import {
  BootstrapDto,
  ChangePasswordDto,
  LoginDto,
  MfaConfirmDto,
  MfaDisableDto,
  MfaEnrollDto,
  RecoveryRequestDto,
  ResetPasswordDto,
} from './auth.dto.js';

@Controller('auth')
export class AuthController {
  private readonly cookieName: string;
  private readonly secure: boolean;
  private readonly absoluteMs: number;
  private readonly bootstrapToken: string;
  constructor(
    private readonly auth: AuthService,
    private readonly repository: AuthRepository,
    config: ConfigService<Environment, true>,
  ) {
    this.cookieName = config.get('SESSION_COOKIE_NAME', { infer: true });
    this.secure = config.get('NODE_ENV', { infer: true }) === 'production';
    this.absoluteMs =
      config.get('SESSION_ABSOLUTE_HOURS', { infer: true }) * 3_600_000;
    this.bootstrapToken = config.get('BOOTSTRAP_TOKEN', { infer: true });
  }
  private requestId(response: Response): string | undefined {
    return response.locals.requestId as string | undefined;
  }
  private setCookie(response: Response, value: string) {
    response.cookie(this.cookieName, value, {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'strict',
      path: '/',
      maxAge: this.absoluteMs,
    });
  }
  private clearCookie(response: Response) {
    response.clearCookie(this.cookieName, {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'strict',
      path: '/',
    });
  }
  private sessionBody(session: AuthSession, csrfToken?: string) {
    const passwordExpired =
      session.user.mustChangePassword ||
      session.user.passwordExpiresAt.getTime() <= Date.now();
    return {
      user: {
        id: session.user.id,
        username: session.user.username,
        fullName: session.user.fullName,
        email: session.user.email,
        departmentId: session.user.departmentId,
        roles: session.user.roles,
        permissions: session.user.permissions,
        mfaEnabled: session.user.mfaEnabled,
        mfaRequired: session.user.mfaRequired,
      },
      mfaEnrollmentRequired:
        session.user.mfaRequired && !session.user.mfaEnabled,
      passwordExpired,
      passwordExpiresAt: session.user.passwordExpiresAt.toISOString(),
      sessionExpiresAt: session.absoluteExpiresAt.toISOString(),
      ...(csrfToken ? { csrfToken } : {}),
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login({
      ...body,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: this.requestId(response),
    });
    this.setCookie(response, result.sessionToken);
    return this.sessionBody(result.session, result.csrfToken);
  }
  @AllowPasswordChange()
  @AllowMfaSetup()
  @Get('session')
  async session(@Req() request: AuthenticatedRequest) {
    const session = request.auth!;
    return this.sessionBody(session, await this.auth.rotateCsrf(session));
  }
  @AllowPasswordChange()
  @AllowMfaSetup()
  @Post('logout')
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(request.auth!, this.requestId(response));
    this.clearCookie(response);
    return { success: true };
  }
  @AllowPasswordChange()
  @AllowMfaSetup()
  @Post('password')
  async password(
    @Body() body: ChangePasswordDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.changePassword(
      request.auth!.user,
      body.currentPassword,
      body.newPassword,
      this.requestId(response),
    );
    this.clearCookie(response);
    return { success: true, loginRequired: true };
  }
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('recovery')
  async recovery(
    @Body() body: RecoveryRequestDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.requestRecovery(body.username, this.requestId(response));
    return {
      message:
        'If the account is eligible, an authorized administrator can continue the recovery process.',
    };
  }
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset')
  async reset(
    @Body() body: ResetPasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.completeReset(
      body.token,
      body.newPassword,
      this.requestId(response),
    );
    return { success: true, passwordChangeRequired: true };
  }
  @AllowMfaSetup()
  @Post('mfa/enroll')
  async enroll(
    @Body() body: MfaEnrollDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.beginMfa(
      request.auth!.user,
      body.password,
      this.requestId(response),
    );
  }
  @AllowMfaSetup()
  @Post('mfa/confirm')
  async confirm(
    @Body() body: MfaConfirmDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const recoveryCodes = await this.auth.confirmMfa(
      request.auth!.user.id,
      body.code,
      this.requestId(response),
    );
    this.clearCookie(response);
    return { recoveryCodes, loginRequired: true };
  }
  @Post('mfa/disable')
  async disable(
    @Body() body: MfaDisableDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.disableMfa(
      request.auth!.user,
      body.password,
      body.code,
      this.requestId(response),
    );
    this.clearCookie(response);
    return { success: true, loginRequired: true };
  }
  @Public() @Get('bootstrap') async bootstrapStatus() {
    return { available: (await this.repository.userCount()) === 0 };
  }
  @Public()
  @Post('bootstrap')
  async bootstrap(
    @Body() body: BootstrapDto,
    @Headers('x-bootstrap-token') token: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.bootstrap({
      ...body,
      token: token ?? '',
      expectedToken: this.bootstrapToken,
      requestId: this.requestId(response),
    });
    return { success: true, loginRequired: true };
  }
}
