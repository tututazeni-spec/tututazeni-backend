import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CertificateTemplateType } from '@prisma/client';

export class CreateTemplateDto {
  @ApiProperty({ example: 'Certificado de Conclusão de Curso' })
  @IsString()
  @Length(2, 150)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: CertificateTemplateType, default: 'COURSE' })
  @IsOptional()
  @IsEnum(CertificateTemplateType)
  type?: CertificateTemplateType;

  @ApiProperty({ description: 'HTML com {{recipientName}}, {{title}}, {{date}}' })
  @IsString()
  html: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cssStyle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  signatureUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  signatoryName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  signatoryTitle?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Dias de validade (vazio = não expira)' })
  @IsOptional()
  @IsInt()
  validityDays?: number;
}
