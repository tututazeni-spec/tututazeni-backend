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
  IsEmail,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { DepartmentStatus, PositionLevel, OrgChangeType, UnitType } from '@prisma/client';

// ─── Enums ────────────────────────────────────────────────────────────────────

export { DepartmentStatus, PositionLevel, OrgChangeType, UnitType };

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

  @ApiPropertyOptional({ description: 'ID do gestor directo do departamento' })
  @IsOptional()
  @IsInt()
  directManagerId?: number;

  @ApiPropertyOptional({ description: 'Número máximo de colaboradores' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxEmployees?: number;

  @ApiPropertyOptional({ description: 'Data de início de funcionamento' })
  @IsOptional()
  @IsDateString()
  operationalStartDate?: string;

  @ApiPropertyOptional({ description: 'E-mail institucional do departamento' })
  @IsOptional()
  @IsEmail()
  institutionalEmail?: string;

  @ApiPropertyOptional({ description: 'Telefone/ramal do departamento' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phoneExtension?: string;

  @ApiPropertyOptional({ description: 'Localização (ex.: edifício/site)' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  location?: string;

  @ApiPropertyOptional({ description: 'Localização física detalhada (piso, sala, morada)' })
  @IsOptional()
  @IsString()
  physicalLocation?: string;

  @ApiPropertyOptional({ description: 'Objectivo do departamento' })
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional({ description: 'Principais responsabilidades' })
  @IsOptional()
  @IsString()
  mainResponsibilities?: string;

  @ApiPropertyOptional({ description: 'Área funcional' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  functionalArea?: string;

  @ApiPropertyOptional({ description: 'Departamento estratégico', default: false })
  @IsOptional()
  @IsBoolean()
  isStrategic?: boolean;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  notes?: string;
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
