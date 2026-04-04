import { IsString, IsOptional, IsBoolean, IsInt, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateInstructorProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() bio?: string;
  @ApiProperty() @IsString() expertiseArea!: string;
}
export class UpdateInstructorProfileDto extends PartialType(CreateInstructorProfileDto) {}

export class CreateMarketplaceCourseDto {
  @ApiProperty() @IsString() title!: string;
  @ApiProperty() @IsNumber() price!: number;
}

export class InstructorReviewDto {
  @ApiProperty() @IsInt() instructorId!: number;
  @ApiProperty() @IsInt() rating!: number;
  @ApiProperty() @IsString() comment!: string;
}

export class InstructorFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean) approved?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}