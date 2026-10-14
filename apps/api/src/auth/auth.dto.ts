import {
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
}
export class ChangePasswordDto {
  @IsString() @MaxLength(256) currentPassword!: string;
  @IsString() @MinLength(12) @MaxLength(256) newPassword!: string;
}
export class RecoveryRequestDto {
  @IsString() @MinLength(1) @MaxLength(100) username!: string;
}
export class ResetPasswordDto {
  @IsString() @MinLength(20) @MaxLength(256) token!: string;
  @IsString() @MinLength(12) @MaxLength(256) newPassword!: string;
}
export class MfaEnrollDto {
  @IsString() @MaxLength(256) password!: string;
}
export class MfaConfirmDto {
  @IsString() @Matches(/^\d{6}$/) code!: string;
}
export class MfaDisableDto {
  @IsString() @MaxLength(256) password!: string;
  @IsString() @MaxLength(32) code!: string;
}
export class BootstrapDto {
  @IsString() @MinLength(3) @MaxLength(100) username!: string;
  @IsString() @MinLength(2) @MaxLength(160) fullName!: string;
  @IsString() @MinLength(12) @MaxLength(256) password!: string;
}
