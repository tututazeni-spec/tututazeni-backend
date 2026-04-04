import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateCompetencyDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class UpdateCompetencyDto extends PartialType(CreateCompetencyDto) {}

export class UpsertUserCompetencyDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsInt() competencyId!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(5) level!: number;
}

export class CompetencyFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}