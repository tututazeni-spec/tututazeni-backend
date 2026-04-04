import { IsString, IsInt, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateBadgeDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class AwardBadgeDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsInt() badgeId!: number;
}

export class AddPointsDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsInt() points!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class LeaderboardFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) unitId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}