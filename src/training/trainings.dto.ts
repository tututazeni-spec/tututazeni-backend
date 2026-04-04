import { IsString, IsInt, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateTrainingDto {
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiProperty() @IsInt() instructorId!: number;
}
export class UpdateTrainingDto extends PartialType(CreateTrainingDto) {}

export class CreateTrainingSessionDto {
  @ApiProperty() @IsInt() trainingId!: number;
  @ApiProperty() @IsDateString() sessionDate!: string;
  @ApiProperty() @IsInt() duration!: number;
}

export class RegisterParticipantDto {
  @ApiProperty() @IsInt() sessionId!: number;
  @ApiProperty() @IsInt() userId!: number;
}

export class UpdateParticipantStatusDto {
  @ApiProperty() @IsString() status!: string;
}

export class TrainingFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) instructorId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}