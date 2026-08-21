import { IsOptional, IsEnum, IsString, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PartnerType, PartnerTier, PartnerStatus } from '@prisma/client';
import { BaseFilterDto } from '../../common/dtos/pagination.dto';

export class FilterPartnerDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: PartnerType })
  @IsOptional()
  @IsEnum(PartnerType)
  type?: PartnerType;

  @ApiPropertyOptional({ enum: PartnerTier })
  @IsOptional()
  @IsEnum(PartnerTier)
  tier?: PartnerTier;

  @ApiPropertyOptional({ enum: PartnerStatus })
  @IsOptional()
  @IsEnum(PartnerStatus)
  status?: PartnerStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assignedToId?: number;
}
