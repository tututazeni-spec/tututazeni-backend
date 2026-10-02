// src/departments/departments.dto.ts
import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
  IsEnum,
  IsNumber,
  IsDateString,
  IsEmail,
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
  DepartmentStatus,
  DepartmentVisibility,
  ContractType,
} from '@prisma/client';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

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

  @ApiPropertyOptional({ example: 'RH', description: 'Sigla do departamento' })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  acronym?: string;

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

  @ApiPropertyOptional({ description: 'ID do substituto do responsável' })
  @IsOptional()
  @IsInt()
  deputyHeadId?: number;

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

  @ApiPropertyOptional({ description: 'Unidade/filial a associar (Department.unitId)' })
  @IsOptional()
  @IsInt()
  unitId?: number;

  @ApiPropertyOptional({ description: 'Orçamento anual (Kz)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  annualBudget?: number;

  @ApiPropertyOptional({ enum: DepartmentStatus, default: DepartmentStatus.ACTIVE })
  @IsOptional()
  @IsEnum(DepartmentStatus)
  status?: DepartmentStatus;

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

  @ApiPropertyOptional({ description: 'Área de negócio' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  businessArea?: string;

  @ApiPropertyOptional({ description: 'Departamento estratégico', default: false })
  @IsOptional()
  @IsBoolean()
  isStrategic?: boolean;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Número de colaboradores previsto (headcount planeado)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedEmployees?: number;

  @ApiPropertyOptional({ description: 'Contacto institucional (nome/descrição geral)' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  institutionalContact?: string;

  @ApiPropertyOptional({
    enum: DepartmentVisibility,
    default: DepartmentVisibility.DEPARTMENT_ONLY,
    description: 'Visibilidade dos dados do departamento',
  })
  @IsOptional()
  @IsEnum(DepartmentVisibility)
  dataVisibility?: DepartmentVisibility;

  @ApiPropertyOptional({
    description: 'Exige aprovação para processos deste departamento',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  approvalRequired?: boolean;

  @ApiPropertyOptional({ description: 'IDs dos aprovadores', type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  approverIds?: number[];

  @ApiPropertyOptional({ description: 'Departamento responsável por processos (ex.: RH central)' })
  @IsOptional()
  @IsInt()
  processOwnerDepartmentId?: number;
}

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {
  @ApiPropertyOptional({
    description: 'Motivo da alteração de responsável (registado no histórico quando headId muda)',
  })
  @IsOptional()
  @IsString()
  headChangeReason?: string;
}

export class DepartmentFilterDto extends BaseFilterDto {
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

  @ApiPropertyOptional({ enum: DepartmentStatus, description: 'Estado exacto (inclui ARCHIVED)' })
  @IsOptional()
  @IsEnum(DepartmentStatus)
  status?: DepartmentStatus;

  @ApiPropertyOptional({ description: 'Unidade/empresa' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  unitId?: number;

  @ApiPropertyOptional({ description: 'Responsável pelo departamento' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  headId?: number;

  @ApiPropertyOptional({ description: 'Localização (correspondência parcial)' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Criados a partir desta data (inclusive)' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'Criados até esta data (inclusive)' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;
}

export class ArchiveDepartmentDto {
  @ApiPropertyOptional({ description: 'Motivo do arquivamento/encerramento' })
  @IsOptional()
  @IsString()
  reason?: string;
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

  @ApiPropertyOptional({ description: 'Código único; auto-gerado (UNI-xxxxx) se omitido' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

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

  @ApiPropertyOptional({ description: 'Código do cargo' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

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

  @ApiPropertyOptional({ description: 'Headcount planeado (default 1)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  headcountPlanned?: number;

  @ApiPropertyOptional({
    description: 'Competências obrigatórias (IDs) — aceite mas não persistido',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  competencyIds?: number[];

  // ─── docs/modulo_departments.md Ponto 6 — Cargos & Funções ─────────────────

  @ApiPropertyOptional({ description: 'Função — distinta do nome do cargo' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  jobFunction?: string;

  @ApiPropertyOptional({ description: 'Família profissional' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  jobFamily?: string;

  @ApiPropertyOptional({ description: 'Responsabilidades do cargo' })
  @IsOptional()
  @IsString()
  responsibilities?: string;

  @ApiPropertyOptional({ description: 'Requisitos do cargo' })
  @IsOptional()
  @IsString()
  requirements?: string;

  @ApiPropertyOptional({ description: 'Formação necessária' })
  @IsOptional()
  @IsString()
  requiredTraining?: string;

  @ApiPropertyOptional({ description: 'Experiência necessária' })
  @IsOptional()
  @IsString()
  requiredExperience?: string;

  @ApiPropertyOptional({ description: 'Cargo ao qual este reporta hierarquicamente' })
  @IsOptional()
  @IsInt()
  reportsToPositionId?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  active?: boolean;
}

export class UpdatePositionDto extends PartialType(CreatePositionDto) {}

export class PositionFilterDto extends BaseFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional({ enum: PositionLevel })
  @IsOptional()
  @IsEnum(PositionLevel)
  level?: PositionLevel;

  @ApiPropertyOptional({ description: 'Família profissional' })
  @IsOptional()
  @IsString()
  jobFamily?: string;

  // @Type(() => Boolean) coage '?active=false' para true — ver
  // [[project-innova-boolean-query-filter-coercion]]. @Type(() => String) +
  // @Transform evita a coerção Boolean automática do class-transformer.
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  active?: boolean;
}

// ─── Employees (docs/modulo_departments.md Ponto 5 — Colaboradores) ────────────

export class EmployeeFilterDto extends BaseFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Departamento (inclui sub-departamentos)' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  positionId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ enum: ContractType })
  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType;

  // @Type(() => Boolean) coage '?active=false' para true — ver
  // [[project-innova-boolean-query-filter-coercion]]. @Type(() => String) +
  // @Transform evita a coerção Boolean automática do class-transformer.
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  active?: boolean;
}

// ─── Hierarquia (docs/modulo_departments.md Ponto 7) ───────────────────────────

export class HierarchyFilterDto extends BaseFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Departamento (inclui sub-departamentos)' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  positionId?: number;
}

// ─── Histórico (docs/modulo_departments.md Ponto 8) ────────────────────────────

export class HistoryFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ description: 'Filtrar por um departamento específico' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;
}

// ─── Relatórios (docs/modulo_departments.md Ponto 9) ───────────────────────────

export class ReportsFilterDto {
  @ApiPropertyOptional({ description: 'Departamento (inclui sub-departamentos)' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  unitId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  // @Type(() => Boolean) coage '?active=false' para true — ver
  // [[project-innova-boolean-query-filter-coercion]]. @Type(() => String) +
  // @Transform evita a coerção Boolean automática do class-transformer.
  @ApiPropertyOptional({ description: 'Estado do colaborador' })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Admissões/saídas a partir desta data (ISO)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Admissões/saídas até esta data (ISO)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

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
