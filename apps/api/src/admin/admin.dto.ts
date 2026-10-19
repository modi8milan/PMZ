import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString() @MinLength(3) @MaxLength(100) username!: string;
  @IsString() @MinLength(2) @MaxLength(160) fullName!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds!: string[];
  @IsString() @Matches(/\S/) @MaxLength(500) reason!: string;
}
export class ProcessResetRequestDto {
  @IsIn(['ISSUE', 'REJECT']) action!: 'ISSUE' | 'REJECT';
  @IsString() @Matches(/\S/) @MaxLength(500) reason!: string;
}
export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) fullName?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds?: string[];
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(500) reason?: string;
}
export class CreateRoleDto {
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{2,79}$/) code!: string;
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() mfaRequired?: boolean;
  @IsArray() @ArrayUnique() @IsString({ each: true }) permissions!: string[];
  @IsString() @Matches(/\S/) @MaxLength(500) reason!: string;
}
export class RolePermissionsDto {
  @IsArray() @ArrayUnique() @IsString({ each: true }) permissions!: string[];
  @IsString() @Matches(/\S/) @MaxLength(500) reason!: string;
}
export class UpdateRoleDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() mfaRequired?: boolean;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions?: string[];
  @IsString() @Matches(/\S/) @MaxLength(500) reason!: string;
}
export class CreateDepartmentDto {
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,39}$/) code!: string;
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
}
export class UpdateDepartmentDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class ReauthenticateDto {
  @IsString() @MinLength(1) @MaxLength(256) currentPassword!: string;
  @IsOptional() @IsString() @Matches(/^\d{6}$/) authenticatorCode?: string;
  @IsOptional() @IsString() @MaxLength(32) recoveryCode?: string;
  @IsString() @Matches(/\S/) @MaxLength(500) reason!: string;
}
export class ReasonDto {
  @IsString() @Matches(/\S/) @MaxLength(500) reason!: string;
}
export class AuditEventsQueryDto {
  @IsOptional() @IsDateString({ strict: true }) from?: string;
  @IsOptional() @IsDateString({ strict: true }) to?: string;
  @IsOptional() @IsString() @MaxLength(160) user?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
