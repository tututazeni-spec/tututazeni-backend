import { IsOptional, IsEnum, IsString, IsBoolean, Transform } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProgramLevel } from '@prisma/client';
import { BaseFilterDto } from '../../common/dtos/pagination.dto';

export class FilterProgramDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: ProgramLevel })
  @IsOptional()
  @IsEnum(ProgramLevel)
  level?: ProgramLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isMandatory?: boolean;
}
