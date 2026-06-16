import { IsString, IsOptional, IsEnum, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SnapshotType } from '@prisma/client';

export class CreateSnapshotDto {
  @ApiProperty({ example: '2026-06' })
  @IsString()
  @Length(4, 20)
  period: string;

  @ApiPropertyOptional({ enum: SnapshotType, default: 'MONTHLY' })
  @IsOptional()
  @IsEnum(SnapshotType)
  type?: SnapshotType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
