// ─── employees/employees.dto.ts ──────────────────────────────────────────────
import {
  IsString,
  IsInt,
  IsOptional,
  IsDateString,
  IsNumber,
  IsEmail,
  IsEnum,
  IsArray,
  IsBoolean,
  IsObject,
  ValidateNested,
  Min,
  Max,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType, ApiSchema } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum EmployeeStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ON_LEAVE = 'ON_LEAVE',
  TERMINATED = 'TERMINATED',
  SUSPENDED = 'SUSPENDED',
}

/**
 * Tipos de contrato de trabalho — Angola
 * Referência: Lei Geral do Trabalho, Lei n.º 7/15 de 15 de Junho
 */
export enum ContractType {
  /** Art. 12.º — Contrato por tempo indeterminado (regime geral, vínculo permanente) */
  INDEFINITE = 'INDEFINITE',

  /** Art. 13.º — Contrato a prazo certo (duração máxima 3 anos, renovável 2×) */
  FIXED_TERM = 'FIXED_TERM',

  /** Art. 14.º — Contrato a prazo incerto (obra ou serviço determinado, sem data fim precisa) */
  UNCERTAIN_TERM = 'UNCERTAIN_TERM',

  /** Art. 230.º — Contrato de aprendizagem (formação profissional + trabalho, menores de 25 anos) */
  APPRENTICESHIP = 'APPRENTICESHIP',

  /** Regime de estágio profissional (inserção no mercado de trabalho) */
  INTERNSHIP = 'INTERNSHIP',

  /** Contrato de prestação de serviços (trabalhador independente / consultor) */
  SERVICE_PROVISION = 'SERVICE_PROVISION',

  /** Cedência temporária de trabalhador por empresa de trabalho temporário */
  TEMPORARY_PLACEMENT = 'TEMPORARY_PLACEMENT',

  /** Trabalho a tempo parcial — jornada inferior à normal (Art. 103.º) */
  PART_TIME = 'PART_TIME',
}

export enum WorkMode {
  REMOTE = 'REMOTE',
  HYBRID = 'HYBRID',
  ON_SITE = 'ON_SITE',
}

export enum SeniorityLevel {
  JUNIOR = 'JUNIOR',
  MID = 'MID',
  SENIOR = 'SENIOR',
  LEAD = 'LEAD',
  MANAGER = 'MANAGER',
  DIRECTOR = 'DIRECTOR',
  C_LEVEL = 'C_LEVEL',
}

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  NON_BINARY = 'NON_BINARY',
  PREFER_NOT_TO_SAY = 'PREFER_NOT_TO_SAY',
}

export enum SkillType {
  TECHNICAL = 'TECHNICAL',
  BEHAVIORAL = 'BEHAVIORAL',
  LANGUAGE = 'LANGUAGE',
  TOOL = 'TOOL',
  CERTIFICATION = 'CERTIFICATION',
}

export enum SkillLevel {
  BEGINNER = 1,
  ELEMENTARY = 2,
  INTERMEDIATE = 3,
  ADVANCED = 4,
  EXPERT = 5,
}

export enum TimelineEventType {
  HIRED = 'HIRED',
  PROMOTED = 'PROMOTED',
  TRANSFERRED = 'TRANSFERRED',
  SALARY_CHANGE = 'SALARY_CHANGE',
  COURSE = 'COURSE',
  EVALUATION = 'EVALUATION',
  PDI = 'PDI',
  EVENT = 'EVENT',
  BADGE = 'BADGE',
  DOCUMENT = 'DOCUMENT',
  NOTE = 'NOTE',
}

export enum RequestType {
  DATA_CHANGE = 'DATA_CHANGE',
  PROMOTION = 'PROMOTION',
  TRANSFER = 'TRANSFER',
  TERMINATION = 'TERMINATION',
  LEAVE = 'LEAVE',
  BENEFIT_CHANGE = 'BENEFIT_CHANGE',
}

export enum RequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

// ─── Employee Core ─────────────────────────────────────────────────────────────

export class EmergencyContactDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() relationship!: string;
  @ApiProperty() @IsString() phone!: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
}

export class AddressDto {
  @ApiProperty() @IsString() street!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() complement?: string;
  @ApiProperty() @IsString() neighborhood!: string;
  @ApiProperty() @IsString() city!: string;
  @ApiProperty() @IsString() state!: string;
  @ApiProperty() @IsString() zipCode!: string;
  @ApiProperty() @IsString() country!: string;
}

export class CreateEmployeeDto {
  // ── Dados Pessoais
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cpf?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rg?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() birthDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(Gender) gender?: Gender;
  @ApiPropertyOptional() @IsOptional() @IsString() maritalStatus?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nationality?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EmergencyContactDto)
  emergencyContact?: EmergencyContactDto;
  @ApiPropertyOptional() @IsOptional() @IsUrl() avatarUrl?: string;

  // ── Dados Profissionais
  @ApiProperty() @IsString() role!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jobTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() area?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() team?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() managerId?: number;
  @ApiPropertyOptional() @IsOptional() @IsEnum(SeniorityLevel) seniority?: SeniorityLevel;
  @ApiPropertyOptional() @IsOptional() @IsEnum(ContractType) contractType?: ContractType;
  @ApiPropertyOptional() @IsOptional() @IsEnum(WorkMode) workMode?: WorkMode;
  @ApiPropertyOptional() @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
  @ApiProperty() @IsDateString() joinedAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() matricula?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() costCenter?: string;

  // ── Dados de RH (restritos)
  @ApiPropertyOptional() @IsOptional() @IsNumber() salary?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() salaryBand?: string;
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}

