import { IsOptional, IsEnum, IsString, IsBoolean, Transform } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PathLevel } from '@prisma/client';
import { BaseFilterDto } from '../../common/dtos/pagination.dto';

export class FilterPathDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: PathLevel })
  @IsOptional()
  @IsEnum(PathLevel)
  level?: PathLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isFeatured?: boolean;
}
