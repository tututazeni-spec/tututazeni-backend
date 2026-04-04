import { IsInt, IsArray, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OnboardingTaskDto {
  title!: string;
  description?: string;
  dueDate?: string;
  completed?: boolean;
  order?: number;
}

export class CreateOnboardingPlanDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty({ type: 'array' }) @IsArray() tasks!: OnboardingTaskDto[];
}

export class UpdateOnboardingTaskDto {
  @ApiProperty() @IsInt() taskIndex!: number;
  @ApiPropertyOptional() @IsOptional() completed?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
}