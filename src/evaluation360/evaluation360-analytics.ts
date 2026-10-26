// ============================================================
// INNOVA PLATFORM — AVALIAÇÃO 360º — ANALYTICS E RELATÓRIOS
// Colaborador interno do Evaluation360Service: leituras agregadas (resultado
// pessoal, equipa, organização, visão geral, Nine-Box) e relatórios/evolução
// do ciclo. Construído pela fachada com as mesmas dependências — não é um
// provider Nest. Só lê; as validações partilhadas vêm da fachada via `deps`.
// ============================================================

import { Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CurrentUserData } from '../common/decorators';
import {
  AnalyticsQueryDto,
  NineBoxQueryDto,
  GenerateReportDto,
  CycleReportQueryDto,
  CycleEvolutionQueryDto,
  Eval360CycleStatus,
} from './evaluation360.dto';
import type { Eval360Cycle } from '@prisma/client';
import type {
  CompetencyGapEntry,
  CompetencyScoreEntry,
  CompetencyStrengthEntry,
} from './evaluation360.types';

export interface Evaluation360AnalyticsDeps {
  findCycleOrFail: (id: string) => Promise<Eval360Cycle>;
  resolveActorNames: (actorIds: string[]) => Promise<Map<string, string>>;
  assertCallerCanViewPerson: (personId: string, caller?: CurrentUserData) => Promise<void>;
}

export class Evaluation360AnalyticsService {
  private readonly logger = new Logger(Evaluation360AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly deps: Evaluation360AnalyticsDeps,
  ) {}

  async getParticipantResult(cycleId: string, participantId: string, requesterId: string) {
    const result = await this.prisma.evaluationResult.findUnique({
      where: { cycleId_participantId: { cycleId, participantId } },
    });
    if (!result) throw new NotFoundException('Resultado não encontrado.');

    await this.deps.findCycleOrFail(cycleId);
    // Regra explícita do produto: ninguém vê o resultado de outro utilizador
    // — nem ADMIN nem RH têm excepção aqui. getTeamAnalytics/
    // getOrganizationalAnalytics continuam a existir mas só devolvem dados
    // agregados (médias, contagens) sem identificar ninguém; calibrateScore
    // foi removido — calibrar era, por definição, aceder/substituir o
    // resultado individual de outra pessoa. requesterId chega como number
    // (User.id via JWT) e participantId como string (route param) —
    // comparação estrita nunca era true sem o String().
    const isOwnResult = String(requesterId) === String(participantId);
    if (!isOwnResult) throw new ForbiddenException('Sem permissão para ver este resultado.');

    return {
      ...result,
      scoresByCompetency: JSON.parse(result.scoresByCompetency),
      gaps: result.gaps ? JSON.parse(result.gaps) : [],
      strengths: result.strengths ? JSON.parse(result.strengths) : [],
      // Nunca dados individuais por avaliador, nem para o próprio dono do
      // resultado — manteria a identidade do avaliador rastreável.
      rawByEvaluator: null as unknown,
    };
  }

  // Analytics agregados da equipa de um gestor — nunca resultados
  // individuais. Devolvia antes participantId/participantName + score/gaps/
  // strengths por pessoa, o que violava a mesma regra de getParticipantResult
  // (ninguém vê o resultado de outro, nem sequer o próprio gestor sobre um
  // subordinado). Agora só médias/contagens da equipa como um todo, no mesmo
  // espírito de getOrganizationalAnalytics — dá ao gestor o pulso da equipa
  // sem identificar ninguém.
  async getTeamAnalytics(cycleId: string, managerId: string) {
    const managedUsers = await this.prisma.user.findMany({
      where: { managerId: +managerId },
      select: { id: true },
    });
    const teamSize = managedUsers.length;
    if (teamSize === 0) {
      return {
        teamSize: 0,
        evaluatedCount: 0,
        avgOverall: 0,
        avgWeighted: 0,
        eligiblePromotionCount: 0,
        eligibleBonusCount: 0,
        competencyAverages: [],
      };
    }

    const results = await this.prisma.evaluationResult.findMany({
      where: { cycleId, participantId: { in: managedUsers.map(u => String(u.id)) } },
      select: {
        overallScore: true,
        weightedScore: true,
        scoresByCompetency: true,
        isEligiblePromotion: true,
        isEligibleBonus: true,
      },
    });

    const avgOverall = results.length
      ? results.reduce((s, r) => s + r.overallScore, 0) / results.length
      : 0;
    const avgWeighted = results.length
      ? results.reduce((s, r) => s + r.weightedScore, 0) / results.length
      : 0;

    return {
      teamSize,
      evaluatedCount: results.length,
      avgOverall,
      avgWeighted,
      eligiblePromotionCount: results.filter(r => r.isEligiblePromotion).length,
      eligibleBonusCount: results.filter(r => r.isEligibleBonus).length,
      competencyAverages: this.averageCompetencyScores(results),
    };
  }

