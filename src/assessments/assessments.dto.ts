import { IsString, IsInt, IsNumber, IsArray, IsOptional, Min, Max, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateAssessmentQuestionDto {
  @ApiProperty() @IsString() question!: string;
  @ApiProperty({ type: [String] }) @IsArray() options!: string[];
  @ApiProperty() @IsInt() correctIndex!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() weight?: number;
}

export class CreateAssessmentDto {
  @ApiProperty() @IsInt() courseId!: number;
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) passScore?: number;
  @ApiProperty({ type: [CreateAssessmentQuestionDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateAssessmentQuestionDto)
  questions!: CreateAssessmentQuestionDto[];
}

export class UpdateAssessmentDto extends PartialType(CreateAssessmentDto) {}

export class SubmitAssessmentDto {
  @ApiProperty() @IsInt() assessmentId!: number;
  @ApiProperty({ type: [Number] }) @IsArray() answers!: number[];
}

export class EvaluationAttemptAnswerDto {
  @ApiProperty() @IsInt() questionId!: number;
  @ApiProperty() @IsInt() selectedIndex!: number;
}

export class SubmitEvaluationDto {
  @ApiProperty() @IsInt() enrollmentId!: number;
  @ApiProperty() @IsInt() evaluationId!: number;
  @ApiProperty({ type: [EvaluationAttemptAnswerDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => EvaluationAttemptAnswerDto)
  answers!: EvaluationAttemptAnswerDto[];
}