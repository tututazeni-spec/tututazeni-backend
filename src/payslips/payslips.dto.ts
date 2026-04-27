// ─── src/payslips/payslips.dto.ts ────────────────────────────────────────────
import {
  IsInt, IsString, IsOptional, IsNumber, IsEnum,
  IsBoolean, IsArray, IsObject, ValidateNested,
  Min, Max, IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum PayslipStatus {
  DRAFT       = 'DRAFT',        // Em processamento
  PENDING     = 'PENDING',      // Aguarda aprovação
  APPROVED    = 'APPROVED',     // Aprovado, ainda não publicado
  ISSUED      = 'ISSUED',       // Publicado ao colaborador
  ACKNOWLEDGED= 'ACKNOWLEDGED', // Colaborador confirmou recepção
  CANCELLED   = 'CANCELLED',    // Cancelado / reprocessado
}

export enum PayrollRunStatus {
  DRAFT      = 'DRAFT',
  PROCESSING = 'PROCESSING',
  CALCULATED = 'CALCULATED',
  APPROVED   = 'APPROVED',
  PUBLISHED  = 'PUBLISHED',
  CANCELLED  = 'CANCELLED',
}

export enum ComponentType {
  EARNING   = 'EARNING',
  DEDUCTION = 'DEDUCTION',
}

export enum ComponentCalcType {
  FIXED      = 'FIXED',      // Valor fixo
  PERCENT    = 'PERCENT',    // % do salário base
  FORMULA    = 'FORMULA',    // Fórmula dinâmica
  TABLE      = 'TABLE',      // Tabela progressiva (ex: IRT)
}

// ─── Country Config / Tax Rules ───────────────────────────────────────────────

export class TaxBracketDto {
  @ApiProperty() @IsNumber() @Min(0) min!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() max?: number; // null = sem limite superior
  @ApiProperty() @IsNumber() @Min(0) @Max(1) rate!: number;     // 0.07 = 7%
  @ApiPropertyOptional() @IsOptional() @IsNumber() deduction?: number; // dedução fixe para o escalão
}

export class SocialSecurityConfigDto {
  @ApiProperty() @IsNumber() employeeRate!: number;   // ex: 0.03
  @ApiProperty() @IsNumber() employerRate!: number;   // ex: 0.08
  @ApiPropertyOptional() @IsOptional() @IsNumber() ceiling?: number; // teto máximo de incidência
}

export class CreateCountryConfigDto {
  @ApiProperty() @IsString() countryCode!: string;     // AO, PT, BR...
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() currency!: string;        // AOA, EUR, BRL
  @ApiProperty() @IsString() locale!: string;          // pt-AO, pt-PT
  @ApiProperty() @IsInt() taxYear!: number;
  @ApiProperty() @IsNumber() minimumWage!: number;

  // IRT / Income Tax
  @ApiProperty({ type: [TaxBracketDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => TaxBracketDto)
  irtBrackets!: TaxBracketDto[];

  @ApiProperty() @IsObject() @ValidateNested() @Type(() => SocialSecurityConfigDto)
  socialSecurity!: SocialSecurityConfigDto;

  @ApiPropertyOptional() @IsOptional() @IsNumber() healthInsuranceRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() unionFeeRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() guaranteeFundRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ─── Salary Components ────────────────────────────────────────────────────────

export class CreateSalaryComponentDto {
  @ApiProperty() @IsString() code!: string;             // BASE_SALARY, FOOD_ALLOWANCE, IRT...
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsEnum(ComponentType) type!: ComponentType;
  @ApiProperty() @IsEnum(ComponentCalcType) calcType!: ComponentCalcType;
  @ApiPropertyOptional() @IsOptional() @IsNumber() fixedValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() rate?: number;        // % como decimal 0.03
  @ApiPropertyOptional() @IsOptional() @IsString() formula?: string;     // expressão avaliável
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isTaxable?: boolean; // incide IRT?
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isMandatory?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() order?: number;           // ordem no recibo
  @ApiProperty() @IsBoolean() active!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() countryCode?: string;  // null = global
}

// ─── Employee Compensation ────────────────────────────────────────────────────

export class CompensationComponentDto {
  @ApiProperty() @IsString() componentCode!: string;
  @ApiProperty() @IsNumber() value!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() override?: boolean; // sobrepõe cálculo automático
}

export class CreateEmployeeCompensationDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsNumber() baseSalary!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() effectiveFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() effectiveTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => CompensationComponentDto) components?: CompensationComponentDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() iban?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accountNumber?: string;
}

// ─── Payroll Run ──────────────────────────────────────────────────────────────

export class CreatePayrollRunDto {
  @ApiProperty({ example: '2026-04' }) @IsString() period!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsInt({ each: true }) userIds?: number[];
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class PayrollInputDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() overtimeHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() bonusAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() absenceDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() advanceDeduction?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => CompensationComponentDto) extraComponents?: CompensationComponentDto[];
}

export class ProcessPayrollDto {
  @ApiProperty() @IsInt() runId!: number;
  @ApiPropertyOptional({ type: [PayrollInputDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PayrollInputDto)
  inputs?: PayrollInputDto[];
}

export class SimulatePayrollDto {
  @ApiProperty() @IsNumber() baseSalary!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() bonusAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() foodAllowance?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() transportAllowance?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() overtimeHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() advanceDeduction?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() taxYear?: number;
}

// ─── Payslip ──────────────────────────────────────────────────────────────────

export class CreatePayslipDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsString() period!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() runId?: number;
  @ApiProperty() @IsNumber() baseSalary!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() grossSalary?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() netSalary?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() totalDeductions?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() totalEarnings?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() incomeTax?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() socialSecurity?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() employerSocialSecurity?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() otherDeductions?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() countryCode?: string;
}

export class UpdatePayslipDto extends PartialType(CreatePayslipDto) {}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class PayslipFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() period?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(PayslipStatus) status?: PayslipStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) runId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}

export class PayrollRunFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() period?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(PayrollRunStatus) status?: PayrollRunStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}