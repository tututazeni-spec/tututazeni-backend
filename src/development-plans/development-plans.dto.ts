import { IsString, IsOptional, IsInt, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateDevelopmentPlanDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsString() goal!: string;
}

export class UpdateDevelopmentPlanDto extends PartialType(CreateDevelopmentPlanDto) {
  @ApiPropertyOptional() @IsOptional() @IsEnum(['ACTIVE', 'COMPLETED', 'CANCELLED']) status?: string;
}

export class DevelopmentPlanFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}