import { IsString, IsInt, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export enum LessonContentType { VIDEO = 'VIDEO', AVATAR = 'AVATAR', PDF = 'PDF', QUIZ = 'QUIZ' }

export class CreateModuleDto {
  @ApiProperty() @IsInt() courseId!: number;
  @ApiProperty() @IsString() title!: string;
  @ApiProperty() @IsInt() seq!: number;
}
export class UpdateModuleDto extends PartialType(CreateModuleDto) {}

export class CreateLessonDto {
  @ApiProperty() @IsInt() moduleId!: number;
  @ApiProperty() @IsString() title!: string;
  @ApiProperty({ enum: LessonContentType }) @IsEnum(LessonContentType) contentType!: LessonContentType;
  @ApiPropertyOptional() @IsOptional() @IsString() videoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pdfUrl?: string;
  @ApiProperty() @IsInt() seq!: number;
}
export class UpdateLessonDto extends PartialType(CreateLessonDto) {}

export class MarkLessonCompleteDto {
  @ApiProperty() @IsInt() enrollmentId!: number;
  @ApiProperty() @IsInt() lessonId!: number;
}