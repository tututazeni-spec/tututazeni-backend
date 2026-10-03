import { IsString, IsOptional, IsEnum, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AngolaProvince, PartnerLocationType } from '@prisma/client';

export class CreatePartnerLocationDto {
  @ApiProperty({ example: 'Delegação de Benguela' })
  @IsString()
  @Length(1, 150)
  name: string;

  @ApiPropertyOptional({ enum: PartnerLocationType, default: 'DELEGATION' })
  @IsOptional()
  @IsEnum(PartnerLocationType)
  type?: PartnerLocationType;

  @ApiPropertyOptional({ default: 'Angola' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ enum: AngolaProvince })
  @IsOptional()
  @IsEnum(AngolaProvince)
  province?: AngolaProvince;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  municipality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdatePartnerLocationDto extends PartialType(CreatePartnerLocationDto) {}
