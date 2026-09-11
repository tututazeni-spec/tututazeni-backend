import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { CertificateType, Prisma, ReadinessLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/types/current-user';
import { LeadershipProgramsService } from './leadership-programs.service';

/**
 * Conclusão de participantes e publicação de resultados de um programa de
 * liderança (Task 6).
 *
 * - `completeParticipant` valida os critérios de conclusão configurados no
 *   programa; só então marca `COMPLETED`, emite (idempotentemente) o
 *   `Certificate` canónico do tipo `LEADERSHIP`, tira o snapshot de readiness e
 *   actualiza o `SuccessionPlan` ligado ao participante quando existe.
 * - `getProgramOutcomes` agrega os KPIs do programa (conclusão/abandono,
 *   presença, nota, evolução de competências, projectos, readiness, sucessão e
 *   custo). Métricas sem fonte de dados no âmbito (satisfação, promoções,
 *   mobilidade, ROI monetário) são devolvidas como `null` — explícitas, não
 *   inventadas.
 */
@Injectable()
export class LeadershipAnalyticsService {
  private readonly logger = new Logger(LeadershipAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly programs: LeadershipProgramsService,
  ) {}

  private static readonly DROPOUT_STATES = ['WITHDRAWN', 'FAILED', 'CANCELLED', 'REJECTED'];

  // ─── Conclusão do participante ──────────────────────────────────────────

  async completeParticipant(actor: CurrentUserData, programId: number, userId: number) {
    await this.programs.assertCanManageProgram(actor, programId);

    const program = await this.prisma.leadershipProgram.findUnique({ where: { id: programId } });
    if (!program) throw new NotFoundException('Programa de liderança não encontrado');

    const participant = await this.prisma.leadershipProgramParticipant.findUnique({
      where: { userId_programId: { userId, programId } },
      include: {
        assessments: { where: { stage: 'FINAL' } },
        projects: true,
      },
    });
    if (!participant) throw new NotFoundException('Participante não encontrado neste programa');

    // Idempotência da conclusão: já concluído → devolve o estado + certificado.
    if (participant.status === 'COMPLETED') {
      const certificate = await this.prisma.read.certificate.findFirst({
        where: { type: CertificateType.LEADERSHIP, programId, userId, revoked: false },
      });
      return { participant, certificate, alreadyCompleted: true };
    }

    const finalAssessment = participant.assessments[0] ?? null;
    const check = this.evaluateCompletion(program, participant, finalAssessment);
    if (!check.ok) {
      throw new BadRequestException(
        `Critérios de conclusão não cumpridos: ${check.unmet.join('; ')}`,
      );
    }

    const readinessLevel = check.readinessLevel ?? participant.readinessLevel ?? null;
    const now = new Date();

    const updatedParticipant = await this.prisma.leadershipProgramParticipant.update({
      where: { userId_programId: { userId, programId } },
      data: {
        status: 'COMPLETED',
        progress: 100,
        completedAt: now,
        finalScore: check.finalScorePct ?? participant.finalScore ?? undefined,
        readinessLevel: readinessLevel ?? undefined,
      },
    });

    let certificate: unknown = null;
    if (program.certificationEnabled) {
      certificate = await this.issueCertificate(actor, program, userId, check.finalScorePct);
      await this.prisma.leadershipProgramParticipant.update({
        where: { userId_programId: { userId, programId } },
        data: { certifiedAt: now },
      });
    }

    // Actualiza o SuccessionPlan ligado (quando configurado).
    if (participant.successionPlanId && readinessLevel) {
      await this.prisma.successionPlan
        .update({
          where: { id: participant.successionPlanId },
          data: { readinessLevel },
        })
        .catch((e: unknown) =>
          this.logger.warn({
            successionPlanId: participant.successionPlanId,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao actualizar readiness do SuccessionPlan após conclusão',
          }),
        );
    }

    return { participant: updatedParticipant, certificate, alreadyCompleted: false };
  }

  /**
   * Avalia os critérios de conclusão configurados no programa. Regras sempre
   * activas: existir uma avaliação FINAL concluída. Regras condicionais: só se
   * o campo correspondente do programa estiver preenchido.
   */
  private evaluateCompletion(
    program: {
      minAttendanceRate: number | null;
      minFinalScore: number | null;
      minLeadershipScore: number | null;
      requireFinalProject: boolean;
    },
    participant: {
      status: string;
      attendanceRate: Prisma.Decimal | null;
      finalScore: Prisma.Decimal | null;
      projects: Array<{ status: string; score: Prisma.Decimal | null }>;
    },
    finalAssessment: {
      status: string;
      score: Prisma.Decimal | null;
      maxScore: Prisma.Decimal | null;
      readinessLevel: ReadinessLevel | null;
    } | null,
  ): {
    ok: boolean;
    unmet: string[];
    finalScorePct: number | null;
    readinessLevel: ReadinessLevel | null;
  } {
    const unmet: string[] = [];

    if (LeadershipAnalyticsService.DROPOUT_STATES.includes(participant.status)) {
      unmet.push(`participante em estado ${participant.status}`);
    }

    if (!finalAssessment || finalAssessment.status !== 'COMPLETED') {
      unmet.push('avaliação final não concluída');
    }

    // Nota final em percentagem: preferir participant.finalScore; senão derivar
    // da avaliação FINAL (score/maxScore).
    let finalScorePct: number | null =
      participant.finalScore != null ? Number(participant.finalScore) : null;
    if (finalScorePct == null && finalAssessment?.score != null) {
      const max = finalAssessment.maxScore != null ? Number(finalAssessment.maxScore) : 100;
      finalScorePct = max > 0 ? Math.round((Number(finalAssessment.score) / max) * 100) : null;
    }

    if (program.minFinalScore != null) {
      if (finalScorePct == null || finalScorePct < program.minFinalScore) {
        unmet.push(`nota final < ${program.minFinalScore}`);
      }
    }

    if (program.minAttendanceRate != null) {
      const rate = participant.attendanceRate != null ? Number(participant.attendanceRate) : null;
      if (rate == null || rate < program.minAttendanceRate) {
        unmet.push(`presença < ${program.minAttendanceRate}%`);
      }
    }

    if (program.requireFinalProject) {
      const done = participant.projects.some(p => p.status === 'COMPLETED' && p.score != null);
      if (!done) unmet.push('projecto final não avaliado');
    }

    return {
      ok: unmet.length === 0,
      unmet,
      finalScorePct,
      readinessLevel: finalAssessment?.readinessLevel ?? null,
    };
  }

  /** Emite (uma vez) o certificado canónico do programa. */
  private async issueCertificate(
    actor: CurrentUserData,
    program: {
      id: number;
      code: string;
      name: string;
      certificateTitle: string | null;
      certificateValidityDays: number | null;
    },
    userId: number,
    scorePct: number | null,
  ) {
    const where = {
      type: CertificateType.LEADERSHIP,
      programId: program.id,
      userId,
      revoked: false,
    };
    const existing = await this.prisma.certificate.findFirst({ where });
    if (existing) return existing;

    const expiresAt = program.certificateValidityDays
      ? new Date(Date.now() + program.certificateValidityDays * 86400 * 1000)
      : null;

    try {
      return await this.prisma.certificate.create({
        data: {
          type: CertificateType.LEADERSHIP,
          userId,
          programId: program.id,
          code: `LDR-${program.code}-${userId}`,
          validationCode: crypto.randomUUID(),
          title: program.certificateTitle ?? `Certificado — ${program.name}`,
          score: scorePct ?? undefined,
          issuedById: actor.id,
          issuedAt: new Date(),
          expiresAt,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.certificate.findFirst({ where });
      }
      throw e;
    }
  }

  // ─── KPIs / resultados do programa ─────────────────────────────────────

  async getProgramOutcomes(actor: CurrentUserData, programId: number) {
    await this.programs.assertCanManageProgram(actor, programId);

    const [participants, finalAssessments, initialAssessments, costs, certificates] =
      await Promise.all([
        this.prisma.read.leadershipProgramParticipant.findMany({
          where: { programId },
          include: { projects: true },
        }),
        this.prisma.read.leadershipParticipantAssessment.findMany({
          where: { participant: { programId }, stage: 'FINAL', status: 'COMPLETED' },
        }),
        this.prisma.read.leadershipParticipantAssessment.findMany({
          where: { participant: { programId }, stage: 'INITIAL', status: 'COMPLETED' },
        }),
        this.prisma.read.leadershipProgramCost.findMany({ where: { programId } }),
        this.prisma.read.certificate.count({
          where: { type: CertificateType.LEADERSHIP, programId, revoked: false },
        }),
      ]);

    const total = participants.length;
    const byStatus: Record<string, number> = {};
    for (const p of participants) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    const completed = byStatus.COMPLETED ?? 0;
    const dropped = LeadershipAnalyticsService.DROPOUT_STATES.reduce(
      (s, st) => s + (byStatus[st] ?? 0),
      0,
    );

    const avg = (xs: number[]): number | null =>
      xs.length ? Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 100) / 100 : null;
    const pct = (n: number): number | null =>
      total ? Math.round((n / total) * 10000) / 100 : null;
    const normalize = (a: { score: Prisma.Decimal | null; maxScore: Prisma.Decimal | null }) => {
      if (a.score == null) return null;
      const max = a.maxScore != null ? Number(a.maxScore) : 100;
      return max > 0 ? (Number(a.score) / max) * 100 : null;
    };

    const attendanceRates = participants
      .map(p => (p.attendanceRate != null ? Number(p.attendanceRate) : null))
      .filter((x): x is number => x != null);
    const finalScores = participants
      .map(p => (p.finalScore != null ? Number(p.finalScore) : null))
      .filter((x): x is number => x != null);

    const initialAvg = avg(initialAssessments.map(normalize).filter((x): x is number => x != null));
    const finalAvg = avg(finalAssessments.map(normalize).filter((x): x is number => x != null));

    const allProjects = participants.flatMap(p => p.projects);
    const projectsCompleted = allProjects.filter(p => p.status === 'COMPLETED');

    const readinessByLevel: Record<string, number> = {};
    for (const p of participants) {
      if (p.readinessLevel) {
        readinessByLevel[p.readinessLevel] = (readinessByLevel[p.readinessLevel] ?? 0) + 1;
      }
    }

    const totalPlanned = costs.reduce((s, c) => s + Number(c.plannedAmount ?? 0), 0);
    const totalActual = costs.reduce((s, c) => s + Number(c.actualAmount ?? 0), 0);

    return {
      programId,
      participants: {
        total,
        byStatus,
        completionRate: pct(completed),
        dropoutRate: pct(dropped),
      },
      attendance: { averageRate: avg(attendanceRates) },
      score: { averageFinalScore: avg(finalScores) },
      competencyEvolution: {
        initialAvg,
        finalAvg,
        delta:
          initialAvg != null && finalAvg != null
            ? Math.round((finalAvg - initialAvg) * 100) / 100
            : null,
      },
      projects: {
        total: allProjects.length,
        completed: projectsCompleted.length,
        averageScore: avg(
          projectsCompleted
            .map(p => (p.score != null ? Number(p.score) : null))
            .filter((x): x is number => x != null),
        ),
      },
      readiness: {
        byLevel: readinessByLevel,
        readyNow: readinessByLevel.READY_NOW ?? 0,
      },
      succession: {
        linked: participants.filter(p => p.successionPlanId != null).length,
      },
      cost: {
        currency: costs[0]?.currency ?? 'AOA',
        totalPlanned: Math.round(totalPlanned * 100) / 100,
        totalActual: Math.round(totalActual * 100) / 100,
      },
      certificates: { issued: certificates },
      // Sem fonte de dados no âmbito — explícito, não inventado.
      satisfaction: null,
      promotions: null,
      mobility: null,
      roi: null,
    };
  }
}
