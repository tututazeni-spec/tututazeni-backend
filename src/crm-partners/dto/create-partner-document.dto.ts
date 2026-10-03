import { IsString, IsOptional, IsEnum, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { PartnerDocumentType, PartnerDocumentStatus } from '@prisma/client';
import { IsAllowedFileUrl } from '../../common/validators/is-allowed-file-url.validator';

export class CreatePartnerDocumentDto {
  @ApiProperty({ enum: PartnerDocumentType })
  @IsEnum(PartnerDocumentType)
  type: PartnerDocumentType;

  @ApiProperty()
  @IsString()
  name: string;

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
  @IsDateString()
  documentDate?: string;

  @ApiPropertyOptional({ description: 'Data de validade do documento' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({ enum: PartnerDocumentStatus, default: 'VALID' })
  @IsOptional()
  @IsEnum(PartnerDocumentStatus)
  status?: PartnerDocumentStatus;

  @ApiPropertyOptional({ description: 'User.id do responsável' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  responsibleId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// Nome e ficheiro só mudam através de nova versão (POST :documentId/versions)
export class UpdatePartnerDocumentDto extends PartialType(
  OmitType(CreatePartnerDocumentDto, ['name', 'fileUrl', 'fileSize'] as const),
) {}

export class CreatePartnerDocumentVersionDto {
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
  @IsDateString()
  documentDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