// ─── Contracts ────────────────────────────────────────────────────────────────

export class CreateContractDto {
  @ApiProperty() @IsInt() employeeId!: number;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiProperty() @IsEnum(ContractType) type!: ContractType;
  @ApiProperty() @IsString() status!: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() salary?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

// ─── Skills / Competências ────────────────────────────────────────────────────

export class CreateEmployeeSkillDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsEnum(SkillType) type!: SkillType;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class AssignSkillDto {
  @ApiProperty() @IsInt() employeeId!: number;
  @ApiProperty() @IsInt() skillId!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(5) currentLevel!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) desiredLevel?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() selfAssessed?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() managerValidated?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateSkillLevelDto {
  @ApiProperty() @IsInt() @Min(1) @Max(5) currentLevel!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) desiredLevel?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() managerValidated?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

// ─── Feedback 360 ─────────────────────────────────────────────────────────────

export class CreateFeedback360Dto {
  @ApiProperty() @IsInt() employeeId!: number;
  @ApiProperty() @IsInt() evaluatorId!: number;
  @ApiProperty() @IsString() evaluatorRole!: string;
  @ApiProperty() @IsNumber() @Min(0) @Max(10) score!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() strengths?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() improvements?: string;
  @ApiProperty() @IsString() comments!: string;
  @ApiProperty() @IsDateString() evaluatedAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cycle?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() anonymous?: boolean;
}

// ─── Career Plans ──────────────────────────────────────────────────────────────

export class CreateEmployeeCareerPlanDto {
  @ApiProperty() @IsInt() employeeId!: number;
  @ApiProperty() @IsString() title!: string;
  @ApiProperty() @IsString() description!: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() targetRole?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) progressPercent?: number;
}

// ─── PDI ──────────────────────────────────────────────────────────────────────

export class CreatePdiActionDto {
  @ApiProperty() @IsString() description!: string;
  @ApiProperty() @IsDateString() deadline!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() resourceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() resourceUrl?: string;
}

export class CreatePdiDto {
  @ApiProperty() @IsInt() employeeId!: number;
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() objective?: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePdiActionDto)
  actions?: CreatePdiActionDto[];
}

export class UpdatePdiProgressDto {
  @ApiProperty() @IsInt() @Min(0) @Max(100) progressPercent!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

// ─── Documents ────────────────────────────────────────────────────────────────

@ApiSchema({ name: 'CreateEmployeeDocumentDto' })
export class EmployeesCreateDocumentDto {
  @ApiProperty() @IsInt() employeeId!: number;
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() type!: string;
  @ApiProperty() @IsString() fileUrl!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mimeType?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() fileSize?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresSignature?: boolean;
}

// ─── Self-Service Requests ────────────────────────────────────────────────────

export class CreateSelfServiceRequestDto {
  @ApiProperty() @IsInt() employeeId!: number;
  @ApiProperty() @IsEnum(RequestType) type!: RequestType;
  @ApiProperty() @IsString() reason!: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() payload?: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) attachments?: string[];
}

export class ReviewRequestDto {
  @ApiProperty() @IsEnum(RequestStatus) status!: RequestStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() reviewNotes?: string;
  @ApiProperty() @IsInt() reviewerId!: number;
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export class CreateEmployeeAttendanceDto {
  @ApiProperty() @IsInt() employeeId!: number;
  @ApiProperty() @IsDateString() date!: string;
  @ApiProperty() @IsNumber() @Min(0) @Max(24) hoursWorked!: number;
  @ApiProperty() @IsString() status!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() checkIn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() checkOut?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export class CreateTimelineEventDto {
  @ApiProperty() @IsInt() employeeId!: number;
  @ApiProperty() @IsEnum(TimelineEventType) type!: TimelineEventType;
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() metadata?: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublic?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() occurredAt?: string;
}

// ─── Bulk Actions ─────────────────────────────────────────────────────────────

export class BulkAssignCourseDto {
  @ApiProperty({ type: [Number] }) @IsArray() @IsInt({ each: true }) employeeIds!: number[];
  @ApiProperty({ type: [Number] }) @IsArray() @IsInt({ each: true }) courseIds!: number[];
}

export class BulkUpdateStatusDto {
  @ApiProperty({ type: [Number] }) @IsArray() @IsInt({ each: true }) employeeIds!: number[];
  @ApiProperty() @IsEnum(EmployeeStatus) status!: EmployeeStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class BulkSendMessageDto {
  @ApiProperty({ type: [Number] }) @IsArray() @IsInt({ each: true }) employeeIds!: number[];
  @ApiProperty() @IsString() subject!: string;
  @ApiProperty() @IsString() message!: string;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class EmployeeFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() role?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
  @ApiPropertyOptional() @IsOptional() @IsEnum(SeniorityLevel) seniority?: SeniorityLevel;
  @ApiPropertyOptional() @IsOptional() @IsEnum(ContractType) contractType?: ContractType;
  @ApiPropertyOptional() @IsOptional() @IsEnum(WorkMode) workMode?: WorkMode;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) managerId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() joinedFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() joinedTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pdiStatus?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() skillName?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) skillLevel?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() costCenter?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() sortBy?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sortOrder?: 'asc' | 'desc';
}