  async getOrganizationalAnalytics(query: AnalyticsQueryDto) {
    const where: Prisma.EvaluationResultWhereInput = {};
    if (query.cycleId) where.cycleId = query.cycleId;

    const results = await this.prisma.evaluationResult.findMany({
      where,
      select: {
        overallScore: true,
        weightedScore: true,
        scoresByCompetency: true,
        isEligiblePromotion: true,
      },
    });

    const avgOverall = results.length
      ? results.reduce((s, r) => s + r.overallScore, 0) / results.length
      : 0;
    const avgWeighted = results.length
      ? results.reduce((s, r) => s + r.weightedScore, 0) / results.length
      : 0;
    const eligiblePromotion = results.filter(r => r.isEligiblePromotion).length;

    return {
      totalParticipants: results.length,
      avgOverall,
      avgWeighted,
      eligiblePromotion,
      competencyAverages: this.averageCompetencyScores(results),
    };
  }

  // Média por competência entre participantes (cross-participants) — usado
  // por getTeamAnalytics e getOrganizationalAnalytics, os dois analytics
  // agregados que sobrevivem à regra "ninguém vê o resultado de outro".
  private averageCompetencyScores(
    results: { scoresByCompetency: string | null }[],
  ): { competencyId: string; average: number }[] {
    const compScores: Record<string, number[]> = {};
    for (const r of results) {
      const sc: Record<string, CompetencyScoreEntry> = JSON.parse(r.scoresByCompetency ?? '{}');
      for (const [cId, data] of Object.entries(sc)) {
        if (!compScores[cId]) compScores[cId] = [];
        if (data.score !== null) compScores[cId].push(data.score);
      }
    }
    return Object.entries(compScores).map(([competencyId, scores]) => ({
      competencyId,
      average: scores.reduce((s, v) => s + v, 0) / scores.length,
    }));
  }

  // Variante de averageCompetencyScores() que preserva o nome (a versão
  // simples só guarda o id) — usado por getOverview() para "Competências com
  // maior/menor pontuação" (docs/evaluation360.md §1), que precisam de um
  // rótulo apresentável, não só o id interno.
  private averageCompetencyScoresNamed(
    results: { scoresByCompetency: string | null }[],
  ): { competencyId: string; name: string; average: number }[] {
    const compScores: Record<string, { name: string; scores: number[] }> = {};
    for (const r of results) {
      const sc: Record<string, CompetencyScoreEntry> = JSON.parse(r.scoresByCompetency ?? '{}');
      for (const [cId, data] of Object.entries(sc)) {
        if (!compScores[cId]) compScores[cId] = { name: data.name, scores: [] };
        if (data.score !== null) compScores[cId].scores.push(data.score);
      }
    }
    return Object.entries(compScores)
      .filter(([, v]) => v.scores.length > 0)
      .map(([competencyId, v]) => ({
        competencyId,
        name: v.name,
        average: v.scores.reduce((s, x) => s + x, 0) / v.scores.length,
      }));
  }

