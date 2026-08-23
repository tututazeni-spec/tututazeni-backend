import { Max, IsOptional, IsEnum, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SnapshotType } from '@prisma/client';
import { BaseFilterDto } from '../../common/dtos/pagination.dto';

export class FilterSnapshotDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: SnapshotType })
  @IsOptional()
  @IsEnum(SnapshotType)
  type?: SnapshotType;

  @ApiPropertyOptional({ default: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Max(100)
  override limit?: number = 12;
}
