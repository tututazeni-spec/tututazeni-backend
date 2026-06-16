import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WidgetType } from '@prisma/client';

export class CreateWidgetDto {
  @ApiProperty({ enum: WidgetType })
  @IsEnum(WidgetType)
  type: WidgetType;

  @ApiProperty({ example: 'Total de Funcionários' })
  @IsString()
  @Length(2, 100)
  title: string;

  @ApiProperty({ description: 'JSON de configuração do widget' })
  @IsString()
  config: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  position?: number;

  @ApiPropertyOptional({ default: 'medium' })
  @IsOptional()
  @IsString()
  size?: string;
}
