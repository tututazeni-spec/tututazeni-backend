// src/leader/leader.dto.ts
import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsArray,
  IsBoolean,
  IsDateString,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { EngagementFeedbackType } from '@prisma/client';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

// ─── Enums ────────────────────────────────────────────────────────

export enum OneOnOneMeetingStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum RiskLevel {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  NONE = 'NONE',
}

// ─── Profile ──────────────────────────────────────────────────────

export class CreateLeaderProfileDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) leadershipStyle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() strengths?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() developmentAreas?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() coachingNotes?: string;
}

// ─── Team Management ──────────────────────────────────────────────

export class TeamFilterDto extends BaseFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(RiskLevel) risk?: RiskLevel;
}

// ─── Feedback ────────────────────────────────────────────────────

export class GiveFeedbackDto {
  @ApiProperty() @IsInt() recipientId!: number;
  @ApiProperty({ enum: EngagementFeedbackType })
  @IsEnum(EngagementFeedbackType)
  type!: EngagementFeedbackType;
  @ApiProperty() @IsString() @MaxLength(2000) content!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() situation?: string; // SBI
  @ApiPropertyOptional() @IsOptional() @IsString() behavior?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() impact?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPrivate?: boolean;
}

// ─── 1:1 Meeting ─────────────────────────────────────────────────

export class LeaderCreateOneOnOneDto {
  @ApiProperty() @IsInt() participantId!: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() agenda?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional({ enum: OneOnOneMeetingStatus })
  @IsOptional()
  @IsEnum(OneOnOneMeetingStatus)
  status?: OneOnOneMeetingStatus;
}

// ─── Course Assignment ────────────────────────────────────────────

export class LeaderAssignCourseDto {
  @ApiProperty({ type: [Number] }) @IsArray() @IsInt({ each: true }) userIds!: number[];
  @ApiProperty() @IsInt() courseId!: number;
}

// ─── Alert Filter ─────────────────────────────────────────────────

export class AlertFilterDto extends BaseFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
}

// ─── Complete1on1Dto ──────────────────────────────────────────────────────────

export class Complete1on1Dto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  notes!: string;
}
