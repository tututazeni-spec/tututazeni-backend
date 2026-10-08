import { IsString, IsOptional, IsEnum, IsDateString, IsInt, Min, Length } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { FunderThematicArea, PartnerProgramStatus } from '@prisma/client';

export class CreateFunderProgramDto {
  @ApiProperty({ example: 'Crescer' })
  @IsString()
  @Length(1, 200)
  program: string;

  @ApiPropertyOptional({ example: 'Formação profissional juvenil' })
  @IsOptional()
  @IsString()
  project?: string;

  @ApiPropertyOptional({ enum: FunderThematicArea })
  @IsOptional()
  @IsEnum(FunderThematicArea)
  thematicArea?: FunderThematicArea;

  @ApiPropertyOptional({ description: 'Beneficiários previstos' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedBeneficiaries?: number;

  @ApiPropertyOptional({ description: 'Beneficiários alcançados' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reachedBeneficiaries?: number;

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

export class UpdateFunderProgramDto extends PartialType(CreateFunderProgramDto) {}
