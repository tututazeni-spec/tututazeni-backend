import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateKeyResultDto {
  @ApiProperty({ description: 'Novo valor actual' })
  @Type(() => Number)
  @IsNumber()
  newValue: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
