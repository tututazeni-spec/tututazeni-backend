import { IsString, IsOptional, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IssueBadgeDto {
  @ApiProperty()
  @IsString()
  badgeId: string;

  @ApiProperty({ description: 'ID (Int) do utilizador destinatário' })
  @Type(() => Number)
  @IsInt()
  userId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  evidenceUrl?: string;
}
