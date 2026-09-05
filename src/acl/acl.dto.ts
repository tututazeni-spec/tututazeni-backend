// src/acl/acl.dto.ts
import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsArray,
  IsBoolean,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PermissionAction, PermissionSubject } from '@prisma/client';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

// ─── Enums ────────────────────────────────────────────────────────

export { PermissionAction, PermissionSubject };

// ─── Permission DTOs ──────────────────────────────────────────────

export class CreatePermissionDto {
  @ApiProperty() @IsString() @MaxLength(100) name!: string;
  @ApiProperty({ enum: PermissionAction }) @IsEnum(PermissionAction) action!: PermissionAction;
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
  @ApiProperty() @IsString() @MaxLength(100) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() parentRoleId?: number;
}

export class CloneRoleDto {
  @ApiProperty() @IsString() newName!: string;
}

// Fase D: os DTOs de ABAC (CreatePolicyDto, CheckPermissionDto) e AccessPolicyRow
// foram removidos com o motor de políticas.

export class AssignRoleToUserDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsInt() roleId!: number;
}

// ─── Audit Filter ─────────────────────────────────────────────────

export class AclAuditFilterDto extends BaseFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() action?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
}
