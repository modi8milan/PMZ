import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @IsString() @MinLength(1) @MaxLength(100) username!: string;
  @IsString() @MinLength(1) @MaxLength(256) password!: string;
  @IsOptional() @IsString() @MaxLength(32) mfaCode?: string;
  @IsOptional() @IsString() @Matches(/^\d{6}$/) authenticatorCode?: string;
  @IsOptional() @IsString() @MaxLength(32) recoveryCode?: string;
}
export class ChangePasswordDto {
  @IsString() @MaxLength(256) currentPassword!: string;
  @IsString() @MinLength(12) @MaxLength(256) newPassword!: string;
  @IsOptional() @IsString() @Matches(/^\d{6}$/) authenticatorCode?: string;
  @IsOptional() @IsString() @MaxLength(32) recoveryCode?: string;
}
export class RecoveryRequestDto {
  @IsEmail() @MaxLength(254) email!: string;
}
export class ResetPasswordDto {
  @IsString({ message: 'User ID is required.' })
  @MinLength(1, { message: 'User ID is required.' })
  @MaxLength(100, { message: 'User ID is invalid.' })
  username!: string;

  @IsString({ message: 'Setup token is required.' })
  @Matches(/^(?:\d{10}|[A-Za-z0-9_-]{20,256})$/, {
    message: 'Setup token must contain exactly 10 digits.',
  })
  token!: string;

  @IsString({ message: 'New password is required.' })
  @MinLength(12, {
    message: 'New password must be at least 12 characters.',
  })
  @MaxLength(256, { message: 'New password is too long.' })
  newPassword!: string;
}
export class MfaEnrollDto {
  @IsString() @MaxLength(256) password!: string;
}
export class MfaConfirmDto {
  @IsString() @Matches(/^\d{6}$/) code!: string;
}
export class MfaDisableDto {
  @IsString() @MaxLength(256) password!: string;
  @IsOptional() @IsString() @Matches(/^\d{6}$/) authenticatorCode?: string;
  @IsOptional() @IsString() @MaxLength(32) recoveryCode?: string;
  @IsString() @Matches(/\S/) @MaxLength(500) reason!: string;
}
export class BootstrapDto {
  @IsString() @MinLength(3) @MaxLength(100) username!: string;
  @IsString() @MinLength(2) @MaxLength(160) fullName!: string;
  @IsString() @MinLength(12) @MaxLength(256) password!: string;
}
