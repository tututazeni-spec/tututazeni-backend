import { IsString, IsOptional, IsEnum, IsNumber, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CertificateTemplateType } from '@prisma/client';

export class IssueCertificateDto {
  @ApiProperty({ description: 'ID (Int) do utilizador destinatário' })
  @Type(() => Number)
  @IsInt()
  userId: number;

  @ApiProperty({ example: 'Curso de Segurança no Trabalho' })
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  programId?: string;

  @ApiPropertyOptional({ enum: CertificateTemplateType, default: 'COURSE' })
  @IsOptional()
  @IsEnum(CertificateTemplateType)
  type?: CertificateTemplateType;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;
}
