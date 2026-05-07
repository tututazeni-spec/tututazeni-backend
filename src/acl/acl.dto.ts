// src/acl/acl.dto.ts
import {
  IsString, IsOptional, IsInt, IsEnum, IsArray,
  IsBoolean, MaxLength, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────

export enum PermissionAction {
  VIEW    = 'VIEW',
  CREATE  = 'CREATE',
  UPDATE  = 'UPDATE',
  DELETE  = 'DELETE',
  APPROVE = 'APPROVE',
  EXPORT  = 'EXPORT',
  EXECUTE = 'EXECUTE',
  ALL     = '*',
}

export enum PermissionSubject {
  DASHBOARD       = 'DASHBOARD',
  REPORTS         = 'REPORTS',
  USERS           = 'USERS',
  ROLES           = 'ROLES',
  LMS             = 'LMS',
  PERFORMANCE     = 'PERFORMANCE',
  ENGAGEMENT      = 'ENGAGEMENT',
  TALENT          = 'TALENT',
  EVALUATION      = 'EVALUATION',
  CONTENT_LIBRARY = 'CONTENT_LIBRARY',
  AVATAR_TRAINING = 'AVATAR_TRAINING',
  ROI_IMPACT      = 'ROI_IMPACT',
  HISTORY         = 'HISTORY',
  PAYROLL         = 'PAYROLL',
  SENSITIVE_DATA  = 'SENSITIVE_DATA',
  ACL             = 'ACL',
  HR              = 'HR',
}

export enum PolicyConditionType {
  DEPARTMENT  = 'DEPARTMENT',
  ROLE        = 'ROLE',
  OWNER       = 'OWNER',
  TIME        = 'TIME',
  IP          = 'IP',
  MANAGER_OF  = 'MANAGER_OF',
}

// ─── Permission DTOs ──────────────────────────────────────────────

export class CreatePermissionDto {
  @ApiProperty()         @IsString() @MaxLength(100) name!: string;
  @ApiProperty({ enum: PermissionAction })  @IsEnum(PermissionAction)  action!: PermissionAction;
  @ApiProperty({ enum: PermissionSubject }) @IsEnum(PermissionSubject) subject!: PermissionSubject;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sensitive?: boolean;
}

export class BulkAssignPermissionsDto {
  @ApiProperty() @IsInt() roleId!: number;
  @ApiProperty({ type: [Number] }) @IsArray() @IsInt({ each: true }) permissionIds!: number[];
}

// ─── Role DTOs ────────────────────────────────────────────────────

export class CreateRoleDto {
  @ApiProperty()          @IsString() @MaxLength(100) name!: string;
  @ApiPropertyOptional()  @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional()  @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional()  @IsOptional() @IsInt() @Min(0) priority?: number;
  @ApiPropertyOptional()  @IsOptional() @IsInt() parentRoleId?: number;
}

export class CloneRoleDto {
  @ApiProperty() @IsString() newName!: string;
}

// ─── Policy DTOs ──────────────────────────────────────────────────

export class CreatePolicyDto {
  @ApiProperty()          @IsString() @MaxLength(200) name!: string;
  @ApiPropertyOptional()  @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: PermissionSubject }) @IsOptional() @IsEnum(PermissionSubject) subject?: PermissionSubject;
  @ApiPropertyOptional({ enum: PermissionAction })  @IsOptional() @IsEnum(PermissionAction)  action?: PermissionAction;
  @ApiProperty()          @IsString() condition!: string;      // JSON
  @ApiProperty()          @IsString() effect!: 'ALLOW' | 'DENY';
  @ApiPropertyOptional()  @IsOptional() @IsInt() @Min(0) priority?: number;
  @ApiPropertyOptional()  @IsOptional() @IsBoolean() requiresJustification?: boolean;
}

// ─── Check DTOs ───────────────────────────────────────────────────

export class CheckPermissionDto {
  @ApiProperty() @IsInt()    userId!: number;
  @ApiProperty({ enum: PermissionAction })  @IsEnum(PermissionAction)  action!: PermissionAction;
  @ApiProperty({ enum: PermissionSubject }) @IsEnum(PermissionSubject) subject!: PermissionSubject;
  @ApiPropertyOptional() @IsOptional() context?: Record<string, any>;
}

export class AssignRoleToUserDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsInt() roleId!: number;
}

// ─── Audit Filter ─────────────────────────────────────────────────

export class AclAuditFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() action?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional({ default: 1 })  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @ApiPropertyOptional({ default: 30 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number) limit?: number;
}
