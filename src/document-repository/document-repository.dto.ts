import { IsString, IsOptional, IsInt, IsEnum, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum DocCategory {
  POLITICA = 'POLITICA',
  MANUAL = 'MANUAL',
  PROCEDIMENTO = 'PROCEDIMENTO',
  FORMULARIO = 'FORMULARIO',
  CONTRATO = 'CONTRATO',
  REGULAMENTO = 'REGULAMENTO',
  COMUNICADO = 'COMUNICADO',
  OUTRO = 'OUTRO',
}

export enum DocAccess {
  PUBLIC = 'PUBLIC',
  DEPARTMENT = 'DEPARTMENT',
  RESTRICTED = 'RESTRICTED',
}

export class CreateDocumentDto {
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: DocCategory }) @IsEnum(DocCategory) category!: DocCategory;
  @ApiProperty({ enum: DocAccess }) @IsEnum(DocAccess) access!: DocAccess;
  @ApiProperty() @IsString() fileUrl!: string;
  @ApiProperty() @IsString() fileType!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() fileSize?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() version?: string;
}

export class UpdateDocumentDto extends PartialType(CreateDocumentDto) {}

export class DocumentFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(DocCategory) category?: DocCategory;
  @ApiPropertyOptional() @IsOptional() @IsEnum(DocAccess) access?: DocAccess;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}