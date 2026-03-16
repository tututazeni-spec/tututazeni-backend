import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsISO8601,
  IsOptional,
  IsArray,
} from 'class-validator';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string; // ✅ corrigido

  @IsISO8601()
  startAt!: string;

  @IsISO8601()
  endAt!: string;

  @IsNumber()
  organizerId!: number;

  @IsOptional()
  @IsArray()
  participantIds?: number[]; // ✅ corrigido
}

