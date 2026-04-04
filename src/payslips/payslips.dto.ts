// src/payslips/payslips.dto.ts
import { IsInt, IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum PayslipStatus { DRAFT = 'DRAFT', ISSUED = 'ISSUED', ACKNOWLEDGED = 'ACKNOWLEDGED' }

export class CreatePayslipDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty({ example: '2026-04' }) @IsString() period!: string;
  @ApiProperty() @IsNumber() baseSalary!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() bonuses?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() allowances?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() overtime?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() incomeTax?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() socialSecurity?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() otherDeductions?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
export class UpdatePayslipDto extends PartialType(CreatePayslipDto) {}

export class PayslipFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() period?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(PayslipStatus) status?: PayslipStatus;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}