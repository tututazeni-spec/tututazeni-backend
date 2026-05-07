// src/payslips/payslips.dto.ts
import {
  IsInt, IsString, IsOptional, IsNumber,
  IsEnum, IsArray, IsBoolean, Min, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum PayslipStatus {
  DRAFT        = 'DRAFT',
  ISSUED       = 'ISSUED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  DISPUTED     = 'DISPUTED',
}

// ─── Criação individual ──────────────────────────────────────────────────────
export class CreatePayslipDto {
  @ApiProperty({ description: 'ID do colaborador' })
  @IsInt()
  userId: number;

  @ApiProperty({ example: '2026-04', description: 'Período YYYY-MM' })
  @IsString()
  period: string;

  @ApiProperty({ description: 'Data de pagamento' })
  @IsString()
  paymentDate: string;

  // ── Remunerações ─────────────────────────────────────────────────────────
  @ApiProperty({ description: 'Salário base (Kz)' })
  @IsNumber()
  baseSalary: number;

  @ApiPropertyOptional({ description: 'Subsídio de alimentação' })
  @IsOptional() @IsNumber()
  mealAllowance?: number;

  @ApiPropertyOptional({ description: 'Subsídio de férias' })
  @IsOptional() @IsNumber()
  vacationAllowance?: number;

  @ApiPropertyOptional({ description: 'Subsídio de Natal' })
  @IsOptional() @IsNumber()
  christmasAllowance?: number;

  @ApiPropertyOptional({ description: 'Horas extras (valor total)' })
  @IsOptional() @IsNumber()
  overtime?: number;

  @ApiPropertyOptional({ description: 'Prémios / Comissões' })
  @IsOptional() @IsNumber()
  bonuses?: number;

  @ApiPropertyOptional({ description: 'Outros subsídios' })
  @IsOptional() @IsNumber()
  otherAllowances?: number;

  // ── Deduções (override automático) ───────────────────────────────────────
  @ApiPropertyOptional({ description: 'IRT manual (sobrepõe cálculo automático)' })
  @IsOptional() @IsNumber()
  irtOverride?: number;

  @ApiPropertyOptional({ description: 'INSS colaborador manual' })
  @IsOptional() @IsNumber()
  inssOverride?: number;

  @ApiPropertyOptional({ description: 'Seguro de saúde' })
  @IsOptional() @IsNumber()
  healthInsurance?: number;

  @ApiPropertyOptional({ description: 'Dedução de empréstimo' })
  @IsOptional() @IsNumber()
  loanDeduction?: number;

  @ApiPropertyOptional({ description: 'Adiantamento salarial' })
  @IsOptional() @IsNumber()
  advanceDeduction?: number;

  @ApiPropertyOptional({ description: 'Outras deduções' })
  @IsOptional() @IsNumber()
  otherDeductions?: number;

  @ApiPropertyOptional({ description: 'Notas internas (não visíveis ao colaborador)' })
  @IsOptional() @IsString()
  notes?: string;
}

export class UpdatePayslipDto extends PartialType(CreatePayslipDto) {}

// ─── Filtros ─────────────────────────────────────────────────────────────────
export class PayslipFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  userId?: number;

  @ApiPropertyOptional({ example: '2026-04' }) @IsOptional() @IsString()
  period?: string;

  @ApiPropertyOptional({ example: '2026' }) @IsOptional() @IsString()
  year?: string;

  @ApiPropertyOptional({ enum: PayslipStatus }) @IsOptional() @IsEnum(PayslipStatus)
  status?: PayslipStatus;

  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 }) @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number)
  limit?: number;
}

// ─── Bulk create ─────────────────────────────────────────────────────────────
export class BulkCreatePayslipDto {
  @ApiProperty({ example: '2026-04' })
  @IsString()
  period: string;

  @ApiProperty({ example: '2026-04-25' })
  @IsString()
  paymentDate: string;

  @ApiPropertyOptional({ description: 'IDs específicos (vazio = todos activos)' })
  @IsOptional() @IsArray() @IsInt({ each: true })
  userIds?: number[];

  @ApiPropertyOptional({ description: 'Publicar imediatamente após criar' })
  @IsOptional() @IsBoolean()
  issueImmediately?: boolean;
}

// ─── Simulação ────────────────────────────────────────────────────────────────
export class SimulatePayslipDto {
  @ApiProperty() @IsNumber() baseSalary: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() overtime?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() bonuses?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() mealAllowance?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() otherAllowances?: number;
}

// ─── Disputa ─────────────────────────────────────────────────────────────────
export class CreateDisputeDto {
  @ApiProperty({ description: 'Motivo da disputa' })
  @IsString()
  reason: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  details?: string;
}