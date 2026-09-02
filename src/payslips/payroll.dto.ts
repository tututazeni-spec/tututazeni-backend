// src/payslips/payroll.dto.ts
import { IsString, IsOptional, IsInt, IsArray, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
