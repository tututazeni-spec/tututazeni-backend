import { IsOptional, IsString, IsDateString } from 'class-validator';

export class FilterEventsDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;
}