import { IsString, IsOptional, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEnrollmentDto {
  @ApiProperty({ description: 'ID (Int) do aluno' })
  @Type(() => Number)
  @IsInt()
  userId: number;

  @ApiProperty()
  @IsString()
  programId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  periodId?: string;
}
