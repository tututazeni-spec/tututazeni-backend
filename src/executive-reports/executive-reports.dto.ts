import { IsString, IsInt, IsOptional, IsNumber, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ExecutiveMetricDto {
  @ApiProperty() @IsString() label!: string;
  @ApiPropertyOptional() label2?: string;
  @ApiProperty() @IsNumber() value!: number;
}

export class CreateExecutiveReportDto {
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() departmentId?: number;
  @ApiProperty({ enum: ['PDF'] }) @IsEnum(['PDF']) format!: 'PDF';
  @ApiProperty({ type: [ExecutiveMetricDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => ExecutiveMetricDto)
  metrics!: ExecutiveMetricDto[];
}

export class ReportFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}