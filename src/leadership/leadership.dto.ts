import { IsString, IsOptional, IsBoolean, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateLeadershipProgramDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateLeadershipProgramDto extends PartialType(CreateLeadershipProgramDto) {}

export class EnrollLeadershipDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsInt() programId!: number;
}

export class UpdateParticipantProgressDto {
  @ApiProperty() @IsInt() progress!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
}