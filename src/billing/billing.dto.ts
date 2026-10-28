import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertPlanDto {
  @ApiProperty() @IsString() @MaxLength(80) name!: string;
  @ApiProperty() @IsNumber() @Min(0) priceMonthly!: number;
  @ApiProperty() @IsNumber() @Min(0) priceYearly!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @ApiProperty() @IsInt() @Min(1) maxUsers!: number;
  @ApiProperty() @IsInt() @Min(1) maxStorageGb!: number;
  @ApiPropertyOptional({ description: 'PermissionSubject incluídos; omitir = todos' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modules?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) trialDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class PlanCodeDto {
  @ApiProperty() @IsString() @MaxLength(40) planCode!: string;
}

export class SubscribeDto extends PlanCodeDto {
  @ApiProperty({ enum: ['MONTHLY', 'YEARLY'] })
  @IsIn(['MONTHLY', 'YEARLY'])
  interval!: 'MONTHLY' | 'YEARLY';
}

export class CancelSubscriptionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @ApiPropertyOptional({ description: 'true (omissão) = só no fim do período pago' })
  @IsOptional()
  @IsBoolean()
  atPeriodEnd?: boolean;
}

export class RegisterPaymentDto {
  @ApiProperty() @IsNumber() @Min(0.01) amount!: number;
  @ApiProperty({ enum: ['TRANSFER', 'REFERENCE', 'CASH', 'GATEWAY'] })
  @IsIn(['TRANSFER', 'REFERENCE', 'CASH', 'GATEWAY'])
  method!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) reference?: string;
}

export class PaymentFailedDto {
  @ApiProperty() @IsString() @MaxLength(300) reason!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) amount?: number;
}

export class VoidInvoiceDto {
  @ApiProperty() @IsString() @MaxLength(300) reason!: string;
}

export class FiscalUpdateDto {
  @ApiProperty({ enum: ['SUBMITTED', 'CERTIFIED'] })
  @IsIn(['SUBMITTED', 'CERTIFIED'])
  status!: 'SUBMITTED' | 'CERTIFIED';
  @ApiProperty({ description: 'Referência no software certificado AGT' })
  @IsString()
  @MaxLength(120)
  fiscalRef!: string;
}

export class AcquisitionSpendDto {
  @ApiProperty({ example: '2026-10' }) @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month!: string;
  @ApiProperty() @IsString() @MaxLength(80) channel!: string;
  @ApiProperty() @IsNumber() @Min(0) amount!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) notes?: string;
}
