import { Max, IsOptional, IsEnum, IsString, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FunderType, FunderStatus, FunderThematicArea, FunderFundingType } from '@prisma/client';
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sector?: string;

  @ApiPropertyOptional({ enum: FunderThematicArea })
  @IsOptional()
  @IsEnum(FunderThematicArea)
  thematicArea?: FunderThematicArea;

  @ApiPropertyOptional({ enum: FunderFundingType })
  @IsOptional()
  @IsEnum(FunderFundingType)
  fundingType?: FunderFundingType;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Max(100)
  override limit?: number = 20;
}
