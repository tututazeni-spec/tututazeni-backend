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
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────

export enum FeedbackType {
  POSITIVE = 'POSITIVE',
  CONSTRUCTIVE = 'CONSTRUCTIVE',
  NEUTRAL = 'NEUTRAL',
  SBI = 'SBI',
}

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

export class TeamFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(RiskLevel) risk?: RiskLevel;
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;
  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}

// ─── Feedback ────────────────────────────────────────────────────

export class GiveFeedbackDto {
  @ApiProperty() @IsInt() recipientId!: number;
  @ApiProperty({ enum: FeedbackType }) @IsEnum(FeedbackType) type!: FeedbackType;
  @ApiProperty() @IsString() @MaxLength(2000) content!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() situation?: string; // SBI
  @ApiPropertyOptional() @IsOptional() @IsString() behavior?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() impact?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPrivate?: boolean;
}

// ─── 1:1 Meeting ─────────────────────────────────────────────────

export class CreateOneOnOneDto {
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

export class AssignCourseDto {
  @ApiProperty({ type: [Number] }) @IsArray() @IsInt({ each: true }) userIds!: number[];
  @ApiProperty() @IsInt() courseId!: number;
}

// ─── Alert Filter ─────────────────────────────────────────────────

export class AlertFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}
