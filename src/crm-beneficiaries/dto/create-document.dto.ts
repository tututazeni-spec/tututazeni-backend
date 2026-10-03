import { IsString, IsOptional, IsDateString, IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentValidationStatus } from '@prisma/client';

export class CreateBeneficiaryDocumentDto {
  @ApiProperty({ example: 'Bilhete de Identidade' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'ID_CARD' })
  @IsString()
  type: string;

  @ApiProperty()
  @IsString()
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
  documentNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ValidateBeneficiaryDocumentDto {
  @ApiProperty({ enum: DocumentValidationStatus })
  @IsEnum(DocumentValidationStatus)
  validationStatus: DocumentValidationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
