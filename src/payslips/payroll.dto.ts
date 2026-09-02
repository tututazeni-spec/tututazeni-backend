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
  IsEnum,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { ComponentType, ComponentCalcType } from '@prisma/client';
import { BaseFilterDto } from '../common/dtos/pagination.dto';
import { EmptyStringToUndefined } from '../common/transformers/empty-string-to-undefined';

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
