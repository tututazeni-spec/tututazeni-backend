import {
  IsString,
  IsInt,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  Min,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { MAX_FILE_SIZE_KB } from '../common/validators/allowed-mime-types';
import { IsAllowedFileUrl } from '../common/validators/is-allowed-file-url.validator';
import {
  ModuleStatus,
  ModuleType,
  ProgressionType,
  CompletionRule,
  LessonType as LessonContentType,
} from '@prisma/client';

export { ModuleStatus, ModuleType, ProgressionType, CompletionRule, LessonContentType };

export class CreateModuleDto {
  @ApiProperty()
  @IsInt()
  courseId!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  learningObjectives?: string[];

  @ApiProperty()
  @IsInt()
  @Min(0)
  seq!: number;

  @ApiPropertyOptional({ enum: ModuleStatus, default: ModuleStatus.DRAFT })
  @IsOptional()
  @IsEnum(ModuleStatus)
  status?: ModuleStatus;

  @ApiPropertyOptional({ enum: ModuleType })
  @IsOptional()
  @IsEnum(ModuleType)
  type?: ModuleType;

  @ApiPropertyOptional({ enum: ProgressionType, default: ProgressionType.SEQUENTIAL })
  @IsOptional()
  @IsEnum(ProgressionType)
  progressionType?: ProgressionType;

  @ApiPropertyOptional({ enum: CompletionRule, default: CompletionRule.ALL_LESSONS })
  @IsOptional()
  @IsEnum(CompletionRule)
  completionRule?: CompletionRule;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minCompletionPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minQuizScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  dripDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  availableFrom?: string;
}

export class UpdateModuleDto extends PartialType(CreateModuleDto) {}

export class ReorderItemDto {
  @ApiProperty()
  @IsInt()
  id!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  seq!: number;
}

export class ReorderModulesDto {
  @ApiProperty({ type: [ReorderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  order!: ReorderItemDto[];
}

export class CreateModuleLessonDto {
  @ApiProperty()
  @IsInt()
  moduleId!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: LessonContentType })
  @IsEnum(LessonContentType)
  contentType!: LessonContentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contentUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  textContent?: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  seq!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  durationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowDownload?: boolean;
}

export class UpdateModuleLessonDto extends PartialType(CreateModuleLessonDto) {}

export class MoveLessonDto {
  @ApiProperty()
  @IsInt()
  targetModuleId!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  seq!: number;
}

export class MarkModuleLessonCompleteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  watchedSeconds?: number;

  @ApiProperty()
  @IsInt()
  lessonId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  resumePosition?: number;
}

export class CreateModuleMaterialDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty()
  @IsAllowedFileUrl()
  url!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_FILE_SIZE_KB)
  fileSizeKb?: number;
}

export class CloneModuleDto {
  @ApiProperty()
  @IsInt()
  targetCourseId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  seq?: number;
}
