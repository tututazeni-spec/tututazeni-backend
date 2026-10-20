import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateFactsService } from './certificate-facts.service';
import { CertificateIssuanceService, IssueResult } from './certificate-issuance.service';

/**
 * A conclusão de uma Trilha deriva das suas unidades obrigatórias (cursos e formações):
 * ao concluir uma, recalcula as trilhas que a contêm e emite o certificado da trilha
 * quando era a última. `reconcile` cobre os casos anteriores a este fluxo.
 */
@Injectable()
export class LearningPathCertificationService {
  private readonly logger = new Logger(LearningPathCertificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly facts: CertificateFactsService,
    private readonly issuance: CertificateIssuanceService,
  ) {}

  /** Nunca falha o fluxo do curso: erros ficam registados e a reconciliação recupera-os. */
  async onCourseCompleted(userId: number, courseId: number): Promise<IssueResult[]> {
    const links = await this.prisma.learningPathCourse.findMany({
      where: { courseId, required: true },
      select: { learningPathId: true },
    });
    return this.evaluateAll(
      userId,
      links.map(l => l.learningPathId),
    );
  }

  /** Idem para uma formação concluída (nunca falha o fluxo da formação). */
  async onTrainingCompleted(userId: number, trainingId: number): Promise<IssueResult[]> {
    const links = await this.prisma.learningPathTraining.findMany({
      where: { trainingId, required: true },
      select: { learningPathId: true },
    });
    return this.evaluateAll(
      userId,
      links.map(l => l.learningPathId),
    );
  }

  /** Percorre as inscrições em trilhas ainda não concluídas e emite o que estiver em falta. */
  async reconcile(learningPathId?: number): Promise<{ checked: number; issued: number }> {
    const rows = await this.prisma.learningPathEnrollment.findMany({
      where: { status: { not: 'COMPLETED' }, ...(learningPathId ? { learningPathId } : {}) },
      select: { userId: true, learningPathId: true },
    });
    let issued = 0;
    for (const row of rows) {
      try {
        const r = await this.evaluate(row.userId, row.learningPathId);
        if (r?.outcome === 'ISSUED' || r?.outcome === 'PENDING_APPROVAL') issued++;
      } catch (e) {
        this.logger.error(
          `Reconciliação da trilha ${row.learningPathId} (utilizador ${row.userId}): ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
    return { checked: rows.length, issued };
  }

  private async evaluateAll(userId: number, pathIds: number[]): Promise<IssueResult[]> {
    const results: IssueResult[] = [];
    for (const learningPathId of pathIds) {
      try {
        const r = await this.evaluate(userId, learningPathId);
        if (r) results.push(r);
      } catch (e) {
        this.logger.error(
          `Falha ao avaliar a trilha ${learningPathId} do utilizador ${userId}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
    return results;
  }

  private async evaluate(userId: number, learningPathId: number): Promise<IssueResult | null> {
    const facts = await this.facts.collect(userId, 'LEARNING_PATH', learningPathId);
    if (facts.completionPct < 100) return null;

    await this.prisma.learningPathEnrollment.updateMany({
      where: { userId, learningPathId, status: { not: 'COMPLETED' } },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    return this.issuance.issue({
      userId,
      activityKind: 'LEARNING_PATH',
      activityId: learningPathId,
      trigger: 'AUTO',
    });
  }
}
