// ============================================================
// INNOVA PLATFORM — AVALIAÇÃO 360º — CÁLCULO DE RESULTADOS
// Colaborador interno do Evaluation360Service: calcula resultados por
// participante (quorum, pesos, gaps, bónus, PDI automático). É construído pelo
// serviço-fachada com as mesmas dependências — não é um provider Nest.
// ============================================================

import { Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import type {
  CalcCycle,
  CompetencyGapEntry,
  CompetencyScoreEntry,
  CompetencyStrengthEntry,
  ResponseWithAnswers,
} from './evaluation360.types';

export class Evaluation360ResultsCalculator {
  private readonly logger = new Logger(Evaluation360ResultsCalculator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async calculateCycleResults(cycleId: string, actorId: string) {
    const cycle = await this.prisma.eval360Cycle.findUnique({
      where: { id: cycleId },
      include: { competencies: { include: { competency: true } } },
    });
    if (!cycle || cycle.deletedAt) throw new NotFoundException('Ciclo não encontrado.');

    await this.prisma.eval360Cycle.update({
      where: { id: cycleId },
      data: { status: 'PROCESSING' },
    });

    const participants = await this.prisma.cycleParticipant.findMany({
      where: { cycleId },
    });

    // Referência comparativa por competência: média de TODAS as respostas
    // submetidas neste ciclo (todos os participantes/avaliadores) — dado
    // real do ciclo, não um "benchmark de cargo" fabricado.
    const benchmarks = await this.computeCycleCompetencyBenchmarks(
      cycleId,
      cycle.competencies.map(c => c.competencyId),
    );

    for (const participant of participants) {
      await this.calculateParticipantResult(cycle, participant.userId, benchmarks);
    }

    await this.prisma.eval360Cycle.update({
      where: { id: cycleId },
      data: { status: 'COMPLETED' },
    });
    await this.audit.log({
      entity: 'EvaluationCycle',
      entityId: cycleId,
      action: 'CALCULATE_RESULTS',
      userId: actorId,
      details: { participants: participants.length },
    });
    this.events.emit('cycle.results.ready', { cycleId });
    return { processed: participants.length };
  }

  private async computeCycleCompetencyBenchmarks(
    cycleId: string,
    competencyIds: number[],
  ): Promise<Record<number, number>> {
    if (competencyIds.length === 0) return {};
    const answers = await this.prisma.evaluationAnswer.findMany({
      where: {
        numericValue: { not: null },
        question: { cycleId, competencyId: { in: competencyIds } },
        response: { status: 'SUBMITTED' },
      },
      select: { numericValue: true, question: { select: { competencyId: true } } },
    });
    const sums = new Map<number, { total: number; count: number }>();
    for (const a of answers) {
      const compId = a.question.competencyId;
      if (compId == null || a.numericValue == null) continue;
      const entry = sums.get(compId) ?? { total: 0, count: 0 };
      entry.total += a.numericValue;
      entry.count += 1;
      sums.set(compId, entry);
    }
    const result: Record<number, number> = {};
    for (const [id, { total, count }] of sums) result[id] = total / count;
    return result;
  }

  private async calculateParticipantResult(
    cycle: CalcCycle,
    participantId: string,
    benchmarks: Record<number, number> = {},
  ) {
    const responses = await this.prisma.evaluationResponse.findMany({
      where: { cycleId: cycle.id, evaluateeId: participantId, status: 'SUBMITTED' },
      include: { answers: { include: { question: { include: { competency: true } } } } },
    });

    // Verificar quorum mínimo por grupo
    const byRole: Record<string, ResponseWithAnswers[]> = {};
    for (const r of responses) {
      const role = r.evaluatorRole;
      if (!byRole[role]) byRole[role] = [];
      byRole[role].push(r);
    }

    const peerResponses = byRole['PEER'] ?? [];
    if (
      peerResponses.length < cycle.quorumMinimum &&
      peerResponses.length > 0 &&
      peerResponses.length < cycle.quorumMinimum
    ) {
      this.logger.warn({
        entityId: participantId,
        action: 'EVAL360_PEER_QUORUM_NOT_MET',
        cycleId: cycle.id,
        peerCount: peerResponses.length,
        quorumMinimum: cycle.quorumMinimum,
        msg: '[360] Participante com pares abaixo do quorum — dados de pares ocultados',
      });
    }

    // Score por tipo de avaliador (média das respostas numéricas)
    const getAvgScore = (rs: ResponseWithAnswers[]): number | null => {
      const nums = rs.flatMap(r =>
        r.answers.filter(a => a.numericValue !== null).map(a => a.numericValue as number),
      );
      return nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
    };

    const selfScore = getAvgScore(byRole['SELF'] ?? []);
    const managerScore = getAvgScore(byRole['MANAGER'] ?? []);
    const peerScore =
      peerResponses.length >= cycle.quorumMinimum ? getAvgScore(peerResponses) : null;
    const subScore = getAvgScore(byRole['SUBORDINATE'] ?? []);
    const extScore = getAvgScore(byRole['EXTERNAL'] ?? []);

    // Score ponderado — normalizado por `appliedWeight` (soma dos pesos dos
    // papéis que efectivamente responderam), não pela soma configurada no
    // ciclo (`weightSelf+weightManager+...`): se um papel ficar de fora (ex.:
    // pares abaixo do quorum), dividir pelo total configurado penalizaria
    // incorrectamente a ausência de dados que nem deviam contar.
    let weightedSum = 0;
    let appliedWeight = 0;
    if (selfScore !== null) {
      weightedSum += selfScore * cycle.weightSelf;
      appliedWeight += cycle.weightSelf;
    }
    if (managerScore !== null) {
      weightedSum += managerScore * cycle.weightManager;
      appliedWeight += cycle.weightManager;
    }
    if (peerScore !== null) {
      weightedSum += peerScore * cycle.weightPeer;
      appliedWeight += cycle.weightPeer;
    }
    if (subScore !== null) {
      weightedSum += subScore * cycle.weightSubordinate;
      appliedWeight += cycle.weightSubordinate;
    }
    if (extScore !== null) {
      weightedSum += extScore * cycle.weightExternal;
      appliedWeight += cycle.weightExternal;
    }
    const weightedScore = appliedWeight > 0 ? weightedSum / appliedWeight : 0;
    const overallScore = getAvgScore(responses) ?? 0;

    // Score por competência
    const scoresByCompetency: Record<string, CompetencyScoreEntry> = {};
    const expectedLevelByCompetency = new Map(
      cycle.competencies.map(c => [c.competencyId, c.expectedLevel ?? null]),
    );

    for (const cc of cycle.competencies) {
      const comp = cc.competency;
      const compAnswers = responses.flatMap(r =>
        r.answers
          .filter(a => a.question?.competencyId === comp.id && a.numericValue !== null)
          .map(a => ({ role: r.evaluatorRole, value: a.numericValue as number })),
      );
      const allVals = compAnswers.map(a => a.value);
      const selfVals = compAnswers.filter(a => a.role === 'SELF').map(a => a.value);
      const otherVals = compAnswers.filter(a => a.role !== 'SELF').map(a => a.value);
      const managerVals = compAnswers.filter(a => a.role === 'MANAGER').map(a => a.value);
      const peerVals = compAnswers.filter(a => a.role === 'PEER').map(a => a.value);
      const subVals = compAnswers.filter(a => a.role === 'SUBORDINATE').map(a => a.value);
      const extVals = compAnswers.filter(a => a.role === 'EXTERNAL').map(a => a.value);

      const avg = (arr: number[]) =>
        arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
      const score = avg(allVals);
      const selfCompScore = avg(selfVals);
      const othersCompScore = avg(otherVals);
      const gap =
        selfCompScore !== null && othersCompScore !== null ? selfCompScore - othersCompScore : null;
      // Mesmo quorum aplicado ao peerScore agregado acima (linha ~1105): sem
      // isto, um par abaixo do quorum ficava protegido no cartão "Pares" mas
      // continuava exposto aqui, por competência — na prática destapando a
      // resposta individual desse par (n=1 ou 2) no radar/heatmap. A
      // anonimato é por definição do produto, não só no resumo.
      const peerCompScore = peerResponses.length >= cycle.quorumMinimum ? avg(peerVals) : null;
      // Nº de respostas efectivamente contabilizadas nesta competência —
      // exclui os valores de pares escondidos pelo quorum, tal como
      // peerCompScore acima (docs/evaluation360.md §7 "Nº de respostas").
      const responseCount =
        selfVals.length +
        managerVals.length +
        (peerResponses.length >= cycle.quorumMinimum ? peerVals.length : 0) +
        subVals.length +
        extVals.length;
      const expectedLevel = expectedLevelByCompetency.get(comp.id) ?? null;
      const gapToExpected = score !== null && expectedLevel !== null ? score - expectedLevel : null;

      scoresByCompetency[comp.id] = {
        name: comp.name,
        category: comp.category,
        type: comp.type,
        score,
        selfScore: selfCompScore,
        othersScore: othersCompScore,
        managerScore: avg(managerVals),
        peerScore: peerCompScore,
        subordinateScore: avg(subVals),
        externalScore: avg(extVals),
        responseCount,
        gap,
        benchmark: benchmarks[comp.id] ?? null,
        expectedLevel,
        gapToExpected,
      };
    }

    // Identificar gaps e forças
    const entries = Object.entries(scoresByCompetency).filter(([, v]) => v.score !== null);
    const sorted = entries.sort((a, b) => (a[1].score ?? 0) - (b[1].score ?? 0));
    const gaps: CompetencyGapEntry[] = sorted.slice(0, 3).map(([id, v]) => ({
      competencyId: id,
      name: v.name,
      score: v.score,
      gap: v.gap,
      priority: 'HIGH',
    }));
    const strengths: CompetencyStrengthEntry[] = sorted
      .slice(-3)
      .reverse()
      .map(([id, v]) => ({ competencyId: id, name: v.name, score: v.score }));

    // Elegibilidade
    const isEligiblePromotion = cycle.cutoffPromotion
      ? weightedScore >= cycle.cutoffPromotion
      : false;
    const isEligibleBonus = cycle.cutoffBonus ? weightedScore >= cycle.cutoffBonus : false;
    const bonusMultiplier = this.calculateBonusMultiplier(weightedScore, cycle);

    // Upsert resultado
    const result = await this.prisma.evaluationResult.upsert({
      where: { cycleId_participantId: { cycleId: cycle.id, participantId } },
      create: {
        cycleId: cycle.id,
        participantId,
        overallScore,
        weightedScore,
        selfScore: selfScore ?? undefined,
        managerScore: managerScore ?? undefined,
        peerScore: peerScore ?? undefined,
        subordinateScore: subScore ?? undefined,
        externalScore: extScore ?? undefined,
        scoresByCompetency: JSON.stringify(scoresByCompetency),
        gaps: JSON.stringify(gaps),
        strengths: JSON.stringify(strengths),
        isEligiblePromotion,
        isEligibleBonus,
        bonusMultiplier,
      },
      update: {
        overallScore,
        weightedScore,
        selfScore: selfScore ?? undefined,
        managerScore: managerScore ?? undefined,
        peerScore: peerScore ?? undefined,
        subordinateScore: subScore ?? undefined,
        externalScore: extScore ?? undefined,
        scoresByCompetency: JSON.stringify(scoresByCompetency),
        gaps: JSON.stringify(gaps),
        strengths: JSON.stringify(strengths),
        isEligiblePromotion,
        isEligibleBonus,
        bonusMultiplier,
        calculatedAt: new Date(),
      },
    });

    // Atualizar participante
    await this.prisma.cycleParticipant.updateMany({
      where: { cycleId: cycle.id, userId: participantId },
      data: {
        status: 'COMPLETED',
        finalScore: weightedScore,
        completedAt: new Date(),
        isEligiblePromotion,
        isEligibleBonus,
        scoreByEvaluatorType: JSON.stringify({
          SELF: selfScore,
          MANAGER: managerScore,
          PEER: peerScore,
          SUBORDINATE: subScore,
        }),
      },
    });

    // Criar PDI automaticamente se configurado
    if (cycle.linkedToPdi && gaps.length > 0) {
      await this.generateAutomaticPdi(participantId, cycle.id, gaps, result.id);
    }

    return result;
  }

  private calculateBonusMultiplier(score: number, cycle: CalcCycle): number | null {
    if (!cycle.linkedToBonus || !cycle.cutoffBonus) return null;
    if (score < cycle.cutoffBonus) return 0;
    // Eval360Cycle não tem scaleMax (esse campo é por-competência, em
    // Competency) — fallback fixo em 5, comportamento pré-existente.
    const normalized = (score - cycle.cutoffBonus) / (5 - cycle.cutoffBonus);
    return Math.min(1 + normalized * 0.5, 1.5); // máx 1.5x
  }

  private async generateAutomaticPdi(
    userId: string,
    cycleId: string,
    gaps: CompetencyGapEntry[],
    resultId: string,
  ) {
    try {
      const actions = gaps.map(gap => ({
        title: `Desenvolvimento em ${gap.name}`,
        description: `Gap identificado: ${gap.gap?.toFixed(1) ?? 'N/A'}. Competência com score ${gap.score?.toFixed(1) ?? 'N/A'}.`,
        dueDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 dias
        status: 'PENDING',
        priority: gap.priority,
      }));

      // Criar PDI via evento (o módulo PDI escuta e processa)
      this.events.emit('pdi.auto.create', {
        userId,
        cycleId,
        gaps,
        actions,
        sourceResultId: resultId,
      });
    } catch (err: unknown) {
      this.logger.warn({
        userId,
        action: 'EVAL360_AUTO_PDI_CREATE',
        entityId: resultId,
        cycleId,
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: 'Falha ao criar PDI automático a partir de resultados de avaliação 360',
      });
    }
  }
}
