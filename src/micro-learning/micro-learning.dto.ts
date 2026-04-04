import { IsString, IsBoolean, IsOptional, IsInt, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateMicroLearningDto {
  @ApiProperty() @IsString() title!: string;
  @ApiProperty() @IsString() content!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateMicroLearningDto extends PartialType(CreateMicroLearningDto) {}

export class DispatchMicroLearningDto {
  @ApiProperty() @IsInt() microLearningId!: number;
  @ApiProperty({ type: [Number] }) @IsArray() userIds!: number[];
}

export class MicroLearningFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean) active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}