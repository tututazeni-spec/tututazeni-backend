// src/payslips/payroll.dto.ts
import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsNumber,
  Min,
  ValidateIf,
  IsBoolean,
  IsDateString,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { ComponentType, ComponentCalcType } from '@prisma/client';
import { BaseFilterDto } from '../common/dtos/pagination.dto';
import { EmptyStringToUndefined } from '../common/transformers/empty-string-to-undefined';

export class PayrollRunOptionsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeNewEmployees?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeAbsences?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeOvertime?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeSubsidies?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includePrizes?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeBonuses?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() applyDeductions?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() calculateInss?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() calculateIrt?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() applyFaults?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() applyDiscounts?: boolean;
}

export class CreatePayrollRunDto {
  @ApiProperty({ example: '2026-09' })
  @IsString()
  period: string;

  @ApiPropertyOptional({ example: 'Mensais' })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  payGroup?: string;

  @ApiPropertyOptional({ example: 'AO' })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  taxYear?: number;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  departmentIds?: number[];

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  userIds?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Data prevista de pagamento' })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsDateString()
  expectedPaymentDate?: string;

  @ApiPropertyOptional({ type: PayrollRunOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PayrollRunOptionsDto)
  options?: PayrollRunOptionsDto;
}

export class PayrollRunFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ example: '2026-09' })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  payGroup?: string;
}

export class CompensationListFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ description: 'Pesquisa por nome ou nº de colaborador' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional({ example: 'AO' })
  @IsOptional()
  @IsString()
  countryCode?: string;
}

export class RejectRunDto {
  @ApiProperty()
  @IsString()
  reason: string;
}

export class CancelRunDto {
  @ApiProperty()
  @IsString()
  reason: string;
}

export class RecalcPayslipInputsDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) absenceDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) overtimeHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) bonusAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) advanceDeduction?: number;
}

export class SalaryComponentFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: ComponentType })
  @IsOptional()
  @IsEnum(ComponentType)
  type?: ComponentType;

  // @Type(() => String) + @Transform evita a coerção Boolean automática do
  // class-transformer que coage '?active=false' para true — ver
  // [[project-innova-boolean-query-filter-coercion]].
  @ApiPropertyOptional({ example: 'true' })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ example: 'AO' })
  @IsOptional()
  @IsString()
  countryCode?: string;
}

export class CreateSalaryComponentDto {
  @ApiProperty({ example: 'BASE' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'Salário Base' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ComponentType })
  @IsEnum(ComponentType)
  type: ComponentType;

  @ApiProperty({ enum: ComponentCalcType })
  @IsEnum(ComponentCalcType)
  calcType: ComponentCalcType;

  @ApiPropertyOptional({ description: 'Obrigatório quando calcType = FIXED' })
  @ValidateIf(o => o.calcType === 'FIXED')
  @IsNumber()
  fixedValue?: number;

  @ApiPropertyOptional({ description: 'Obrigatório quando calcType = PERCENT' })
  @ValidateIf(o => o.calcType === 'PERCENT')
  @IsNumber()
  rate?: number;

  @ApiPropertyOptional({ description: 'Obrigatório quando calcType = FORMULA' })
  @ValidateIf(o => o.calcType === 'FORMULA')
  @IsString()
  formula?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isTaxable?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  order?: number;

  @ApiPropertyOptional({ example: 'AO' })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  countryCode?: string;
}

export class UpdateSalaryComponentDto extends PartialType(
  OmitType(CreateSalaryComponentDto, ['code'] as const),
) {}

export class CompensationComponentItemDto {
  @ApiProperty({ example: 'TRANSPORT' })
  @IsString()
  componentCode: string;

  @ApiProperty({ example: 15000 })
  @IsNumber()
  value: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  override?: boolean;
}

export class CreateEmployeeCompensationDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Type(() => Number)
  userId: number;

  @ApiProperty({ example: 130000 })
  @IsNumber()
  @Min(0)
  baseSalary: number;

  @ApiPropertyOptional({ example: 'AO' })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ example: 'BAI' })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ example: 'AO06004400006729503010102' })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  iban?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ example: 12000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  foodAllowance?: number;

  @ApiPropertyOptional({ example: 15000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  transportAllowance?: number;
}

export class UpdateEmployeeCompensationDto extends PartialType(
  OmitType(CreateEmployeeCompensationDto, ['userId'] as const),
) {}

export class UpsertCompensationComponentsDto {
  @ApiProperty({ type: [CompensationComponentItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompensationComponentItemDto)
  items: CompensationComponentItemDto[];
}

// ─── Insights / Relatórios (docs/payroll.md §3, §5, §9) ─────────────────────

export class PayrollEmployeesFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ description: 'Pesquisa por nome ou nº de colaborador' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;
}

export class PayrollReportFilterDto {
  @ApiPropertyOptional({ example: '2026-09' })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @ApiPropertyOptional({ example: 9 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  month?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  unitId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  positionId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class SocialSecurityConfigDto {
  @ApiProperty({ example: 0.03 })
  @IsNumber()
  @Min(0)
  employeeRate: number;

  @ApiProperty({ example: 0.08 })
  @IsNumber()
  @Min(0)
  employerRate: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  ceiling?: number | null;
}

export class IrtBracketDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  min: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  max?: number | null;

  @ApiProperty({ example: 0.1 })
  @IsNumber()
  @Min(0)
  rate: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  deduction?: number | null;
}

export class UpsertTaxConfigDto {
  @ApiProperty({ example: 2026 })
  @IsInt()
  taxYear: number;

  @ApiPropertyOptional({ example: 'AO' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  minimumWage: number;

  @ApiProperty({ type: SocialSecurityConfigDto })
  @ValidateNested()
  @Type(() => SocialSecurityConfigDto)
  socialSecurity: SocialSecurityConfigDto;

  @ApiProperty({ type: [IrtBracketDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IrtBracketDto)
  irtBrackets: IrtBracketDto[];
}

// ─── Pagamentos / Fecho (docs/payroll.md §7, §8) ────────────────────────────

export const PAYMENT_STATUSES = [
  'PENDING',
  'PREPARED',
  'SENT_TO_BANK',
  'PROCESSED',
  'PAID',
  'FAILED',
  'CANCELLED',
] as const;

export class CreatePayrollPaymentDto {
  @ApiProperty()
  @IsInt()
  runId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  paymentAccount?: string;

  @ApiPropertyOptional({ example: '2026-09-28' })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  expectedDate?: string;
}

export class UpdatePaymentStatusDto {
  @ApiProperty({ enum: PAYMENT_STATUSES })
  @IsEnum(PAYMENT_STATUSES)
  status: (typeof PAYMENT_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  errorMessage?: string;

  @ApiPropertyOptional({ example: '2026-09-28' })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  effectiveDate?: string;
}
