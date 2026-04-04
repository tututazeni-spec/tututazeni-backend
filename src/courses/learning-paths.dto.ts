import { IsString, IsOptional, IsBoolean, IsInt, IsArray, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateLearningPathDto {
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mandatory?: boolean;
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() courseIds?: number[];
}
export class UpdateLearningPathDto extends PartialType(CreateLearningPathDto) {}

export class AssignLearningPathDto {
  @ApiProperty() @IsInt() learningPathId!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() unitId?: number;
  @ApiPropertyOptional() @IsOptional() @IsEnum(['COLABORADOR','LIDER','RH','ADMIN']) role?: string;
}