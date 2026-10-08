import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsInt,
  IsBoolean,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PartnerAgreementType, PartnerAgreementStatus } from '@prisma/client';
import { IsAllowedFileUrl } from '../../common/validators/is-allowed-file-url.validator';

export class CreatePartnerAgreementDto {
  @ApiProperty({ enum: PartnerAgreementType })
  @IsEnum(PartnerAgreementType)
  type: PartnerAgreementType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  signedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;

  @ApiPropertyOptional({ description: 'Responsável interno (User.id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  responsibleId?: number;

  @ApiPropertyOptional({ description: 'Responsável do parceiro' })
  @IsOptional()
  @IsString()
  partnerRepresentative?: string;

  @ApiPropertyOptional({ enum: PartnerAgreementStatus, default: 'DRAFTING' })
  @IsOptional()
  @IsEnum(PartnerAgreementStatus)
  status?: PartnerAgreementStatus;

  @ApiPropertyOptional({ description: 'Valor do acordo, se aplicável' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value?: number;

  @ApiPropertyOptional({ default: 'AOA' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mainConditions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePartnerAgreementDto extends PartialType(CreatePartnerAgreementDto) {}

export class CreateAgreementVersionDto {
  @ApiProperty()
  @IsString()
  fileName: string;

  @ApiProperty()
  @IsString()
  @IsAllowedFileUrl()
  fileUrl: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fileSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
