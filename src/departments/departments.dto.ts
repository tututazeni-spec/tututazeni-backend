// src/departments/departments.dto.ts
import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
  IsEnum,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  UnitType,
  PositionLevel,
  PermissionAction,
  PermissionSubject,
  SeniorityLevel,
} from '@prisma/client';

// ─── Department ───────────────────────────────────────────────────────────────

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Recursos Humanos' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'RH-001', description: 'Código único do departamento' })
  @IsString()
  @MaxLength(30)
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'ID do departamento pai (hierarquia)' })
  @IsOptional()
  @IsInt()
  parentId?: number;

  @ApiPropertyOptional({ description: 'ID do gestor/responsável' })
  @IsOptional()
  @IsInt()
  headId?: number;

  @ApiPropertyOptional({ description: 'Cor do departamento (hex)' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'Ícone identificativo' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ description: 'Centro de custo associado' })
  @IsOptional()
  @IsString()
  costCenter?: string;

  @ApiPropertyOptional({ description: 'Orçamento de formação (Kz)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  trainingBudget?: number;
}

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {}

export class DepartmentFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  // @Type(() => Boolean) coage '?active=false' para true — ver
  // [[project-innova-boolean-query-filter-coercion]]. @Type(() => String) +
  // @Transform evita a coerção Boolean automática do class-transformer.
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  parentId?: number;

  // @Type(() => Boolean) coage '?rootOnly=false' para true — ver
  // [[project-innova-boolean-query-filter-coercion]]. @Type(() => String) +
  // @Transform evita a coerção Boolean automática do class-transformer.
  @ApiPropertyOptional({ description: 'Apenas raiz (sem pai)' })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  rootOnly?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}

// ─── Member Transfer ──────────────────────────────────────────────────────────

export class TransferMemberDto {
  @ApiProperty({ description: 'ID do utilizador a transferir' })
  @IsInt()
  userId: number;

  @ApiProperty({ description: 'ID do departamento de destino' })
  @IsInt()
  targetDepartmentId: number;

  @ApiPropertyOptional({ description: 'Motivo da transferência' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class BulkTransferDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  userIds: number[];

  @ApiProperty()
  @IsInt()
  targetDepartmentId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

// ─── Unit ─────────────────────────────────────────────────────────────────────

export class CreateUnitDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ enum: UnitType, example: UnitType.BRANCH })
  @IsEnum(UnitType)
  type: UnitType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ description: 'Departamento a associar a esta unidade' })
  @IsOptional()
  @IsInt()
  departmentId?: number;
}

export class UpdateUnitDto extends PartialType(CreateUnitDto) {}

// ─── Role ─────────────────────────────────────────────────────────────────────

export class DepartmentsCreateRoleDto {
  @ApiProperty({ example: 'GESTOR' })
  @IsString()
  @MaxLength(60)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateRoleDto extends PartialType(DepartmentsCreateRoleDto) {}

export class DepartmentsCreatePermissionDto {
  @ApiProperty({ example: 'read:courses' })
  @IsString()
  name: string;

  @ApiProperty({ enum: PermissionAction, example: PermissionAction.VIEW })
  @IsEnum(PermissionAction)
  action: PermissionAction;

  @ApiProperty({ enum: PermissionSubject, example: PermissionSubject.LMS })
  @IsEnum(PermissionSubject)
  subject: PermissionSubject;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  roleId?: number;
}

// ─── Position ─────────────────────────────────────────────────────────────────

export class CreatePositionDto {
  @ApiProperty({ example: 'Engenheiro de Software Sénior' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ enum: PositionLevel, example: PositionLevel.SENIOR })
  @IsOptional()
  @IsEnum(PositionLevel)
  level?: PositionLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  salaryMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  salaryMax?: number;
}

export class UpdatePositionDto extends PartialType(CreatePositionDto) {}

// ─── Career ───────────────────────────────────────────────────────────────────

export class CreateCareerPositionDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty({ enum: SeniorityLevel, example: SeniorityLevel.JUNIOR })
  @IsEnum(SeniorityLevel)
  level: SeniorityLevel;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  competencies?: Array<{ competencyId: number; requiredLevel: number }>;
}
