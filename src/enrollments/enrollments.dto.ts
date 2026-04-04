import { IsInt, IsEnum, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum EnrollmentStatus { EM_ANDAMENTO = 'EM_ANDAMENTO', CONCLUIDO = 'CONCLUIDO', CANCELADO = 'CANCELADO' }

export class CreateEnrollmentDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsInt() courseId!: number;
}

export class BulkEnrollDto {
  @ApiProperty({ type: [Number] }) @IsArray() userIds!: number[];
  @ApiProperty() @IsInt() courseId!: number;
}

export class UpdateEnrollmentStatusDto {
  @ApiProperty({ enum: EnrollmentStatus }) @IsEnum(EnrollmentStatus) status!: EnrollmentStatus;
}

export class EnrollmentFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() courseId?: number;
  @ApiPropertyOptional() @IsOptional() @IsEnum(EnrollmentStatus) status?: EnrollmentStatus;
  @ApiPropertyOptional() @IsOptional() @IsInt() page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() limit?: number;
}