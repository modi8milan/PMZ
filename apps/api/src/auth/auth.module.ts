import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { AuthenticationGuard } from './auth.guard.js';
import { AuthorizationService } from './authorization.service.js';
import { PermissionGuard } from './permission.guard.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthService,
    AuthenticationGuard,
    AuthorizationService,
    PermissionGuard,
  ],
  exports: [
    AuthRepository,
    AuthService,
    AuthenticationGuard,
    AuthorizationService,
    PermissionGuard,
  ],
})
export class AuthModule {}
