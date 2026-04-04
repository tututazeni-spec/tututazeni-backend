import { IsInt, IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum DeclarationType {
  COMPROVATIVO_TRABALHO   = 'COMPROVATIVO_TRABALHO',
  DECLARACAO_RENDIMENTOS  = 'DECLARACAO_RENDIMENTOS',
  CARTA_RECOMENDACAO      = 'CARTA_RECOMENDACAO',
  DECLARACAO_FUNCOES      = 'DECLARACAO_FUNCOES',
  COMPROVATIVO_VENCIMENTO = 'COMPROVATIVO_VENCIMENTO',
}

export enum DeclarationStatus {
  PENDING   = 'PENDING',
  GENERATED = 'GENERATED',
  ISSUED    = 'ISSUED',
}

export class RequestDeclarationDto {
  @ApiProperty({ enum: DeclarationType }) @IsEnum(DeclarationType) type!: DeclarationType;
  @ApiPropertyOptional() @IsOptional() @IsString() purpose?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() addressedTo?: string;
}

export class DeclarationFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsEnum(DeclarationType) type?: DeclarationType;
  @ApiPropertyOptional() @IsOptional() @IsEnum(DeclarationStatus) status?: DeclarationStatus;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}