import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const FEEDBACK_KINDS = ['IDEA', 'PROBLEM', 'PRAISE'] as const;

export class SubmitFeedbackDto {
  @ApiProperty({ enum: FEEDBACK_KINDS })
  @IsIn(FEEDBACK_KINDS)
  kind!: (typeof FEEDBACK_KINDS)[number];
  @ApiProperty() @IsString() @MaxLength(2000) comment!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) page?: string;
}

export class SubmitNpsDto {
  @ApiProperty({ minimum: 0, maximum: 10 }) @IsInt() @Min(0) @Max(10) score!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) comment?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) page?: string;
}

export class TrackEventDto {
  @ApiProperty() @IsIn(['page_view', 'feature_used']) event!: 'page_view' | 'feature_used';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) path?: string;
}
