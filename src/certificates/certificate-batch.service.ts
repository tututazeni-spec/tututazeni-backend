import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CertificateIssuanceService, IssueResult } from './certificate-issuance.service';
import { describeMissing } from './certificate-rules';
import { BatchIssueDto, MAX_BATCH_SIZE } from './certificates-lifecycle.dto';

export interface BatchResultRow {
  userId: number;
  outcome: IssueResult['outcome'] | 'ERROR';
  missing?: string[];
  error?: string;
}

export interface BatchResult {
  total: number;
  issued: number;
  existing: number;
  failed: number;
  results: BatchResultRow[];
}

/** Emissão em lote: valida cada titular à parte e nunca perde os já emitidos. */
@Injectable()
export class CertificateBatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly issuance: CertificateIssuanceService,
    private readonly audit: AuditService,
  ) {}

  async issueBatch(dto: BatchIssueDto, actorId: number): Promise<BatchResult> {
    const hasIds = !!dto.userIds?.length;
    if (hasIds === !!dto.allEligible) {
      throw new BadRequestException('Indique os titulares ou escolha "todos os elegíveis" (um só)');
    }
    const userIds = hasIds ? dto.userIds : await this.resolveEligible(dto);
    if (userIds.length > MAX_BATCH_SIZE) {
      throw new BadRequestException(`O lote não pode ter mais de ${MAX_BATCH_SIZE} titulares`);
    }

    const results: BatchResultRow[] = [];
    // Em série (não Promise.all): protege o pool de ligações e a ordem dos resultados.
    for (const userId of userIds) {
      try {
        const r = await this.issuance.issue({
          userId,
          activityKind: dto.activityKind,
          activityId: dto.activityId,
          actorId,
          trigger: 'MANUAL',
        });
        results.push({
          userId,
          outcome: r.outcome,
          ...(r.missing ? { missing: describeMissing(r.missing) } : {}),
        });
      } catch (e) {
        results.push({
          userId,
          outcome: 'ERROR',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const issued = results.filter(
      r => r.outcome === 'ISSUED' || r.outcome === 'PENDING_APPROVAL',
    ).length;
    const existing = results.filter(r => r.outcome === 'EXISTS').length;
    const summary: BatchResult = {
      total: results.length,
      issued,
      existing,
      failed: results.length - issued - existing,
      results,
    };

    await this.audit.log({
      action: 'CERTIFICATE_BATCH_ISSUED',
      entity: 'Certificate',
      userId: actorId,
      metadata: {
        activityKind: dto.activityKind,
        activityId: dto.activityId,
        total: summary.total,
        issued,
        existing,
        failed: summary.failed,
      },
      strict: true,
    });
    return summary;
  }

  private async resolveEligible(dto: BatchIssueDto): Promise<number[]> {
    if (dto.activityKind === 'COURSE') {
      const rows = await this.prisma.enrollment.findMany({
        where: { courseId: dto.activityId, status: 'COMPLETED' },
        select: { userId: true },
        take: MAX_BATCH_SIZE + 1,
      });
      return rows.map(r => r.userId);
    }
    if (dto.activityKind === 'EVENT') {
      const rows = await this.prisma.eventParticipant.findMany({
        where: { eventId: dto.activityId, status: 'PRESENT' },
        select: { userId: true },
        take: MAX_BATCH_SIZE + 1,
      });
      return rows.map(r => r.userId);
    }
    if (dto.activityKind === 'TRAINING') {
      const rows = await this.prisma.trainingParticipant.findMany({
        where: { session: { trainingId: dto.activityId }, status: 'COMPLETED' },
        select: { userId: true },
        distinct: ['userId'],
        take: MAX_BATCH_SIZE + 1,
      });
      return rows.map(r => r.userId);
    }
    // Trilha: quem já concluiu alguma unidade obrigatória (curso ou formação); a
    // elegibilidade final (todas) é revalidada em `issue()`.
    const [courses, trainings] = await Promise.all([
      this.prisma.learningPathCourse.findMany({
        where: { learningPathId: dto.activityId, required: true },
        select: { courseId: true },
      }),
      this.prisma.learningPathTraining.findMany({
        where: { learningPathId: dto.activityId, required: true },
        select: { trainingId: true },
      }),
    ]);
    const [fromCourses, fromTrainings] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { courseId: { in: courses.map(r => r.courseId) }, status: 'COMPLETED' },
        select: { userId: true },
        distinct: ['userId'],
        take: MAX_BATCH_SIZE + 1,
      }),
      this.prisma.trainingParticipant.findMany({
        where: {
          session: { trainingId: { in: trainings.map(t => t.trainingId) } },
          status: 'COMPLETED',
        },
        select: { userId: true },
        distinct: ['userId'],
        take: MAX_BATCH_SIZE + 1,
      }),
    ]);
    return [...new Set([...fromCourses, ...fromTrainings].map(r => r.userId))];
  }
}
