// src/succession/succession.dto.ts
import {
  IsInt,
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsNumber,
  IsDateString,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  ReadinessLevel,
  SuccessorPriority,
  RiskLevel,
  BusinessImpact,
  ReplacementTime,
} from '@prisma/client';

// ─── Enums ────────────────────────────────────────────────────────────────────

export { ReadinessLevel, SuccessorPriority, RiskLevel, BusinessImpact, ReplacementTime };

// ─── Critical Position ────────────────────────────────────────────────────────

export class CreateCriticalPositionDto {
  @ApiProperty({ description: 'ID da posição' })
  @IsInt()
  positionId!: number;

  @ApiProperty({ enum: BusinessImpact })
  @IsEnum(BusinessImpact)
  businessImpact!: BusinessImpact;

  @ApiProperty({ enum: ReplacementTime })
  @IsEnum(ReplacementTime)
  replacementTime!: ReplacementTime;

  @ApiProperty({ enum: RiskLevel })
  @IsEnum(RiskLevel)
  exitRisk!: RiskLevel;

  @ApiPropertyOptional({ description: 'Data prevista de saída (aposentadoria, mandato)' })
  @IsOptional()
  @IsDateString()
  expectedExitDate?: string;

  @ApiPropertyOptional({ description: 'Motivo da classificação como crítica' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  criticalReason?: string;

  @ApiPropertyOptional({ description: 'Key Person Risk — detentor de conhecimento único?' })
  @IsOptional()
  @IsBoolean()
  keyPersonRisk?: boolean;

  @ApiPropertyOptional({ description: 'Mínimo de sucessores requeridos' })
  @IsOptional()
  @IsInt()
  @Min(1)
  minSuccessorsRequired?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresDocumentation?: boolean;
}

export class UpdateCriticalPositionDto extends PartialType(CreateCriticalPositionDto) {}

// ─── Succession Plan (candidato → cargo) ─────────────────────────────────────

export class SuccessionCreateSuccessionPlanDto {
  @ApiProperty({ description: 'ID do cargo crítico' })
  @IsInt()
  criticalPositionId!: number;

  @ApiProperty({ description: 'ID do candidato/sucessor' })
  @IsInt()
  candidateId!: number;

  @ApiProperty({ enum: ReadinessLevel })
  @IsEnum(ReadinessLevel)
  readinessLevel!: ReadinessLevel;

  @ApiProperty({ enum: SuccessorPriority })
  @IsEnum(SuccessorPriority)
  priority!: SuccessorPriority;

  @ApiPropertyOptional({ description: 'Score de match manual (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  matchScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  geographicMobility?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Data prevista de prontidão' })
  @IsOptional()
  @IsDateString()
  readinessByDate?: string;
}

export class UpdateSuccessionPlanDto extends PartialType(SuccessionCreateSuccessionPlanDto) {}

// ─── Talent Pool ──────────────────────────────────────────────────────────────

export class AddToTalentPoolDto {
  @ApiProperty()
  @IsInt()
  userId!: number;

  @ApiProperty({ enum: ReadinessLevel })
  @IsEnum(ReadinessLevel)
  readinessLevel!: ReadinessLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  mentorId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  geographicMobility?: boolean;
}

// ─── PDI (Plano de Desenvolvimento Individual) ────────────────────────────────

export class GeneratePDIDto {
  @ApiProperty({ description: 'ID do plano de sucessão' })
  @IsInt()
  successionPlanId!: number;

  @ApiPropertyOptional({ type: [Number], description: 'IDs de Learning Paths recomendadas' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  learningPathIds?: number[];

  @ApiPropertyOptional({ type: [Number], description: 'IDs de cursos recomendados' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  courseIds?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  developmentGoals?: string;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class SuccessionFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  positionId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  criticalPositionId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  candidateId?: number;

  @ApiPropertyOptional({ enum: ReadinessLevel })
  @IsOptional()
  @IsEnum(ReadinessLevel)
  readinessLevel?: ReadinessLevel;

  @ApiPropertyOptional({ enum: SuccessorPriority })
  @IsOptional()
  @IsEnum(SuccessorPriority)
  priority?: SuccessorPriority;

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

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}

export class CriticalPositionFilterDto {
  @ApiPropertyOptional({ enum: BusinessImpact })
  @IsOptional()
  @IsEnum(BusinessImpact)
  businessImpact?: BusinessImpact;

  @ApiPropertyOptional({ enum: RiskLevel })
  @IsOptional()
  @IsEnum(RiskLevel)
  exitRisk?: RiskLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  // @Type(() => Boolean) coage '?withoutSuccessor=false' para true — ver
  // [[project-innova-boolean-query-filter-coercion]].
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  withoutSuccessor?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}
