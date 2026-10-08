import { IsString, IsOptional, IsEnum, IsDateString, IsInt, Length } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PartnerProgramStatus } from '@prisma/client';

export class CreatePartnerProgramDto {
  @ApiProperty({ example: 'Crescer' })
  @IsString()
  @Length(1, 200)
  program: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  project?: string;

  @ApiPropertyOptional({ description: 'Área de intervenção' })
  @IsOptional()
  @IsString()
  interventionArea?: string;

  @ApiPropertyOptional({ example: 'Parceiro de formação' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ enum: PartnerProgramStatus, default: 'PLANNED' })
  @IsOptional()
  @IsEnum(PartnerProgramStatus)
  status?: PartnerProgramStatus;

  @ApiPropertyOptional({ description: 'Responsável interno (User.id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  responsibleId?: number;
}

export class UpdatePartnerProgramDto extends PartialType(CreatePartnerProgramDto) {}
