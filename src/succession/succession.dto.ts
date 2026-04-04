import { IsInt, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateSuccessionPlanDto {
  @ApiProperty() @IsInt() positionId!: number;
  @ApiProperty() @IsInt() candidateId!: number;
  @ApiProperty() @IsString() readiness!: string;
}
export class UpdateSuccessionPlanDto extends PartialType(CreateSuccessionPlanDto) {}

export class SuccessionFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) positionId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) candidateId?: number;
}