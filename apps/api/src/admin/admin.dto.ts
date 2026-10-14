import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString() @MinLength(3) @MaxLength(100) username!: string;
  @IsString() @MinLength(2) @MaxLength(160) fullName!: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) roleIds!: string[];
}
export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) fullName?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds?: string[];
}
export class CreateRoleDto {
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{2,79}$/) code!: string;
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @IsBoolean() mfaRequired?: boolean;
}
export class RolePermissionsDto {
  @IsArray() @ArrayUnique() @IsString({ each: true }) permissions!: string[];
}
export class UpdateRoleDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() mfaRequired?: boolean;
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
}
