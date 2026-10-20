import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateFactsService } from './certificate-facts.service';
import { CertificateIssuanceService, IssueResult } from './certificate-issuance.service';

export interface ReconcileItem {
  userId: number;
  learningPathId: number;
  outcome: 'ELIGIBLE' | 'ISSUED' | 'SKIPPED' | 'ERROR';
}

export interface ReconcileReport {
  dryRun: boolean;
  checked: number;
  /** Só em simulação: elegíveis sem certificado, que seriam emitidos. */
  eligible: number;
  issued: number;
  items: ReconcileItem[];
}

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

  /**
   * Percorre as inscrições em trilhas ainda não concluídas. Em simulação (por defeito) só
   * relata quem já é elegível e ainda não tem certificado; com `dryRun=false` emite.
   */
  async reconcile(learningPathId?: number, dryRun = true): Promise<ReconcileReport> {
    const rows = await this.prisma.learningPathEnrollment.findMany({
      where: { status: { not: 'COMPLETED' }, ...(learningPathId ? { learningPathId } : {}) },
      select: { userId: true, learningPathId: true },
    });
    const items: ReconcileItem[] = [];
    let issued = 0;
    for (const row of rows) {
      const { userId, learningPathId: pathId } = row;
      try {
        if (dryRun) {
          const facts = await this.facts.collect(userId, 'LEARNING_PATH', pathId);
          if (facts.completionPct < 100) continue;
          const existing = await this.prisma.certificate.findFirst({
            where: {
              userId,
              activityKind: 'LEARNING_PATH',
              activityId: pathId,
              deletedAt: null,
              revoked: false,
            },
            select: { id: true },
          });
          items.push({
            userId,
            learningPathId: pathId,
            outcome: existing ? 'SKIPPED' : 'ELIGIBLE',
          });
          continue;
        }
        const r = await this.evaluate(userId, pathId);
        if (!r) continue;
        const done = r.outcome === 'ISSUED' || r.outcome === 'PENDING_APPROVAL';
        if (done) issued++;
        items.push({ userId, learningPathId: pathId, outcome: done ? 'ISSUED' : 'SKIPPED' });
      } catch (e) {
        items.push({ userId, learningPathId: pathId, outcome: 'ERROR' });
        this.logger.error(
          `Reconciliação da trilha ${pathId} (utilizador ${userId}): ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
    return {
      dryRun,
      checked: rows.length,
      eligible: items.filter(i => i.outcome === 'ELIGIBLE').length,
      issued,
      items,
    };
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
