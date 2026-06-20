// src/roles-permissions/roles-permissions.dto.ts
import { IsString, IsOptional, IsArray, IsInt, IsBoolean, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Role DTOs ────────────────────────────────────────────────────

export class RolesPermissionsCreateRoleDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Código único do role (gerado automaticamente se omitido)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @ApiPropertyOptional({
    default: 0,
    description: 'Prioridade — valor mais alto = maior prioridade',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priority?: number;

  @ApiPropertyOptional({
    default: false,
    description: 'Roles de sistema não podem ser removidos ou renomeados',
  })
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;

  @ApiPropertyOptional({
    type: [Number],
    description: 'IDs de permissões a atribuir ao criar o role',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  permissionIds?: number[];
}

export class RolesPermissionsUpdateRoleDto extends PartialType(RolesPermissionsCreateRoleDto) {}

export class RolesPermissionsCloneRoleDto {
  @ApiProperty({ description: 'Nome do role clonado (tem de ser único)' })
  @IsString()
  @MaxLength(100)
  newName!: string;
}

// ─── Assignment DTOs ──────────────────────────────────────────────

export class BulkAssignRoleDto {
  @ApiProperty({ description: 'ID do role a atribuir' })
  @IsInt()
  roleId!: number;

  @ApiProperty({ type: [Number], description: 'IDs dos utilizadores que receberão o role' })
  @IsArray()
  @IsInt({ each: true })
  userIds!: number[];
}

// ─── Permission Set DTOs ──────────────────────────────────────────

export class SetPermissionsDto {
  @ApiProperty({ type: [Number], description: 'IDs de permissões' })
  @IsArray()
  @IsInt({ each: true })
  permissionIds!: number[];
}

// ─── Simulator DTO ────────────────────────────────────────────────

export class SimulatePermissionDto {
  @ApiProperty({ description: 'ID do utilizador a testar' })
  @IsInt()
  userId!: number;

  @ApiProperty({ example: 'reports', description: 'Recurso/subject a verificar' })
  @IsString()
  resource!: string;

  @ApiProperty({ example: 'export', description: 'Acção a verificar' })
  @IsString()
  action!: string;
}

// ─── Position Template DTO ────────────────────────────────────────

export class RoleTemplateDto {
  @ApiProperty({ example: 'Analista de RH', description: 'Nome do cargo' })
  @IsString()
  @MaxLength(100)
  positionName!: string;

  @ApiProperty({ description: 'ID do role a aplicar automaticamente ao cargo' })
  @IsInt()
  roleId!: number;

  @ApiPropertyOptional({ description: 'ID da posição no schema (se existir)' })
  @IsOptional()
  @IsInt()
  positionId?: number;
}
