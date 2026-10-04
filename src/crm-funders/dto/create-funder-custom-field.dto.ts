import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  IsArray,
  Length,
  Matches,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { FunderCustomFieldType } from '@prisma/client';

export class CreateFunderCustomFieldDto {
  @ApiProperty({ example: 'reporting_language', description: 'Chave única (snake_case)' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,49}$/, { message: 'key deve ser snake_case (2-50 caracteres)' })
  key: string;

  @ApiProperty({ example: 'Idioma de reporte' })
  @IsString()
  @Length(1, 100)
  label: string;

  @ApiPropertyOptional({ enum: FunderCustomFieldType, default: 'TEXT' })
  @IsOptional()
  @IsEnum(FunderCustomFieldType)
  type?: FunderCustomFieldType;

  @ApiPropertyOptional({ type: [String], description: 'Opções para SELECT / MULTI_SELECT' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

// A chave e o tipo são imutáveis: já existem valores guardados com essa forma.
export class UpdateFunderCustomFieldDto extends PartialType(
  OmitType(CreateFunderCustomFieldDto, ['key', 'type'] as const),
) {}

export class SetFunderCustomFieldValuesDto {
  @ApiProperty({
    example: { reporting_language: 'Português', audit_required: true },
    description: 'Valores por key; null remove o valor',
  })
  @IsObject()
  values: Record<string, unknown>;
}
