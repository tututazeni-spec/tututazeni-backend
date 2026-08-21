import { IsOptional, IsEnum, IsString, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BeneficiaryType, BeneficiaryStatus, AngolaProvince } from '@prisma/client';
import { BaseFilterDto } from '../../common/dtos/pagination.dto';

export class FilterBeneficiaryDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: BeneficiaryType })
  @IsOptional()
  @IsEnum(BeneficiaryType)
  type?: BeneficiaryType;

  @ApiPropertyOptional({ enum: BeneficiaryStatus })
  @IsOptional()
  @IsEnum(BeneficiaryStatus)
  status?: BeneficiaryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: AngolaProvince })
  @IsOptional()
  @IsEnum(AngolaProvince)
  province?: AngolaProvince;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assignedToId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
