import { IsString, IsInt, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateLiveClassDto {
  @ApiProperty() @IsInt() courseId!: number;
  @ApiProperty() @IsString() topic!: string;
  @ApiProperty() @IsDateString() scheduledAt!: string;
  @ApiProperty() @IsInt() duration!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() zoomMeetingId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recordingUrl?: string;
}
export class UpdateLiveClassDto extends PartialType(CreateLiveClassDto) {}

export class LiveChatMessageDto {
  @ApiProperty() @IsString() message!: string;
}

export class PostClassResponseDto {
  @ApiProperty() @IsInt() evaluationId!: number;
  @ApiProperty() @IsInt() rating!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() feedback?: string;
}

export class LiveClassFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) courseId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}