  // Painel geral (docs/evaluation360.md §1) — visão agregada de todos os
  // ciclos 360° de um tenant, sem identificar ninguém individualmente (mesma
  // regra de getTeamAnalytics/getOrganizationalAnalytics).
  async getOverview(tenantId?: string) {
    const cycles = await this.prisma.eval360Cycle.findMany({
      where: { deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      select: {
        id: true,
        name: true,
        status: true,
        endDate: true,
        updatedAt: true,
        createdBy: true,
      },
    });
    const cycleIds = cycles.map(c => c.id);
    const countByStatus = (status: Eval360CycleStatus) =>
      cycles.filter(c => c.status === status).length;
    // "Encerradas" (docs/evaluation360.md §1) não é o enum CANCELLED — esse
    // mapeia para "Arquivada" no vocabulário de 8 estados apresentáveis
    // (ver cycleStatusDisplay no frontend, components/evaluation360/colors.ts).
    // Aqui significa um ciclo cujo prazo já passou mas que ainda não foi
    // processado/concluído — mesma semântica derivada de data, não um valor
    // de BD próprio. "Abertas"/"Em preenchimento" excluem estes casos para
    // não contar o mesmo ciclo em dois baldes.
    const now = new Date();
    const isPastDeadline = (c: { status: string; endDate: Date }) =>
      (c.status === 'PUBLISHED' || c.status === 'IN_PROGRESS') && c.endDate < now;
    const openCount = cycles.filter(c => c.status === 'PUBLISHED' && !isPastDeadline(c)).length;
    const inProgressCount = cycles.filter(
      c => c.status === 'IN_PROGRESS' && !isPastDeadline(c),
    ).length;
    const closedCount = cycles.filter(isPastDeadline).length;

    const [participants, assignments, results] = await Promise.all([
      this.prisma.cycleParticipant.findMany({
        where: { cycleId: { in: cycleIds } },
        select: { userId: true, status: true },
      }),
      this.prisma.evaluatorAssignment.findMany({
        where: { cycleId: { in: cycleIds } },
        select: { evaluatorId: true, invitedAt: true, status: true },
      }),
      this.prisma.evaluationResult.findMany({
        where: { cycleId: { in: cycleIds } },
        select: { overallScore: true, scoresByCompetency: true },
      }),
    ]);

    const evaluatedUserIds = new Set(participants.map(p => p.userId));
    const invitedEvaluatorIds = new Set(
      assignments.filter(a => a.invitedAt !== null).map(a => a.evaluatorId),
    );
    const respondedEvaluatorIds = new Set(
      assignments.filter(a => a.status === 'COMPLETED').map(a => a.evaluatorId),
    );
    const pendingAssignments = assignments.filter(
      a => a.status === 'PENDING' || a.status === 'INVITED' || a.status === 'IN_PROGRESS',
    ).length;
    const completedParticipants = participants.filter(p => p.status === 'COMPLETED').length;

    const avgOverall = results.length
      ? results.reduce((s, r) => s + (r.overallScore ?? 0), 0) / results.length
      : 0;
    const competencyAverages = this.averageCompetencyScoresNamed(results).sort(
      (a, b) => b.average - a.average,
    );

    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingDeadline = cycles
      .filter(
        c =>
          (c.status === 'PUBLISHED' || c.status === 'IN_PROGRESS') &&
          c.endDate >= now &&
          c.endDate <= in7Days,
      )
      .sort((a, b) => a.endDate.getTime() - b.endDate.getTime())
      .map(c => ({ id: c.id, name: c.name, endDate: c.endDate }));

    const recentCompletedCycles = cycles
      .filter(c => c.status === 'COMPLETED')
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 5);
    const creatorNames = await this.deps.resolveActorNames(
      recentCompletedCycles.map(c => c.createdBy),
    );
    const recentCompleted = recentCompletedCycles.map(c => ({
      id: c.id,
      name: c.name,
      endDate: c.endDate,
      createdByName: creatorNames.get(c.createdBy) ?? c.createdBy,
    }));

    return {
      totalCycles: cycles.length,
      inPreparation: countByStatus('DRAFT'),
      open: openCount,
      inProgress: inProgressCount,
      completed: countByStatus('COMPLETED'),
      closed: closedCount,
      evaluatedCount: evaluatedUserIds.size,
      invitedEvaluatorsCount: invitedEvaluatorIds.size,
      respondedEvaluatorsCount: respondedEvaluatorIds.size,
      participationRate: invitedEvaluatorIds.size
        ? Math.round((respondedEvaluatorIds.size / invitedEvaluatorIds.size) * 100)
        : 0,
      completionRate: participants.length
        ? Math.round((completedParticipants / participants.length) * 100)
        : 0,
      avgOverall,
      competencyAverages,
      topCompetencies: competencyAverages.slice(0, 3),
      bottomCompetencies: competencyAverages.slice(-3).reverse(),
      pendingAssignments,
      upcomingDeadline,
      recentCompleted,
    };
  }

