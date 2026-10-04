import { IsString, IsOptional, IsArray, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateFunderNotesDto {
  @ApiPropertyOptional({ description: 'Notas internas' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  relationshipStrategy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  relevantHistory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observations?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Substitui as tags (normalizadas, sem duplicados)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];
}
