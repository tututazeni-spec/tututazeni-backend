// ─── performance.dto.ts ──────────────────────────────────────────────────────
import { IsInt, IsNumber, IsString, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreatePerformanceReviewDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(10) score!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
  @ApiProperty() @IsString() period!: string;
}
export class UpdatePerformanceReviewDto extends PartialType(CreatePerformanceReviewDto) {}

export class PerformanceFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() period?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}