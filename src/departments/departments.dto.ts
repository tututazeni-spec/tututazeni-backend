// src/departments/departments.dto.ts
import { IsString, IsOptional, IsInt, IsBoolean, IsArray, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  parentId?: number;

  @ApiPropertyOptional({ description: 'Apenas raiz (sem pai)' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
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

  @ApiProperty({ example: 'SEDE', description: 'Tipo: SEDE | DELEGACAO | AGENCIA' })
  @IsString()
  tipo: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  departmentId?: number;
}

export class UpdateUnitDto extends PartialType(CreateUnitDto) {}

// ─── Role ─────────────────────────────────────────────────────────────────────

export class CreateRoleDto {
  @ApiProperty({ example: 'GESTOR' })
  @IsString()
  @MaxLength(60)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}

export class CreatePermissionDto {
  @ApiProperty({ example: 'read:courses' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'read' })
  @IsString()
  action: string;

  @ApiProperty({ example: 'Course' })
  @IsString()
  subject: string;

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

  @ApiPropertyOptional({ example: 'SENIOR' })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  baseSalary?: number;
}

export class UpdatePositionDto extends PartialType(CreatePositionDto) {}

// ─── Career ───────────────────────────────────────────────────────────────────

export class CreateCareerPositionDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'JUNIOR' })
  @IsString()
  level: string;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  competencies?: Array<{ competencyId: number; requiredLevel: number }>;
}
