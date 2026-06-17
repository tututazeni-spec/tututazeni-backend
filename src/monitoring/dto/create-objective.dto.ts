import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsInt,
  Min,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ObjectiveType } from '@prisma/client';

export class CreateObjectiveDto {
  @ApiProperty()
  @IsString()
  cycleId: string;

  @ApiProperty({ description: 'ID (Int) do dono do objectivo' })
  @Type(() => Number)
  @IsInt()
  ownerId: number;

  @ApiProperty({ example: 'Aumentar a taxa de conclusão de cursos' })
  @IsString()
  @Length(2, 250)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ObjectiveType, default: 'INDIVIDUAL' })
  @IsOptional()
  @IsEnum(ObjectiveType)
  type?: ObjectiveType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weight?: number;

  @ApiPropertyOptional({ description: 'Objectivo pai (cascata)' })
  @IsOptional()
  @IsString()
  parentId?: string;
}
