import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsBoolean,
  IsArray,
  IsDateString,
  Min,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SessionPlatform } from '@prisma/client';

export class CreateLiveSessionDto {
  @ApiProperty({ example: 'Webinar de Liderança' })
  @IsString()
  @Length(2, 200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional({ description: 'ID (Int) do instrutor' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  instructorId?: number;

  @ApiProperty()
  @IsDateString()
  scheduledAt: string;

  @ApiProperty({ example: 90, description: 'Duração em minutos' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration: number;

  @ApiPropertyOptional({ enum: SessionPlatform, default: 'MEET' })
  @IsOptional()
  @IsEnum(SessionPlatform)
  platform?: SessionPlatform;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  meetingUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  meetingId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxAttendees?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  materials?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isRecorded?: boolean;
}
