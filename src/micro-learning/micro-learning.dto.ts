import { IsString, IsBoolean, IsOptional, IsInt, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ← corrigido: os decoradores @IsString() soltos fora da classe foram movidos
// para dentro de CreateMicroLearningDto como propriedades correctamente declaradas.
export class CreateMicroLearningDto {
  @ApiProperty() @IsString() title!: string;
  @ApiProperty() @IsString() content!: string;
  @ApiProperty() @IsString() contentType!: string;
  @ApiProperty() @IsString() level!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateMicroLearningDto extends PartialType(CreateMicroLearningDto) {}

export class DispatchMicroLearningDto {
  @ApiProperty() @IsInt() microLearningId!: number;
  @ApiProperty({ type: [Number] }) @IsArray() userIds!: number[];
}

export class MicroLearningFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean) active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}