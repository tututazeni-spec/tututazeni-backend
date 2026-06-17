import { IsString, IsOptional, IsEnum, IsArray, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BadgeLevel } from '@prisma/client';

export class CreateBadgeDto {
  @ApiProperty({ example: 'Especialista em Liderança' })
  @IsString()
  @Length(2, 150)
  name: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty({ example: 'https://storage.innova.ao/badges/leadership.png' })
  @IsString()
  imageUrl: string;

  @ApiProperty({ example: 'Concluir 5 cursos de liderança com nota >= 80' })
  @IsString()
  criteria: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ enum: BadgeLevel, default: 'BASIC' })
  @IsOptional()
  @IsEnum(BadgeLevel)
  level?: BadgeLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  programId?: string;
}
