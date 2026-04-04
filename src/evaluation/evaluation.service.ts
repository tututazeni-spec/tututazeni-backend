import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IsInt, IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum EvalType { SELF = 'SELF', MANAGER = 'MANAGER', PEER = 'PEER', SUBORDINATE = 'SUBORDINATE' }

export class CreateEvaluationDto {
  @ApiProperty() @IsInt() evaluatedId!: number;
  @ApiProperty({ enum: EvalType }) @IsEnum(EvalType) type!: EvalType;
  @ApiProperty() @IsString() period!: string;
  @ApiProperty({ type: [Object] }) @IsArray() criteria!: { name: string; score: number; comment?: string }[];
  @ApiPropertyOptional() @IsOptional() @IsString() generalComment?: string;
}

@Injectable()
export class EvaluationService {
  constructor(private prisma: PrismaService) {}

  async create(evaluatorId: number, dto: CreateEvaluationDto) {
    const avgScore = dto.criteria.length
      ? dto.criteria.reduce((s, c) => s + c.score, 0) / dto.criteria.length : 0;

    return this.prisma.performanceEvaluation.create({
      data: {
        evaluatorId,
        evaluatedId: dto.evaluatedId,
        type: dto.type as any,
        period: dto.period,
        criteria: dto.criteria as any,
        generalComment: dto.generalComment,
        overallScore: +avgScore.toFixed(2),
      },
      include: {
        evaluator: { select: { id: true, fullName: true } },
        evaluated: { select: { id: true, fullName: true } },
      },
    });
  }

  async findByUser(userId: number, period?: string) {
    const where: any = { evaluatedId: userId };
    if (period) where.period = { contains: period };
    return this.prisma.performanceEvaluation.findMany({
      where,
      include: { evaluator: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSummary(userId: number, period: string) {
    const evals = await this.prisma.performanceEvaluation.findMany({
      where: { evaluatedId: userId, period: { contains: period } },
    });
    if (!evals.length) return { userId, period, total: 0, avgScore: 0, byType: {} };

    const avgScore = evals.reduce((s, e) => s + (e.overallScore ?? 0), 0) / evals.length;
    const byType: Record<string, number> = {};
    for (const e of evals) byType[e.type] = (e.overallScore ?? 0);
    return { userId, period, total: evals.length, avgScore: +avgScore.toFixed(2), byType };
  }

  async getPendingEvaluations(evaluatorId: number) {
    return this.prisma.evaluationRequest.findMany({
      where: { evaluatorId, status: 'PENDING' },
      include: { evaluated: { select: { id: true, fullName: true, position: true } } },
      orderBy: { dueDate: 'asc' },
    });
  }
}