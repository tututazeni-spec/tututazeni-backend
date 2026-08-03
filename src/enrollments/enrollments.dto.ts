import {
  IsInt,
  IsEnum,
  IsOptional,
  IsArray,
  IsBoolean,
  IsDateString,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { EnrollmentStatus, EnrollmentOrigin } from '@prisma/client';

// ─── Enums (EN — consistentes com toda a plataforma) ─────────────────────────

export { EnrollmentStatus, EnrollmentOrigin };

// ─── Create Enrollment ────────────────────────────────────────────────────────

export class EnrollmentsCreateEnrollmentDto {
  @ApiProperty({ description: 'ID do utilizador' })
  @IsInt()
  userId!: number;

  @ApiProperty({ description: 'ID do curso' })
  @IsInt()
  courseId!: number;

  @ApiPropertyOptional({ description: 'Prazo de conclusão' })
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional({ description: 'Matrícula obrigatória?' })
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional({ enum: EnrollmentOrigin, default: EnrollmentOrigin.MANUAL })
  @IsOptional()
  @IsEnum(EnrollmentOrigin)
  origin?: EnrollmentOrigin;

  @ApiPropertyOptional({ description: 'ID da atribuição de Learning Path de origem' })
  @IsOptional()
  @IsInt()
  learningPathId?: number;

  @ApiPropertyOptional({ description: 'ID do administrador que atribuiu (se manual)' })
  @IsOptional()
  @IsInt()
  assignedById?: number;
}

// ─── Bulk Enroll ─────────────────────────────────────────────────────────────

export class BulkEnrollDto {
  @ApiProperty({ type: [Number], description: 'IDs de utilizadores' })
  @IsArray()
  @IsInt({ each: true })
  userIds!: number[];

  @ApiProperty({ description: 'ID do curso' })
  @IsInt()
  courseId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional({ enum: EnrollmentOrigin })
  @IsOptional()
  @IsEnum(EnrollmentOrigin)
  origin?: EnrollmentOrigin;
}

// ─── Update Status ────────────────────────────────────────────────────────────

export class UpdateEnrollmentStatusDto {
  @ApiProperty({ enum: EnrollmentStatus })
  @IsEnum(EnrollmentStatus)
  status!: EnrollmentStatus;
}

// ─── Filter ───────────────────────────────────────────────────────────────────

export class EnrollmentFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  userId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  courseId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional({ enum: EnrollmentStatus })
  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;

  @ApiPropertyOptional({ enum: EnrollmentOrigin })
  @IsOptional()
  @IsEnum(EnrollmentOrigin)
  origin?: EnrollmentOrigin;

  @ApiPropertyOptional({ description: 'Apenas matrículas obrigatórias?' })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional({ description: 'Apenas matrículas com deadline expirado?' })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

export class CancelEnrollmentDto {
  @ApiPropertyOptional({ description: 'Motivo do cancelamento' })
  @IsOptional()
  @IsString()
  reason?: string;
}

// ─── Update Deadline ──────────────────────────────────────────────────────────

export class UpdateDeadlineDto {
  @ApiProperty()
  @IsDateString()
  deadline!: string;
}
