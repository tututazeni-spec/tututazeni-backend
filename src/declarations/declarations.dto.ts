// ─── src/declarations/declarations.dto.ts ────────────────────────────────────
import {
  IsString,
  IsInt,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsObject,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum DocumentRequestStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  GENERATED = 'GENERATED',
  ISSUED = 'ISSUED',
  EXPIRED = 'EXPIRED',
}

export enum WorkDeclStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export enum WorkDeclType {
  ONBOARDING = 'ONBOARDING',
  PERIODIC = 'PERIODIC',
  EVENT = 'EVENT',
  RESIGNATION = 'RESIGNATION',
  EXIT_INTERVIEW = 'EXIT_INTERVIEW',
  DIVERSITY = 'DIVERSITY',
  COMPLIANCE = 'COMPLIANCE',
  GENERAL = 'GENERAL',
}

export enum FieldType {
  BOOLEAN = 'BOOLEAN',
  TEXT = 'TEXT',
  TEXTAREA = 'TEXTAREA',
  NUMBER = 'NUMBER',
  DATE = 'DATE',
  SELECT = 'SELECT',
  MULTI_SELECT = 'MULTI_SELECT',
  UPLOAD = 'UPLOAD',
  SIGNATURE = 'SIGNATURE',
}

export enum PurposeCategory {
  FINANCIAL = 'FINANCIAL',
  LEGAL = 'LEGAL',
  PERSONAL = 'PERSONAL',
  GOVERNMENT = 'GOVERNMENT',
  OTHER = 'OTHER',
}

export enum TemplateLanguage {
  PT = 'PT',
  EN = 'EN',
  FR = 'FR',
}

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 1 — DECLARATION DOCUMENTS
// ══════════════════════════════════════════════════════════════════════════════

// ─── Declaration Purposes ────────────────────────────────────────────────────

export class CreateDeclarationPurposeDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsEnum(PurposeCategory) category!: PurposeCategory;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresApproval?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export class DeclarationsCreateTemplateDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() purposeId?: number;
  @ApiProperty() @IsEnum(TemplateLanguage) language!: TemplateLanguage;
  @ApiProperty() @IsString() content!: string; // HTML com {{placeholders}}
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) variables?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresApproval?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoGenerate?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() validDays?: number; // validade do doc gerado
  @ApiProperty() @IsBoolean() active!: boolean;
}

export class DeclarationsUpdateTemplateDto extends PartialType(DeclarationsCreateTemplateDto) {}

// ─── Document Requests ────────────────────────────────────────────────────────

export class CreateDocumentRequestDto {
  @ApiProperty() @IsInt() templateId!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() purposeId?: number;
  @ApiPropertyOptional() @IsOptional() @IsEnum(TemplateLanguage) language?: TemplateLanguage;
  @ApiPropertyOptional() @IsOptional() @IsString() addressedTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() observations?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() saveAsDraft?: boolean;
  // Dados dinâmicos extra (sobrepõem variáveis automáticas)
  @ApiPropertyOptional() @IsOptional() @IsObject() extraVariables?: Record<string, string>;
}

export class ApproveDocumentRequestDto {
  @ApiProperty() @IsBoolean() approved!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

// ─── Document Request Filters ──────────────────────────────────────────────

export class DocumentRequestFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) templateId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) purposeId?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(DocumentRequestStatus)
  status?: DocumentRequestStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 2 — WORK DECLARATIONS
// ══════════════════════════════════════════════════════════════════════════════

// ─── Question / Field ─────────────────────────────────────────────────────────

export class DeclarationQuestionDto {
  @ApiProperty() @IsString() key!: string; // identificador único no form
  @ApiProperty() @IsString() label!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() helpText?: string;
  @ApiProperty() @IsEnum(FieldType) fieldType!: FieldType;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() required?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() conditionalKey?: string; // mostrar se...
  @ApiPropertyOptional() @IsOptional() conditionalValue?: any; // ...este campo = este valor
  @ApiPropertyOptional() @IsOptional() @IsInt() order?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() placeholder?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() validationRegex?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptedFileTypes?: string[];
}

// ─── Work Declaration Forms ───────────────────────────────────────────────────

export class CreateWorkDeclFormDto {
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsEnum(WorkDeclType) type!: WorkDeclType;
  @ApiPropertyOptional() @IsOptional() @IsString() periodicity?: string; // ONCE | ANNUAL | MONTHLY
  @ApiPropertyOptional() @IsOptional() @IsDateString() validFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mandatory?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresDigitalSignature?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  // Público-alvo
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetDepartments?: string[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) targetRoles?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() targetAllEmployees?: boolean;
  // Questions
  @ApiProperty({ type: [DeclarationQuestionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeclarationQuestionDto)
  questions!: DeclarationQuestionDto[];
}

export class UpdateWorkDeclFormDto extends PartialType(CreateWorkDeclFormDto) {}

// ─── Submission ───────────────────────────────────────────────────────────────

export class SubmitAnswerDto {
  @ApiProperty() @IsString() key!: string;
  @ApiProperty() value!: any;
}

export class SubmitWorkDeclDto {
  @ApiProperty() @IsInt() formId!: number;
  @ApiProperty({ type: [SubmitAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitAnswerDto)
  answers!: SubmitAnswerDto[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() saveAsDraft?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() signature?: string; // base64 assinatura
  @ApiPropertyOptional() @IsOptional() @IsString() consentToken?: string; // 2FA / TOTP
}

export class ReviewWorkDeclDto {
  @ApiProperty() @IsBoolean() approved!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  correctionFields?: string[];
}

export class BulkApproveWorkDeclDto {
  @ApiProperty({ type: [Number] }) @IsArray() @IsInt({ each: true }) submissionIds!: number[];
  @ApiProperty() @IsBoolean() approved!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

// ─── Work Decl Filters ────────────────────────────────────────────────────────

export class WorkDeclFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) formId?: number;
  @ApiPropertyOptional() @IsOptional() @IsEnum(WorkDeclType) type?: WorkDeclType;
  @ApiPropertyOptional() @IsOptional() @IsEnum(WorkDeclStatus) status?: WorkDeclStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}