  // Nine-Box agregado — regra "ninguém vê o resultado de outro" (a mesma já
  // aplicada a getTeamAnalytics/calibrateScore): a versão anterior devolvia
  // nome+score reais por participante, isto é, exactamente o "cartão
  // individual de outra pessoa" que a regra proíbe — incluindo a GESTOR
  // sobre os seus próprios subordinados (por isso GESTOR perdeu o acesso a
  // esta rota, ver controller). Devolve agora só a contagem de pessoas por
  // quadrante, sempre os 9 quadrantes (mesmo a 0), para ADMIN/RH terem o
  // retrato de distribuição de talento sem identificar ninguém.
  // Eixo Performance (X) — média das fontes reais disponíveis por
  // participante (ignora as que não têm dado ainda, nunca inventa um valor):
  //   • Avaliação de desempenho → PerformanceReview.score (última review
  //     submetida), normalizado pela escala do próprio ciclo (cycle.scoreScale)
  //   • Objetivos/KPIs → Objective.progress, média ponderada por Objective.weight
  //   • Competências → média de scoresByCompetency desta própria avaliação 360º
  //   • Resultados individuais → EvaluationResult.weightedScore (o resultado
  //     global desta avaliação 360º)
  //
  // Eixo Potencial (Y) — cobre os 9 sub-fatores pedidos, consolidados em 7
  // conceitos distintos (decisão do utilizador: "Capacidade de aprendizagem"
  // e "Agilidade de aprendizagem" unificadas; idem "Liderança" e "Potencial
  // de liderança"):
  //   • PerformanceReview.potentialScore — nota geral de potencial do gestor
  //   • Competências de categoria LEADERSHIP (cobre Liderança/Potencial de
  //     liderança), tanto da review de performance como da própria 360º
  //   • PerformanceReview.{learningAgilityScore, adaptabilityScore,
  //     ambitionScore, responsibilityReadinessScore, mobilityFlexibilityScore,
  //     futureRoleReadinessScore} — os 6 sub-fatores restantes, capturados
  //     pelo gestor no submitReview (1-5 cada), tratados como um único bloco
  //     médio para não afogar potentialScore/liderança quando só alguns estão
  //     preenchidos
  // Sem nenhuma das fontes acima, cai-se de volta no proxy antigo (selfScore)
  // para não deixar o participante fora da matriz.
  //
  // NOTA: a UI de submissão de review (onde o gestor preencheria estes
  // campos) ainda não existe no frontend — gap pré-existente, também para o
  // potentialScore que já cá estava. Fica registado, não construído aqui.
  async getNineBox(query: NineBoxQueryDto) {
    const where: Prisma.EvaluationResultWhereInput = { cycleId: query.cycleId };
    if (query.departmentId) {
      const deptUsers = await this.prisma.user.findMany({
        where: { departmentId: Number(query.departmentId) },
        select: { id: true },
      });
      where.participantId = { in: deptUsers.map(u => String(u.id)) };
    }

    const results = await this.prisma.evaluationResult.findMany({
      where,
      select: {
        participantId: true,
        weightedScore: true,
        selfScore: true,
        scoresByCompetency: true,
      },
    });

    const numericIds = [
      ...new Set(results.map(r => Number(r.participantId)).filter(id => !Number.isNaN(id))),
    ];

    // Última review submetida (com score ou potentialScore) por utilizador —
    // findMany já vem ordenada desc, por isso o primeiro encontro por userId é o mais recente.
    const reviews = await this.prisma.performanceReview.findMany({
      where: {
        userId: { in: numericIds },
        OR: [{ score: { not: null } }, { potentialScore: { not: null } }],
      },
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        score: true,
        potentialScore: true,
        learningAgilityScore: true,
        adaptabilityScore: true,
        ambitionScore: true,
        responsibilityReadinessScore: true,
        mobilityFlexibilityScore: true,
        futureRoleReadinessScore: true,
        cycle: { select: { scoreScale: true } },
      },
    });
    const latestReviewByUser = new Map<number, (typeof reviews)[number]>();
    for (const r of reviews)
      if (!latestReviewByUser.has(r.userId)) latestReviewByUser.set(r.userId, r);
    const latestReviewIds = [...latestReviewByUser.values()].map(r => r.id);

    // CompetencyEvaluation não tem relation Prisma para Competency (só
    // competencyId escalar) — resolve-se a categoria com uma 2ª query, nunca
    // com um `where: { competency: {...} }` aninhado (essa relation não existe).
    const reviewCompetencyEvals = latestReviewIds.length
      ? await this.prisma.competencyEvaluation.findMany({
          where: { reviewId: { in: latestReviewIds } },
          select: { reviewId: true, competencyId: true, evaluatedLevel: true },
        })
      : [];
    const evaluatedCompIds = [...new Set(reviewCompetencyEvals.map(e => e.competencyId))];
    const leadershipCompIds = evaluatedCompIds.length
      ? new Set(
          (
            await this.prisma.competency.findMany({
              where: { id: { in: evaluatedCompIds }, category: 'LEADERSHIP' },
              select: { id: true },
            })
          ).map(c => c.id),
        )
      : new Set<number>();
    const reviewIdToUserId = new Map([...latestReviewByUser.values()].map(r => [r.id, r.userId]));
    const leadershipLevelsByUser = new Map<number, number[]>();
    for (const ev of reviewCompetencyEvals) {
      if (!leadershipCompIds.has(ev.competencyId)) continue;
      const userId = reviewIdToUserId.get(ev.reviewId);
      if (userId === undefined) continue;
      if (!leadershipLevelsByUser.has(userId)) leadershipLevelsByUser.set(userId, []);
      leadershipLevelsByUser.get(userId)!.push(ev.evaluatedLevel);
    }

