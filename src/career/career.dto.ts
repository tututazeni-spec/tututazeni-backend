// src/career/career.dto.ts
import {
  IsString, IsOptional, IsInt, IsEnum, IsArray,
  IsBoolean, IsDateString, Min, Max, MaxLength, IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum CareerPathType {
  LINEAR    = 'LINEAR',
  Y_SHAPED  = 'Y_SHAPED',
  T_SHAPED  = 'T_SHAPED',
  W_SHAPED  = 'W_SHAPED',
  LATTICE   = 'LATTICE',
}

export enum VacancyType {
  PROMOTION    = 'PROMOTION',
  LATERAL      = 'LATERAL',
  GIG_PROJECT  = 'GIG_PROJECT',
  JOB_ROTATION = 'JOB_ROTATION',
  SHADOWING    = 'SHADOWING',
}

export enum VacancyStatus {
  DRAFT     = 'DRAFT',
  OPEN      = 'OPEN',
  CLOSED    = 'CLOSED',
  FILLED    = 'FILLED',
}

export enum ApplicationStatus {
  PENDING   = 'PENDING',
  REVIEWING = 'REVIEWING',
  SHORTLISTED = 'SHORTLISTED',
  REJECTED  = 'REJECTED',
  ACCEPTED  = 'ACCEPTED',
}

export enum ReadinessLevel {
  READY_NOW   = 'READY_NOW',
  READY_12M   = 'READY_12M',
  READY_24M   = 'READY_24M',
  NOT_READY   = 'NOT_READY',
}

export enum GoalTimeframe {
  SHORT_TERM  = 'SHORT_TERM',   // até 1 ano
  MEDIUM_TERM = 'MEDIUM_TERM',  // 1-3 anos
  LONG_TERM   = 'LONG_TERM',    // 3+ anos
}

// ─── Career Path ──────────────────────────────────────────────────────────────

export class CreateCareerPathDto {
  @ApiProperty({ example: 'Trilha Técnica de Engenharia' })
  @IsString() @MaxLength(150)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ enum: CareerPathType })
  @IsEnum(CareerPathType)
  type!: CareerPathType;

  @ApiPropertyOptional({ description: 'ID do departamento desta trilha' })
  @IsOptional() @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ description: 'Ativa por padrão' })
  @IsOptional() @IsBoolean()
  active?: boolean;
}

export class UpdateCareerPathDto extends PartialType(CreateCareerPathDto) {}

export class AddCareerPathStepDto {
  @ApiProperty({ description: 'ID do Position (cargo)' })
  @IsInt()
  positionId!: number;

  @ApiProperty({ description: 'Ordem na trilha (1, 2, 3…)' })
  @IsInt() @Min(1)
  order!: number;

  @ApiPropertyOptional({ description: 'Meses mínimos no cargo anterior' })
  @IsOptional() @IsInt() @Min(0)
  minMonthsRequired?: number;

  @ApiPropertyOptional({ description: 'Score mínimo de performance (1-5)' })
  @IsOptional() @IsNumber() @Min(1) @Max(5)
  minPerformanceScore?: number;

  @ApiPropertyOptional({ description: 'IDs de cursos obrigatórios para promoção' })
  @IsOptional() @IsArray() @IsInt({ each: true })
  requiredCourseIds?: number[];

  @ApiPropertyOptional({ description: 'IDs de competências obrigatórias' })
  @IsOptional() @IsArray() @IsInt({ each: true })
  requiredCompetencyIds?: number[];
}

// ─── Career Plan (Plano de Carreira Pessoal) ──────────────────────────────────

export class CreateCareerPlanDto {
  @ApiProperty({ example: 'Tornar-me Tech Lead até 2027' })
  @IsString() @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'ID do cargo alvo' })
  @IsOptional() @IsInt()
  targetPositionId?: number;

  @ApiPropertyOptional({ description: 'ID do mentor atribuído' })
  @IsOptional() @IsInt()
  mentorId?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  targetDate?: string;
}

export class UpdateCareerPlanDto extends PartialType(CreateCareerPlanDto) {
  @ApiPropertyOptional({ enum: ['DRAFT', 'ACTIVE', 'COMPLETED', 'ABANDONED'] })
  @IsOptional() @IsString()
  status?: string;
}

