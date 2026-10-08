import { IsString, IsOptional, IsEnum, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { FunderDocumentType, FunderDocumentStatus } from '@prisma/client';
import { IsAllowedFileUrl } from '../../common/validators/is-allowed-file-url.validator';

export class CreateFunderDocumentDto {
  @ApiProperty({ enum: FunderDocumentType })
  @IsEnum(FunderDocumentType)
  type: FunderDocumentType;

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

  @ApiPropertyOptional({ enum: FunderDocumentStatus, default: 'VALID' })
  @IsOptional()
  @IsEnum(FunderDocumentStatus)
  status?: FunderDocumentStatus;

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
export class UpdateFunderDocumentDto extends PartialType(
  OmitType(CreateFunderDocumentDto, ['name', 'fileUrl', 'fileSize'] as const),
) {}

export class CreateFunderDocumentVersionDto {
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
