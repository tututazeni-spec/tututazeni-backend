import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsEnum,
  IsArray,
  IsNumber,
  Min,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum DepartmentStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum PositionLevel {
  INTERN = 'INTERN',
  JUNIOR = 'JUNIOR',
  MID = 'MID',
  SENIOR = 'SENIOR',
  LEAD = 'LEAD',
  MANAGER = 'MANAGER',
  DIRECTOR = 'DIRECTOR',
  EXECUTIVE = 'EXECUTIVE',
}

export enum ReportingType {
  DIRECT = 'DIRECT',
  MATRIX = 'MATRIX',
  DOTTED = 'DOTTED',
}

export enum OrgChangeType {
  PROMOTION = 'PROMOTION',
  TRANSFER = 'TRANSFER',
  RESTRUCTURE = 'RESTRUCTURE',
  HIRE = 'HIRE',
  TERMINATION = 'TERMINATION',
  MANAGER_CHANGE = 'MANAGER_CHANGE',
}

export enum UnitType {
  HEADQUARTERS = 'HEADQUARTERS',
  BRANCH = 'BRANCH',
  REMOTE = 'REMOTE',
  PROJECT = 'PROJECT',
}

// ─── Department ───────────────────────────────────────────────────────────────

export class CreateOrgDepartmentDto {
  @ApiProperty({ example: 'Recursos Humanos' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'RH' })
  @IsString()
  @MaxLength(20)
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Departamento pai (hierarquia)' })
  @IsOptional()
  @IsInt()
  parentId?: number;

  @ApiPropertyOptional({ description: 'ID do gestor responsável' })
  @IsOptional()
  @IsInt()
  headId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  unitId?: number;

  @ApiPropertyOptional({ description: 'Centro de custo' })
  @IsOptional()
  @IsString()
  costCenter?: string;

  @ApiPropertyOptional({ description: 'Orçamento anual (Kz)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  annualBudget?: number;

  @ApiPropertyOptional({ enum: DepartmentStatus, default: DepartmentStatus.ACTIVE })
  @IsOptional()
  @IsEnum(DepartmentStatus)
  status?: DepartmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;
}

export class UpdateOrgDepartmentDto extends PartialType(CreateOrgDepartmentDto) {}

// ─── Position ─────────────────────────────────────────────────────────────────

export class CreateOrgPositionDto {
  @ApiProperty({ example: 'Analista de Recursos Humanos' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ description: 'Código do cargo' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: PositionLevel })
  @IsEnum(PositionLevel)
  level!: PositionLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ description: 'Competências obrigatórias (IDs)' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  competencyIds?: number[];

  @ApiPropertyOptional({ description: 'Salário mínimo' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryMin?: number;

  @ApiPropertyOptional({ description: 'Salário máximo' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryMax?: number;

  @ApiPropertyOptional({ description: 'Headcount planeado' })
  @IsOptional()
  @IsInt()
  @Min(0)
  headcountPlanned?: number;
}

export class UpdateOrgPositionDto extends PartialType(CreateOrgPositionDto) {}

// ─── Unit (Filial/Escritório) ─────────────────────────────────────────────────

export class CreateOrgUnitDto {
  @ApiProperty({ example: 'Sede Luanda' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'SEDE-LDA' })
  @IsString()
  @MaxLength(20)
  code!: string;

  @ApiProperty({ enum: UnitType })
  @IsEnum(UnitType)
  type!: UnitType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Luanda' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Angola' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'Africa/Luanda' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;
}

export class UpdateOrgUnitDto extends PartialType(CreateOrgUnitDto) {}

// ─── Org Change (audit de movimentações) ─────────────────────────────────────

export class RecordOrgChangeDto {
  @ApiProperty()
  @IsInt()
  userId!: number;

  @ApiProperty({ enum: OrgChangeType })
  @IsEnum(OrgChangeType)
  changeType!: OrgChangeType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  fromDepartmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  toDepartmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  fromPositionId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  toPositionId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  fromManagerId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  toManagerId?: number;

  @ApiProperty({ description: 'Data efectiva da mudança' })
  @IsDateString()
  effectiveDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class OrganizationDepartmentFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: DepartmentStatus })
  @IsOptional()
  @IsEnum(DepartmentStatus)
  status?: DepartmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  parentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  unitId?: number;

  @ApiPropertyOptional()
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

export class PositionFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: PositionLevel })
  @IsOptional()
  @IsEnum(PositionLevel)
  level?: PositionLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

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

export class OrgChartFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  rootUserId?: number;

  @ApiPropertyOptional({ description: 'Profundidade máxima', default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  depth?: number;
}