export class AddCareerGoalDto {
  @ApiProperty()
  @IsString() @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ enum: GoalTimeframe })
  @IsEnum(GoalTimeframe)
  timeframe!: GoalTimeframe;

  @ApiPropertyOptional({ description: 'Categoria: SKILL | EXPERIENCE | CERTIFICATION | PROMOTION' })
  @IsOptional() @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  dueDate?: string;
}

// ─── Internal Vacancy (Vaga interna) ──────────────────────────────────────────

export class CreateInternalVacancyDto {
  @ApiProperty({ example: 'Analista de Dados — Equipa de BI' })
  @IsString() @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ enum: VacancyType })
  @IsEnum(VacancyType)
  type!: VacancyType;

  @ApiPropertyOptional()
  @IsOptional() @IsInt()
  positionId?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ description: 'Data de fecho das candidaturas' })
  @IsOptional() @IsDateString()
  closingDate?: string;

  @ApiPropertyOptional({ description: 'Duração em dias (para gig projects)' })
  @IsOptional() @IsInt() @Min(1)
  durationDays?: number;

  @ApiPropertyOptional({ description: 'IDs de competências exigidas' })
  @IsOptional() @IsArray() @IsInt({ each: true })
  requiredCompetencyIds?: number[];

  @ApiPropertyOptional({ description: 'IDs de cursos exigidos' })
  @IsOptional() @IsArray() @IsInt({ each: true })
  requiredCourseIds?: number[];

  @ApiPropertyOptional({ description: 'Número máximo de vagas' })
  @IsOptional() @IsInt() @Min(1)
  slots?: number;
}

export class UpdateInternalVacancyDto extends PartialType(CreateInternalVacancyDto) {
  @ApiPropertyOptional({ enum: VacancyStatus })
  @IsOptional() @IsEnum(VacancyStatus)
  status?: VacancyStatus;
}

export class ApplyToVacancyDto {
  @ApiPropertyOptional({ description: 'Motivação / carta de apresentação' })
  @IsOptional() @IsString() @MaxLength(2000)
  motivation?: string;
}

export class UpdateApplicationStatusDto {
  @ApiProperty({ enum: ApplicationStatus })
  @IsEnum(ApplicationStatus)
  status!: ApplicationStatus;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  feedback?: string;
}

// ─── Succession ───────────────────────────────────────────────────────────────

export class CreateSuccessionPlanDto {
  @ApiProperty({ description: 'ID do cargo crítico' })
  @IsInt()
  positionId!: number;

  @ApiProperty({ description: 'ID do colaborador candidato' })
  @IsInt()
  candidateId!: number;

  @ApiProperty({ enum: ReadinessLevel })
  @IsEnum(ReadinessLevel)
  readiness!: ReadinessLevel;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(1000)
  justification?: string;

  @ApiPropertyOptional({ description: 'Data estimada de prontidão' })
  @IsOptional() @IsDateString()
  estimatedReadyDate?: string;
}

// ─── Career Goals (Objetivos pessoais) ────────────────────────────────────────

export class CareerInterestDto {
  @ApiPropertyOptional({ type: [String], description: 'Áreas de interesse' })
  @IsOptional() @IsArray() @IsString({ each: true })
  areas?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Tipos de trabalho preferidos' })
  @IsOptional() @IsArray() @IsString({ each: true })
  workStyles?: string[];

  @ApiPropertyOptional({ description: 'Cargo ou função desejada' })
  @IsOptional() @IsString()
  desiredRole?: string;

  @ApiPropertyOptional({ description: 'Aberto a mobilidade geográfica?' })
  @IsOptional() @IsBoolean()
  openToRelocation?: boolean;

  @ApiPropertyOptional({ description: 'Aberto a trabalho remoto?' })
  @IsOptional() @IsBoolean()
  openToRemote?: boolean;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class VacancyFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: VacancyType }) @IsOptional() @IsEnum(VacancyType)
  type?: VacancyType;

  @ApiPropertyOptional({ enum: VacancyStatus }) @IsOptional() @IsEnum(VacancyStatus)
  status?: VacancyStatus;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional({ description: 'Mostrar apenas vagas compatíveis com o meu perfil' })
  @IsOptional() @IsBoolean() @Type(() => Boolean)
  matchingOnly?: boolean;

  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  limit?: number;
}

export class CareerAnalyticsFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  period?: string; // YYYY

  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean)
  includeRisk?: boolean;
}