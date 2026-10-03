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
import { PartnerCustomFieldType } from '@prisma/client';

export class CreatePartnerCustomFieldDto {
  @ApiProperty({ example: 'certification_type', description: 'Chave única (snake_case)' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,49}$/, { message: 'key deve ser snake_case (2-50 caracteres)' })
  key: string;

  @ApiProperty({ example: 'Tipo de certificação' })
  @IsString()
  @Length(1, 100)
  label: string;

  @ApiPropertyOptional({ enum: PartnerCustomFieldType, default: 'TEXT' })
  @IsOptional()
  @IsEnum(PartnerCustomFieldType)
  type?: PartnerCustomFieldType;

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
export class UpdatePartnerCustomFieldDto extends PartialType(
  OmitType(CreatePartnerCustomFieldDto, ['key', 'type'] as const),
) {}

export class SetPartnerCustomFieldValuesDto {
  @ApiProperty({
    example: { certification_type: 'ISO 9001', provinces_covered: 11 },
    description: 'Valores por key; null remove o valor',
  })
  @IsObject()
  values: Record<string, unknown>;
}
