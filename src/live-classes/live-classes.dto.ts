import { IsString, IsInt, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

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

export class LiveClassFilterDto extends BaseFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) courseId?: number;
}
