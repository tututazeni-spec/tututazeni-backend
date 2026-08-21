// src/common/dtos/pagination.dto.ts
// DTO base partilhado para os campos page/limit — substitui a redeclaração
// destes dois campos em ~71 classes *FilterDto espalhadas por 47 ficheiros.
// Os FilterDto concretos devem `extends BaseFilterDto` e acrescentar só os
// seus campos de filtro específicos.

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class BaseFilterDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}
