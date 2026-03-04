import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  IsArray,
  ArrayNotEmpty,
} from 'class-validator';

export class CreateEventDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  startAt: string;

  @IsDateString()
  endAt: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsInt()
  organizerId: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  participantIds?: number[];
}