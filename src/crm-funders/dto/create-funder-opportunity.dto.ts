import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsInt,
  IsNumber,
  Min,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  FunderOpportunityDocumentType,
  FunderOpportunityStatus,
  FunderThematicArea,
} from '@prisma/client';

export class CreateFunderOpportunityDto {
  @ApiProperty({ example: 'Call Juventude 2027' })
  @IsString()
  @Length(2, 200)
  name: string;

  @ApiPropertyOptional({ description: 'Programa/projecto (FunderProgram.id)' })
  @IsOptional()
  @IsString()
  programId?: string;

  @ApiPropertyOptional({ enum: FunderThematicArea })
  @IsOptional()
  @IsEnum(FunderThematicArea)
  thematicArea?: FunderThematicArea;

  @ApiPropertyOptional({ description: 'Valor potencial' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  potentialValue?: number;

  @ApiPropertyOptional({ default: 'AOA' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Data de abertura' })
  @IsOptional()
  @IsDateString()
  openingDate?: string;

  @ApiPropertyOptional({ description: 'Prazo de candidatura' })
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional({ description: 'Data prevista de decisão' })
  @IsOptional()
  @IsDateString()
  expectedDecisionDate?: string;

  @ApiPropertyOptional({ description: 'Responsável interno (User.id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  responsibleId?: number;

  @ApiPropertyOptional({ enum: FunderOpportunityStatus, default: 'IDENTIFIED' })
  @IsOptional()
  @IsEnum(FunderOpportunityStatus)
  status?: FunderOpportunityStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateFunderOpportunityDto extends PartialType(CreateFunderOpportunityDto) {}

export class CreateOpportunityDocumentDto {
  @ApiProperty({ enum: FunderOpportunityDocumentType })
  @IsEnum(FunderOpportunityDocumentType)
  type: FunderOpportunityDocumentType;

  @ApiProperty()
  @IsString()
  @Length(1, 200)
  name: string;

  @ApiProperty()
  @IsString()
  @Length(1, 2000)
  fileUrl: string;
}
