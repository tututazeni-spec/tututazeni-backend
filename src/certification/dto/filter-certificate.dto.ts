import { Max, IsOptional, IsEnum, IsString, IsInt, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CertificateTemplateType } from '@prisma/client';
import { BaseFilterDto } from '../../common/dtos/pagination.dto';

export class FilterCertificateDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: CertificateTemplateType })
  @IsOptional()
  @IsEnum(CertificateTemplateType)
  type?: CertificateTemplateType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isRevoked?: boolean;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Max(100)
  override limit?: number = 20;
}

export class MyCertificatesFilterDto extends BaseFilterDto {}