    // Objectivos/KPIs — progresso médio ponderado por objectivo, ignora rascunhos.
    const objectives = numericIds.length
      ? await this.prisma.objective.findMany({
          where: { ownerId: { in: numericIds }, status: { not: 'DRAFT' }, deletedAt: null },
          select: { ownerId: true, progress: true, weight: true },
        })
      : [];
    const objectivesByUser = new Map<number, { total: number; weight: number }>();
    for (const o of objectives) {
      const acc = objectivesByUser.get(o.ownerId) ?? { total: 0, weight: 0 };
      acc.total += o.progress * o.weight;
      acc.weight += o.weight;
      objectivesByUser.set(o.ownerId, acc);
    }

    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const pct = (value: number | null | undefined, max: number): number | null =>
      value === null || value === undefined || max <= 0
        ? null
        : Math.min(1, Math.max(0, value / max));

    const levels = ['LOW', 'MID', 'HIGH'] as const;
    const counts = new Map<string, number>();
    for (const perf of levels) for (const pot of levels) counts.set(`${perf}_${pot}`, 0);

    for (const r of results) {
      const userId = Number(r.participantId);
      const review = latestReviewByUser.get(userId);
      const leadershipLevels = leadershipLevelsByUser.get(userId) ?? [];

      const scoresByCompetency: Record<string, CompetencyScoreEntry> = JSON.parse(
        r.scoresByCompetency ?? '{}',
      );
      const compEntries = Object.values(scoresByCompetency).filter(
        (v): v is CompetencyScoreEntry & { score: number } => v.score !== null,
      );
      const compLeadershipScores = compEntries
        .filter(v => v.category === 'LEADERSHIP')
        .map(v => v.score);

      const objAgg = objectivesByUser.get(userId);

      const perfSources = [
        pct(review?.score ?? null, review?.cycle.scoreScale ?? 5),
        objAgg && objAgg.weight > 0 ? pct(objAgg.total / objAgg.weight, 100) : null,
        compEntries.length ? pct(avg(compEntries.map(v => v.score)), 5) : null,
        pct(r.weightedScore, 5),
      ].filter((v): v is number => v !== null);
      const perf = perfSources.length ? avg(perfSources) : 0;

      const leadershipRatio = [
        ...leadershipLevels.map(v => v / 5),
        ...compLeadershipScores.map(v => v / 5),
      ];
      const subFactorScores = [
        review?.learningAgilityScore,
        review?.adaptabilityScore,
        review?.ambitionScore,
        review?.responsibilityReadinessScore,
        review?.mobilityFlexibilityScore,
        review?.futureRoleReadinessScore,
      ].filter((v): v is number => v !== null && v !== undefined);
      const potSources = [
        pct(review?.potentialScore ?? null, 5),
        leadershipRatio.length ? avg(leadershipRatio) : null,
        subFactorScores.length ? avg(subFactorScores.map(v => v / 5)) : null,
      ].filter((v): v is number => v !== null);
      const potential = potSources.length
        ? avg(potSources)
        : (pct(r.selfScore ?? r.weightedScore, 5) ?? 0);

      const perfBox = perf >= 0.67 ? 'HIGH' : perf >= 0.33 ? 'MID' : 'LOW';
      const potBox = potential >= 0.67 ? 'HIGH' : potential >= 0.33 ? 'MID' : 'LOW';
      const key = `${perfBox}_${potBox}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return levels.flatMap(potential =>
      levels.map(performance => ({
        performance,
        potential,
        box: `${performance}_${potential}`,
        count: counts.get(`${performance}_${potential}`) ?? 0,
      })),
    );
  }

  async generateReport(dto: GenerateReportDto, requesterId: string) {
    const cycle = await this.deps.findCycleOrFail(dto.cycleId);
    if (dto.scope === 'INDIVIDUAL' && dto.participantId) {
      // Mesma regra explícita de getParticipantResult: ninguém vê o
      // resultado de outro utilizador, nem ADMIN nem RH nem o GESTOR sobre
      // um subordinado — este endpoint tinha ficado de fora dessa auditoria
      // e devolvia o resultado individual completo de qualquer participantId
      // a quem tivesse role ADMIN/RH/GESTOR (ver @Roles em
      // evaluation360.controller.ts#generateReport).
      if (String(requesterId) !== String(dto.participantId)) {
        throw new ForbiddenException('Sem permissão para ver este resultado.');
      }
      const result = await this.prisma.evaluationResult.findUnique({
        where: {
          cycleId_participantId: { cycleId: dto.cycleId, participantId: dto.participantId },
        },
      });
      if (!result) throw new NotFoundException('Resultado não encontrado.');
      return {
        scope: 'INDIVIDUAL',
        cycleName: cycle.name,
        result: {
          ...result,
          scoresByCompetency: JSON.parse(result.scoresByCompetency),
          gaps: result.gaps ? JSON.parse(result.gaps) : [],
          strengths: result.strengths ? JSON.parse(result.strengths) : [],
        },
        aiInsights: dto.includeAiInsights ? await this.generateAiInsights(result) : null,
      };
    }
    return this.getOrganizationalAnalytics({ cycleId: dto.cycleId });
  }

  private async generateAiInsights(
    result: Prisma.EvaluationResultGetPayload<object>,
  ): Promise<string> {
    // Em produção: integrar com Anthropic API ou OpenAI para análise de texto
    const gaps: CompetencyGapEntry[] = result.gaps ? JSON.parse(result.gaps) : [];
    const strengths: CompetencyStrengthEntry[] = result.strengths
      ? JSON.parse(result.strengths)
      : [];
    return `Pontos fortes identificados: ${strengths.map(s => s.name).join(', ')}. Áreas prioritárias para desenvolvimento: ${gaps.map(g => g.name).join(', ')}.`;
  }

  // Relatório completo de um ciclo (docs/evaluation360.md §9) — cobre todos
  // os relatórios pedidos no documento que fazem sentido para UM ciclo
  // concreto (resultado geral, por competência/departamento/cargo/unidade/
  // grupo de avaliador, comparações, pontos fortes/gaps agregados, taxas,
  // avaliadores pendentes, competências críticas). "Evolução"/"Comparação
  // entre ciclos" ficam em getCycleEvolution(), que atravessa vários ciclos.
  async getCycleReport(cycleId: string, query: CycleReportQueryDto) {
    const cycle = await this.deps.findCycleOrFail(cycleId);

    let participantScope: string[] | undefined;
    if (query.departmentId || query.unitId || query.positionId) {
      const userWhere: Prisma.UserWhereInput = {};
      if (query.departmentId) userWhere.departmentId = Number(query.departmentId);
      if (query.unitId) userWhere.unitId = Number(query.unitId);
      if (query.positionId) userWhere.positionId = Number(query.positionId);
      const matching = await this.prisma.read.user.findMany({
        where: userWhere,
        select: { id: true },
      });
      participantScope = matching.map(u => String(u.id));
    }

    const results = await this.prisma.read.evaluationResult.findMany({
      where: {
        cycleId,
        ...(participantScope ? { participantId: { in: participantScope } } : {}),
      },
      select: {
        participantId: true,
        overallScore: true,
        weightedScore: true,
        selfScore: true,
        managerScore: true,
        peerScore: true,
        subordinateScore: true,
        externalScore: true,
        scoresByCompetency: true,
        gaps: true,
        strengths: true,
        isEligiblePromotion: true,
      },
    });

    const participantIds = results.map(r => Number(r.participantId));
    const users = participantIds.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: participantIds } },
          select: {
            id: true,
            position: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
            unit: { select: { id: true, name: true } },
          },
        })
      : [];
    const userById = new Map(users.map(u => [u.id, u]));

    const avg = (values: (number | null | undefined)[]): number | null => {
      const v = values.filter((x): x is number => x !== null && x !== undefined);
      return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
    };

    // Resultado geral 360°
    const overall = {
      totalParticipants: results.length,
      avgOverall: avg(results.map(r => r.overallScore)) ?? 0,
      avgWeighted: avg(results.map(r => r.weightedScore)) ?? 0,
      eligiblePromotion: results.filter(r => r.isEligiblePromotion).length,
    };

    // Resultados por competência (filtrável por uma competência específica)
    let byCompetency = this.averageCompetencyScoresNamed(results);
    if (query.competencyId)
      byCompetency = byCompetency.filter(c => c.competencyId === query.competencyId);

    // Resultados por departamento/cargo/unidade — agrupa pela dimensão do
    // avaliado (não da competência), média do overallScore por grupo.
    const groupBy = (
      pick: (u: {
        id: number;
        position: { id: number; name: string } | null;
        department: { id: number; name: string } | null;
        unit: { id: number; name: string } | null;
      }) => { id: number; name: string } | null,
    ) => {
      const buckets = new Map<number, { name: string; scores: number[] }>();
      for (const r of results) {
        const u = userById.get(Number(r.participantId));
        const dim = u ? pick(u) : null;
        if (!dim || r.overallScore === null) continue;
        if (!buckets.has(dim.id)) buckets.set(dim.id, { name: dim.name, scores: [] });
        buckets.get(dim.id)?.scores.push(r.overallScore);
      }
      return [...buckets.entries()]
        .map(([id, v]) => ({
          id: String(id),
          name: v.name,
          average: v.scores.reduce((s, x) => s + x, 0) / v.scores.length,
          count: v.scores.length,
        }))
        .sort((a, b) => b.average - a.average);
    };
    const byDepartment = groupBy(u => u.department);
    const byPosition = groupBy(u => u.position);
    const byUnit = groupBy(u => u.unit);

    // Resultados por grupo de avaliadores + comparações pedidas em §9
    const byEvaluatorGroup = {
      self: avg(results.map(r => r.selfScore)),
      manager: avg(results.map(r => r.managerScore)),
      peer: avg(results.map(r => r.peerScore)),
      subordinate: avg(results.map(r => r.subordinateScore)),
      external: avg(results.map(r => r.externalScore)),
    };
    const compare = (a: number | null, b: number | null) => ({
      a,
      b,
      diff: a !== null && b !== null ? a - b : null,
    });
    const selfVsExternal = compare(byEvaluatorGroup.self, byEvaluatorGroup.external);
    const managerVsPeer = compare(byEvaluatorGroup.manager, byEvaluatorGroup.peer);
    const managerVsSubordinate = compare(byEvaluatorGroup.manager, byEvaluatorGroup.subordinate);

    // Principais pontos fortes / principais gaps — agregados a partir de
    // EvaluationResult.strengths/gaps (já calculados por participante em
    // calculateParticipantResult), contados por competência em todo o ciclo.
    const aggregateNamed = (field: 'strengths' | 'gaps') => {
      const buckets = new Map<string, { name: string; scores: number[]; count: number }>();
      for (const r of results) {
        const list: (CompetencyStrengthEntry | CompetencyGapEntry)[] = r[field]
          ? JSON.parse(r[field])
          : [];
        for (const entry of list) {
          if (!buckets.has(entry.competencyId))
            buckets.set(entry.competencyId, { name: entry.name, scores: [], count: 0 });
          const b = buckets.get(entry.competencyId);
          if (!b) continue;
          b.count += 1;
          if (entry.score !== null) b.scores.push(entry.score);
        }
      }
      return [...buckets.entries()]
        .map(([competencyId, v]) => ({
          competencyId,
          name: v.name,
          occurrences: v.count,
          avgScore: v.scores.length ? v.scores.reduce((s, x) => s + x, 0) / v.scores.length : null,
        }))
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, 10);
    };
    const topStrengths = aggregateNamed('strengths');
    const topGaps = aggregateNamed('gaps');

    // Taxa de participação / taxa de conclusão — mesmo cálculo de
    // getOverview(), mas restrito a este ciclo.
    const [assignments, participants] = await Promise.all([
      this.prisma.read.evaluatorAssignment.findMany({
        where: { cycleId },
        select: { evaluatorId: true, evaluateeId: true, status: true, role: true },
      }),
      this.prisma.read.cycleParticipant.findMany({ where: { cycleId }, select: { status: true } }),
    ]);
    const invitedEvaluatorIds = new Set(assignments.map(a => a.evaluatorId));
    const respondedEvaluatorIds = new Set(
      assignments.filter(a => a.status === 'COMPLETED').map(a => a.evaluatorId),
    );
    const participationRate = invitedEvaluatorIds.size
      ? Math.round((respondedEvaluatorIds.size / invitedEvaluatorIds.size) * 100)
      : 0;
    const completionRate = participants.length
      ? Math.round(
          (participants.filter(p => p.status === 'COMPLETED').length / participants.length) * 100,
        )
      : 0;

    // Avaliadores pendentes — lista + contagem, filtrável por grupo de
    // avaliador (query.evaluatorRole aplica-se aqui, é o único ponto do
    // relatório onde "Grupo de avaliador" filtra uma lista e não uma média).
    const pendingAssignments = await this.prisma.read.evaluatorAssignment.findMany({
      where: {
        cycleId,
        status: { in: ['PENDING', 'INVITED', 'IN_PROGRESS'] },
        ...(query.evaluatorRole ? { role: query.evaluatorRole } : {}),
      },
      select: { evaluatorId: true, evaluateeId: true, role: true, status: true, invitedAt: true },
      take: 200,
    });
    const pendingUserIds = [
      ...new Set(pendingAssignments.flatMap(a => [Number(a.evaluatorId), Number(a.evaluateeId)])),
    ];
    const pendingUsers = pendingUserIds.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: pendingUserIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const pendingUserById = new Map(pendingUsers.map(u => [u.id, u.fullName]));
    const pendingEvaluators = {
      count: pendingAssignments.length,
      list: pendingAssignments.map(a => ({
        evaluatorId: a.evaluatorId,
        evaluatorName: pendingUserById.get(Number(a.evaluatorId)) ?? 'Colaborador',
        evaluateeId: a.evaluateeId,
        evaluateeName: pendingUserById.get(Number(a.evaluateeId)) ?? 'Colaborador',
        role: a.role,
        status: a.status,
        invitedAt: a.invitedAt,
      })),
    };

    // Competências críticas — média abaixo do nível esperado configurado no
    // ciclo (Eval360CycleCompetency.expectedLevel), ordenadas pelo maior gap.
    const cycleCompetencies = await this.prisma.read.eval360CycleCompetency.findMany({
      where: { cycleId },
      select: { competencyId: true, expectedLevel: true },
    });
    const expectedById = new Map(
      cycleCompetencies.map(c => [String(c.competencyId), c.expectedLevel]),
    );
    const criticalCompetencies = byCompetency
      .map(c => {
        const expectedLevel = expectedById.get(c.competencyId) ?? null;
        return {
          ...c,
          expectedLevel,
          gapToExpected: expectedLevel !== null ? c.average - expectedLevel : null,
        };
      })
      .filter(c => c.gapToExpected !== null && c.gapToExpected < 0)
      .sort((a, b) => (a.gapToExpected ?? 0) - (b.gapToExpected ?? 0));

    return {
      cycle: {
        id: cycle.id,
        name: cycle.name,
        status: cycle.status,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
      },
      overall,
      byCompetency,
      byDepartment,
      byPosition,
      byUnit,
      byEvaluatorGroup,
      selfVsExternal,
      managerVsPeer,
      managerVsSubordinate,
      topStrengths,
      topGaps,
      participationRate,
      completionRate,
      pendingEvaluators,
      criticalCompetencies,
    };
  }

  // "Evolução entre ciclos"/"Comparação entre ciclos" (docs/evaluation360.md
  // §9) — uma série de métricas agregadas por ciclo, ordenada por data de
  // início. `cycleIds` restringe a comparação a ciclos escolhidos; sem ele,
  // devolve a evolução completa (filtrável por tipo/estado/período, os
  // mesmos filtros de listCycles).
  async getCycleEvolution(query: CycleEvolutionQueryDto) {
    const where: Prisma.Eval360CycleWhereInput = { deletedAt: null };
    if (query.cycleIds)
      where.id = {
        in: query.cycleIds
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
      };
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.startDate = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const cycles = await this.prisma.read.eval360Cycle.findMany({
      where,
      orderBy: { startDate: 'asc' },
      select: { id: true, name: true, type: true, status: true, startDate: true, endDate: true },
    });

    const series = await Promise.all(
      cycles.map(async c => {
        const [results, assignments, participants] = await Promise.all([
          this.prisma.read.evaluationResult.findMany({
            where: { cycleId: c.id },
            select: { overallScore: true, weightedScore: true },
          }),
          this.prisma.read.evaluatorAssignment.findMany({
            where: { cycleId: c.id },
            select: { evaluatorId: true, status: true },
          }),
          this.prisma.read.cycleParticipant.findMany({
            where: { cycleId: c.id },
            select: { status: true },
          }),
        ]);
        const invited = new Set(assignments.map(a => a.evaluatorId));
        const responded = new Set(
          assignments.filter(a => a.status === 'COMPLETED').map(a => a.evaluatorId),
        );
        return {
          cycleId: c.id,
          name: c.name,
          type: c.type,
          status: c.status,
          startDate: c.startDate,
          endDate: c.endDate,
          totalParticipants: results.length,
          avgOverall: results.length
            ? results.reduce((s, r) => s + (r.overallScore ?? 0), 0) / results.length
            : 0,
          avgWeighted: results.length
            ? results.reduce((s, r) => s + (r.weightedScore ?? 0), 0) / results.length
            : 0,
          participationRate: invited.size ? Math.round((responded.size / invited.size) * 100) : 0,
          completionRate: participants.length
            ? Math.round(
                (participants.filter(p => p.status === 'COMPLETED').length / participants.length) *
                  100,
              )
            : 0,
        };
      }),
    );

    return { data: series };
  }
}
