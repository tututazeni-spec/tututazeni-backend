import { IsString, IsOptional, IsEnum, IsNumber, Min, Length, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { FunderIndicatorKey } from '@prisma/client';

export class CreateFunderIndicatorDto {
  @ApiProperty({ enum: FunderIndicatorKey, description: 'CUSTOM = outro KPI do projecto' })
  @IsEnum(FunderIndicatorKey)
  key: FunderIndicatorKey;

  @ApiPropertyOptional({ description: 'Obrigatório quando key = CUSTOM' })
  @ValidateIf(o => o.key === FunderIndicatorKey.CUSTOM || o.name !== undefined)
  @IsString()
  @Length(2, 150)
  name?: string;

  @ApiPropertyOptional({ description: 'Programa/projecto (FunderProgram.id)' })
  @IsOptional()
  @IsString()
  programId?: string;

  @ApiPropertyOptional({ description: 'Financiamento (FundingGrant.id)' })
  @IsOptional()
  @IsString()
  grantId?: string;

  @ApiPropertyOptional({ example: 'pessoas' })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  unit?: string;

  @ApiPropertyOptional({ description: 'Meta prevista' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  target?: number;

  @ApiPropertyOptional({ description: 'Valor alcançado' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  achieved?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateFunderIndicatorDto extends PartialType(CreateFunderIndicatorDto) {}

export class FilterFunderIndicatorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  programId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  grantId?: string;
}
