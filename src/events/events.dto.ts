import { IsString, IsOptional, IsInt, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateEventDto {
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsDateString() startAt!: string;
  @ApiProperty() @IsDateString() endAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
}

export class UpdateEventDto extends PartialType(CreateEventDto) {}

export class UpdateParticipantStatusDto {
  @ApiProperty({ enum: ['PENDING', 'CONFIRMED', 'CANCELED'] })
  @IsEnum(['PENDING', 'CONFIRMED', 'CANCELED']) status!: string;
}

export class EventFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) organizerId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}