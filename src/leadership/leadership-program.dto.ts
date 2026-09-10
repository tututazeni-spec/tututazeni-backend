import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsEnum,
  IsArray,
  IsNumber,
  IsObject,
  IsDateString,
  Min,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  LeadershipProgramLevel,
  LeadershipProgramType,
  LeadershipCorporateLevel,
  LeadershipSessionFrequency,
  SessionModality,
  ProgramStatus,
  LeadershipTargetingScope,
  LeadershipCriterionSource,
  LeadershipObjectiveType,
  LeadershipContentType,
  LeadershipMethodologyType,
  LeadershipAdvisorRole,
  ParticipantStatus,
} from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// DTOs do agregado LeadershipProgram — ciclo de vida seguro (Task 2).
//
// Ficam neste ficheiro (e não em leadership.dto.ts) porque a Task 2 introduz o
// serviço write-owner dedicado. `leadership.dto.ts` deixa de os exportar; o
// controller importa daqui.
// ─────────────────────────────────────────────────────────────────────────────

export class CreateLeadershipProgramDto {
  @ApiProperty({ example: 'LDR-2026-001', description: 'Código único e estável do programa' })
  @IsString()
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: 'Programa Líderes do Futuro 2026' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: LeadershipProgramLevel })
  @IsEnum(LeadershipProgramLevel)
  level!: LeadershipProgramLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Objectivo geral do programa' })
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional({ enum: LeadershipProgramType, default: LeadershipProgramType.DEVELOPMENT })
  @IsOptional()
  @IsEnum(LeadershipProgramType)
  type?: LeadershipProgramType;

  @ApiPropertyOptional({ enum: LeadershipCorporateLevel })
  @IsOptional()
  @IsEnum(LeadershipCorporateLevel)
  corporateLevel?: LeadershipCorporateLevel;

  // Informativo apenas. `create()` IGNORA este campo — um programa nasce sempre
  // em `DRAFT`; para o mover é preciso `PATCH .../transition` (máquina de
  // estados). Mantido no DTO para retrocompatibilidade do payload de criação.
  @ApiPropertyOptional({
    enum: ProgramStatus,
    default: ProgramStatus.DRAFT,
    description: 'Ignorado na criação (nasce sempre DRAFT). Use PATCH .../transition.',
  })
  @IsOptional()
  @IsEnum(ProgramStatus)
  status?: ProgramStatus;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional({ description: 'Responsável pelo programa (User.id)' })
  @IsOptional()
  @IsInt()
  responsibleId?: number;

  @ApiPropertyOptional({ description: 'Departamento dono do programa (Department.id)' })
  @IsOptional()
  @IsInt()
  departmentId?: number;

  // ─── Planeamento ────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  selectionStartDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  selectionEndDate?: string;

  @ApiPropertyOptional({ description: 'Duração em semanas' })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationWeeks?: number;

  @ApiPropertyOptional({ description: 'Carga horária total' })
  @IsOptional()
  @IsInt()
  @Min(0)
  workloadHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  totalSessions?: number;

  @ApiPropertyOptional({ enum: LeadershipSessionFrequency })
  @IsOptional()
  @IsEnum(LeadershipSessionFrequency)
  sessionFrequency?: LeadershipSessionFrequency;

  @ApiPropertyOptional({ enum: SessionModality, default: SessionModality.PRESENTIAL })
  @IsOptional()
  @IsEnum(SessionModality)
  modality?: SessionModality;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  capacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minParticipants?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  schedule?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  calendarNotes?: string;

  // ─── Selecção e conclusão ───────────────────────────────────────
  @ApiPropertyOptional({ description: 'Pontuação mínima de liderança para acesso' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  minLeadershipScore?: number;

  @ApiPropertyOptional({ description: 'Taxa mínima de presença (%)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minAttendanceRate?: number;

  @ApiPropertyOptional({ description: 'Nota final mínima (%)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minFinalScore?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requireFinalProject?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requireAllContents?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  completionCriteria?: string;

  // ─── Certificação ───────────────────────────────────────────────
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  certificationEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  certificateTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  certificateValidityDays?: number;

  @ApiPropertyOptional({ description: 'CertificateTemplate.id (cuid)' })
  @IsOptional()
  @IsString()
  certificateTemplateId?: string;

  // ─── Conteúdo canónico associado ────────────────────────────────
  @ApiPropertyOptional({ description: 'Trilha de Aprendizagem associada' })
  @IsOptional()
  @IsInt()
  learningPathId?: number;
}

// `code` é imutável depois de criado. `status` NÃO é editável por aqui — as
// mudanças de estado passam exclusivamente por `PATCH .../transition`
// (máquina de estados). Ambos omitidos do DTO de actualização.
export class UpdateLeadershipProgramDto extends PartialType(
  OmitType(CreateLeadershipProgramDto, ['code', 'status'] as const),
) {}

// ─── Transição de estado ─────────────────────────────────────────────────────

export class TransitionProgramDto {
  @ApiProperty({ enum: ProgramStatus, description: 'Estado alvo da transição' })
  @IsEnum(ProgramStatus)
  status!: ProgramStatus;
}

// ─── Configuração do programa (replace-all) ──────────────────────────────────
// Forma leve. A validação profunda (existência de refs canónicas, somatório de
// pesos = 100 quando activos) é o corpo da Task 4.

export class ProgramObjectiveInput {
  @ApiProperty()
  @IsString()
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: LeadershipObjectiveType })
  @IsOptional()
  @IsEnum(LeadershipObjectiveType)
  type?: LeadershipObjectiveType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  indicator?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  seq?: number;
}

export class ProgramTargetingInput {
  @ApiProperty({ enum: LeadershipTargetingScope })
  @IsEnum(LeadershipTargetingScope)
  scope!: LeadershipTargetingScope;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  include?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  roleId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  positionId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  unitId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  jobFamily?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  minValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class ProgramSelectionCriterionInput {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: LeadershipCriterionSource })
  @IsEnum(LeadershipCriterionSource)
  source!: LeadershipCriterionSource;

  @ApiProperty({ description: 'Peso de elegibilidade' })
  @IsNumber()
  @Min(0)
  @Max(100)
  weight!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  minScore?: number;

  @ApiPropertyOptional({ description: 'Preenchido quando source = COMPETENCY_ASSESSMENT' })
  @IsOptional()
  @IsInt()
  competencyId?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  seq?: number;
}

export class ProgramCompetencyInput {
  @ApiProperty({ description: 'Competency.id canónico' })
  @IsInt()
  competencyId!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  targetLevel!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  baselineLevel?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  behavioralIndicators?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  seq?: number;
}

export class ProgramContentInput {
  @ApiProperty({ enum: LeadershipContentType })
  @IsEnum(LeadershipContentType)
  contentType!: LeadershipContentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  learningPathId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  microLearningId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  assessmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  seq?: number;
}

export class ProgramMethodologyInput {
  @ApiProperty({ enum: LeadershipMethodologyType })
  @IsEnum(LeadershipMethodologyType)
  type!: LeadershipMethodologyType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Peso da metodologia' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  hours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sessions?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  seq?: number;
}

export class ProgramAdvisorInput {
  @ApiProperty({ description: 'User.id do acompanhante' })
  @IsInt()
  userId!: number;

  @ApiProperty({ enum: LeadershipAdvisorRole })
  @IsEnum(LeadershipAdvisorRole)
  role!: LeadershipAdvisorRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  focusArea?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

// ─── Elegibilidade e selecção de candidatos (Task 3) ─────────────────────────

export class RecalculateEligibilityDto {
  @ApiPropertyOptional({
    description:
      'Valores manuais 0-100 por nome do critério (apenas para critérios source=MANUAL).',
    example: { Entrevista: 85 },
  })
  @IsOptional()
  @IsObject()
  manualValues?: Record<string, number>;
}

export class ParticipantSelectionStatusDto {
  @ApiProperty({
    enum: ParticipantStatus,
    description:
      'Estado alvo na máquina de selecção (CANDIDATE→SELECTED→INVITED→ENROLLED→IN_PROGRESS→COMPLETED|WITHDRAWN|FAILED; REJECTED/CANCELLED).',
  })
  @IsEnum(ParticipantStatus)
  status!: ParticipantStatus;
}

export class ReplaceProgramConfigurationDto {
  @ApiPropertyOptional({ type: [ProgramObjectiveInput] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgramObjectiveInput)
  objectives?: ProgramObjectiveInput[];

  @ApiPropertyOptional({ type: [ProgramTargetingInput] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgramTargetingInput)
  targeting?: ProgramTargetingInput[];

  @ApiPropertyOptional({ type: [ProgramSelectionCriterionInput] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgramSelectionCriterionInput)
  selectionCriteria?: ProgramSelectionCriterionInput[];

  @ApiPropertyOptional({ type: [ProgramCompetencyInput] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgramCompetencyInput)
  competencies?: ProgramCompetencyInput[];

  @ApiPropertyOptional({ type: [ProgramContentInput] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgramContentInput)
  contents?: ProgramContentInput[];

  @ApiPropertyOptional({ type: [ProgramMethodologyInput] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgramMethodologyInput)
  methodologies?: ProgramMethodologyInput[];

  @ApiPropertyOptional({ type: [ProgramAdvisorInput] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgramAdvisorInput)
  advisors?: ProgramAdvisorInput[];
}
