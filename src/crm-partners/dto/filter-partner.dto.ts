import { IsOptional, IsEnum, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PartnerType, PartnerTier, PartnerStatus } from '@prisma/client';

export class FilterPartnerDto {
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

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
