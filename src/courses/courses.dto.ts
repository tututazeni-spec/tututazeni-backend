import {
  IsString, IsOptional, IsBoolean, IsInt, Min, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateCourseDto {
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() workloadHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mandatory?: boolean;
}

export class UpdateCourseDto extends PartialType(CreateCourseDto) {}

export class CourseFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean) mandatory?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean) active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}

export class CourseFeedbackDto {
  @ApiProperty() @IsString() comment!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(5) rating!: number;
}