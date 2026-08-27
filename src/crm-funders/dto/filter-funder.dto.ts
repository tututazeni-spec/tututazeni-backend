import { Max, IsOptional, IsEnum, IsString, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FunderType, FunderStatus } from '@prisma/client';
import { BaseFilterDto } from '../../common/dtos/pagination.dto';

export class FilterFunderDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: FunderType })
  @IsOptional()
  @IsEnum(FunderType)
  type?: FunderType;

  @ApiPropertyOptional({ enum: FunderStatus })
  @IsOptional()
  @IsEnum(FunderStatus)
  status?: FunderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assignedToId?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Max(100)
  override limit?: number = 20;
}
