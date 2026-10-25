// ============================================================
// INNOVA PLATFORM — AVALIAÇÃO — CALIBRAÇÃO
// Calibração de pontuações de um ciclo (vista, abrir/confirmar, histórico, calibrar).
// Colaborador interno do EvaluationService: recebe o mesmo prisma/logger e as
// validações partilhadas via `deps` — não é um provider Nest.
// ============================================================

import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CalibrateScoreDto, CycleStatus, EvalStage } from './evaluation.dto';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import type { EvalCampaignModel, EvaluationCampaign } from '@prisma/client';
import type { EvalModel } from './evaluation.dto';
import { percentile } from './evaluation-scoring';
import type { PrismaService } from '../prisma/prisma.service';

export interface EvaluationCalibrationServiceDeps {
  toPublicCampaign: <T extends { model: EvalCampaignModel }>(
    campaign: T,
  ) => Omit<T, 'model'> & { model: EvalModel };
  assertCampaignExists: (id: number) => Promise<EvaluationCampaign>;
  advanceStage: (id: number) => Promise<unknown>;
}

export class EvaluationCalibrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
    private readonly deps: EvaluationCalibrationServiceDeps,
  ) {}

  async getCycleForCalibration(cycleId: number, departmentId?: number) {
    type CalibrationEval = Prisma.PerformanceEvaluationGetPayload<{
      include: {
        evaluated: {
          select: {
            id: true;
            fullName: true;
            avatarUrl: true;
            department: { select: { name: true } };
            position: { select: { name: true } };
          };
        };
        evaluator: { select: { id: true; fullName: true } };
      };
    }>;

    // docs/modulo_evaluation.md ponto 9 — "Selecionar departamento" filtra o
    // conjunto calibrável; "Comparar equipas"/"Distribuição de resultados"
    // (abaixo, byDepartment) continua a usar sempre todo o ciclo, não o
    // subconjunto filtrado, para a comparação fazer sentido.
    const evals: CalibrationEval[] = await this.prisma.read.performanceEvaluation.findMany({
      where: {
        ...(cycleId ? { cycleId } : {}),
        ...(departmentId ? { evaluated: { departmentId } } : {}),
      },
      include: {
        evaluated: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            department: { select: { name: true } },
            position: { select: { name: true } },
          },
        },
        evaluator: { select: { id: true, fullName: true } },
      },
    });

    const allEvals: CalibrationEval[] = departmentId
      ? await this.prisma.read.performanceEvaluation.findMany({
          where: { ...(cycleId ? { cycleId } : {}) },
          include: {
            evaluated: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true,
                department: { select: { name: true } },
                position: { select: { name: true } },
              },
            },
            evaluator: { select: { id: true, fullName: true } },
          },
        })
      : evals;

    // Group by evaluated
    const byEval: Record<
      number,
      { evaluated: CalibrationEval['evaluated']; scores: number[]; types: Record<string, number> }
    > = {};
    for (const e of evals) {
      const id = e.evaluatedId;
      if (!byEval[id]) byEval[id] = { evaluated: e.evaluated, scores: [], types: {} };
      byEval[id].scores.push(e.overallScore ?? 0);
      byEval[id].types[e.type] = e.overallScore;
    }

    const allScores = Object.values(byEval).map(
      b => +(b.scores.reduce((a: number, v: number) => a + v, 0) / b.scores.length).toFixed(2),
    );

    const result = Object.values(byEval)
      .map(b => {
        const avg = +(
          b.scores.reduce((a: number, v: number) => a + v, 0) / b.scores.length
        ).toFixed(2);
        return {
          evaluated: b.evaluated,
          avgScore: avg,
          byType: b.types,
          percentile: percentile(avg, allScores),
          dispersion:
            b.scores.length > 1 ? +(Math.max(...b.scores) - Math.min(...b.scores)).toFixed(2) : 0,
        };
      })
      .sort((a, b) => b.avgScore - a.avgScore);

    // Detect biased evaluators
    const evaluatorStats: Record<number, number[]> = {};
    for (const e of evals) {
      if (!evaluatorStats[e.evaluatorId]) evaluatorStats[e.evaluatorId] = [];
      evaluatorStats[e.evaluatorId].push(e.overallScore ?? 0);
    }
    const globalAvg = allScores.length
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length
      : 0;
    const biasedEvaluators = Object.entries(evaluatorStats)
      .map(([evId, scores]) => {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        return {
          evaluatorId: +evId,
          avg: +avg.toFixed(2),
          deviation: +(avg - globalAvg).toFixed(2),
        };
      })
      .filter(e => Math.abs(e.deviation) > 0.8);

    // "Comparar equipas" / "Distribuição de resultados" (docs pt.9) — sempre
    // sobre o ciclo inteiro (allEvals), não sobre o filtro de departamento.
    const deptMap: Record<string, number[]> = {};
    for (const e of allEvals) {
      const dept = e.evaluated?.department?.name ?? 'N/A';
      if (!deptMap[dept]) deptMap[dept] = [];
      deptMap[dept].push(e.overallScore ?? 0);
    }
    const byDepartment = Object.entries(deptMap)
      .map(([department, scores]) => ({
        department,
        avgScore: +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2),
        count: scores.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    const distribution = { exceptional: 0, above: 0, expected: 0, below: 0 };
    for (const s of allEvals.map(e => e.overallScore ?? 0)) {
      if (s >= 4) distribution.exceptional++;
      else if (s >= 3) distribution.above++;
      else if (s >= 2) distribution.expected++;
      else distribution.below++;
    }

    return {
      participants: result,
      globalAvg: +globalAvg.toFixed(2),
      biasedEvaluators,
      byDepartment,
      distribution,
    };
  }

  // docs/modulo_evaluation.md ponto 9 — "Abrir calibração": move o ciclo para
  // o estado CALIBRATING (enum já existia em EvalCampaignStatus, nunca
  // escrito por nenhum serviço). Puramente informativo — não bloqueia
  // calibrateScore, que já funciona independentemente do status do ciclo.
  async openCalibration(cycleId: number) {
    await this.deps.assertCampaignExists(cycleId);
    const campaign = await this.prisma.evaluationCampaign.update({
      where: { id: cycleId },
      data: { status: CycleStatus.CALIBRATING },
    });
    return this.deps.toPublicCampaign(campaign);
  }

  // "Confirmar calibração": fecha a janela de calibração (volta a ACTIVE) e
  // avança a etapa dos pedidos ainda em CALIBRATION para a seguinte
  // (1:1/aprovação/resultado), reaproveitando advanceStage() por pedido.
  async confirmCalibration(cycleId: number) {
    const campaign = await this.deps.assertCampaignExists(cycleId);
    const pending = await this.prisma.evaluationRequest.findMany({
      where: { cycleId, stage: EvalStage.CALIBRATION },
      select: { id: true },
    });
    await Promise.allSettled(pending.map(r => this.deps.advanceStage(r.id)));

    const updated = await this.prisma.evaluationCampaign.update({
      where: { id: cycleId },
      data: {
        status: campaign.status === CycleStatus.CALIBRATING ? CycleStatus.ACTIVE : campaign.status,
      },
    });
    return { cycle: this.deps.toPublicCampaign(updated), advanced: pending.length };
  }

  // docs/modulo_evaluation.md ponto 9 — "Histórico de alterações": lê o
  // rasto deixado por calibrateScore() em AuditLog (entity=PerformanceEvaluation,
  // action=CALIBRATION) em vez de um modelo dedicado — CalibrationLog existente
  // no schema pertence ao módulo `performance` (FK para PerformanceReview, tipo
  // incompatível), ver memory project_innova_performance_review_form.
  async getCalibrationHistory(cycleId: number, evaluatedId?: number) {
    const logs = await this.prisma.read.auditLog.findMany({
      where: {
        entity: 'PerformanceEvaluation',
        action: 'CALIBRATION',
        ...(evaluatedId ? { entityId: evaluatedId } : {}),
      },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return logs
      .map(l => {
        const metadata = l.metadata ? (JSON.parse(l.metadata) as { cycleId?: number }) : {};
        return {
          evaluatedId: l.entityId,
          calibratedBy: l.user,
          previousScore: l.before ? +l.before : null,
          calibratedScore: l.after ? +l.after : null,
          reason: l.reason,
          cycleId: metadata.cycleId ?? null,
          createdAt: l.createdAt,
        };
      })
      .filter(l => l.cycleId === cycleId);
  }

  async calibrateScore(cycleId: number, dto: CalibrateScoreDto, calibratedById: number) {
    const where: Prisma.PerformanceEvaluationWhereInput = { evaluatedId: dto.evaluatedId };
    if (cycleId) where.cycleId = cycleId;

    // Antes de sobrescrever: guarda a média actual para o "before" do
    // histórico de calibração (docs pt.9 — "resultado inicial" na tabela de
    // exemplo). updateMany() não devolve as linhas afectadas.
    const before = await this.prisma.performanceEvaluation.findMany({
      where,
      select: { overallScore: true },
    });
    const previousScore = before.length
      ? +(before.reduce((s, e) => s + (e.overallScore ?? 0), 0) / before.length).toFixed(2)
      : null;

    await this.prisma.performanceEvaluation
      .updateMany({
        where,
        data: { overallScore: dto.calibratedScore },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_CALIBRATE_SCORE',
          cycleId,
          evaluatedId: dto.evaluatedId,
          calibratedById,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao actualizar scores calibrados das avaliações',
        });
      });

    // Log calibration in audit — before/after/reason (docs pt.9: "qualquer
    // alteração feita na calibração deve ficar registada em auditoria",
    // incluindo a justificação). metadata.cycleId permite filtrar o
    // histórico por ciclo em getCalibrationHistory().
    await writeChainedAuditLog(this.prisma, {
      userId: calibratedById,
      action: 'CALIBRATION',
      entity: 'PerformanceEvaluation',
      entityId: dto.evaluatedId,
      before: previousScore !== null ? String(previousScore) : undefined,
      after: String(dto.calibratedScore),
      reason: dto.calibrationNote,
      metadata: JSON.stringify({ cycleId }),
    }).catch((e: unknown) => {
      this.logger.warn({
        action: 'EVALUATION_CALIBRATE_AUDIT_LOG',
        cycleId,
        evaluatedId: dto.evaluatedId,
        calibratedById,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao registar auditoria de calibração de score',
      });
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.evaluatedId,
          type: 'EVALUATION_CALIBRATED',
          message: `A tua avaliação foi calibrada`,
          metadata: JSON.stringify({}),
        },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_CALIBRATE_NOTIFY',
          evaluatedId: dto.evaluatedId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de calibração de score',
        });
      });

    return {
      message: 'Score calibrado',
      evaluatedId: dto.evaluatedId,
      previousScore,
      newScore: dto.calibratedScore,
    };
  }
}
