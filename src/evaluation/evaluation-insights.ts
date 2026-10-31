// ============================================================
// INNOVA PLATFORM — AVALIAÇÃO — HISTÓRICO, COMPARAÇÃO E INDICADORES
// (docs/avaliacao_desempenho_robusta_claude_code.md §12-13).
// Colaborador interno do EvaluationService (não é provider Nest).
// ============================================================

import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { ADMIN_RH_ROLES } from '../auth/enums/role-groups';
import type { Actor } from './evaluation-structured';
import { effectiveRecommendationState } from './evaluation-structured';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export interface HistoryItem {
  competency: string;
  score: number;
}

export interface HistoryEntry {
  evaluationId: number;
  period: string;
  type: string;
  cycleId: number | null;
  cycleName: string | null;
  /** Formulário (critérios e pesos) usado — só se comparam avaliações do mesmo. */
  formId: number | null;
  overallScore: number | null;
  ratingLabel: string | null;
  submittedAt: Date;
  strengths: HistoryItem[];
  improvements: HistoryItem[];
  recommendations: { total: number; done: number; open: number; overdue: number };
}

export interface CompetencyDelta {
  competency: string;
  previous: number;
  current: number;
  delta: number;
}

export interface EvaluationComparison {
  from: { evaluationId: number; period: string; overallScore: number | null };
  to: { evaluationId: number; period: string; overallScore: number | null };
  comparable: boolean;
  /** Preenchido quando os critérios/pesos mudaram entre ciclos (§13). */
  limitation: string | null;
  overallDelta: number | null;
  competencies: CompetencyDelta[];
  strengthsMaintained: string[];
  strengthsNew: string[];
  improvementsResolved: string[];
  improvementsPending: string[];
  improvementsNew: string[];
  previousRecommendations: HistoryEntry['recommendations'];
}

/** Pontua cada competência pela nota registada (ponto forte ou área de melhoria). */
function scoreByCompetency(e: HistoryEntry): Map<string, { name: string; score: number }> {
  const m = new Map<string, { name: string; score: number }>();
  for (const i of [...e.strengths, ...e.improvements]) {
    m.set(norm(i.competency), { name: i.competency, score: i.score });
  }
  return m;
}

/** Função pura: compara duas avaliações consecutivas do mesmo tipo. */
export function compareEvaluations(prev: HistoryEntry, curr: HistoryEntry): EvaluationComparison {
  const sameForm = prev.formId !== null && prev.formId === curr.formId;
  const limitation = sameForm
    ? null
    : 'Os critérios ou pesos desta avaliação diferem da anterior; a variação da classificação global pode não ser comparável.';

  const prevScores = scoreByCompetency(prev);
  const currScores = scoreByCompetency(curr);
  const competencies: CompetencyDelta[] = [];
  for (const [key, c] of currScores) {
    const p = prevScores.get(key);
    if (p) {
      competencies.push({
        competency: c.name,
        previous: p.score,
        current: c.score,
        delta: c.score - p.score,
      });
    }
  }
  competencies.sort((a, b) => b.delta - a.delta);

  const names = (items: HistoryItem[]) =>
    new Map(items.map(i => [norm(i.competency), i.competency]));
  const prevS = names(prev.strengths);
  const currS = names(curr.strengths);
  const prevI = names(prev.improvements);
  const currI = names(curr.improvements);
  const only = (a: Map<string, string>, b: Map<string, string>) =>
    [...a].filter(([k]) => !b.has(k)).map(([, v]) => v);
  const both = (a: Map<string, string>, b: Map<string, string>) =>
    [...a].filter(([k]) => b.has(k)).map(([, v]) => v);

  return {
    from: { evaluationId: prev.evaluationId, period: prev.period, overallScore: prev.overallScore },
    to: { evaluationId: curr.evaluationId, period: curr.period, overallScore: curr.overallScore },
    comparable: sameForm,
    limitation,
    overallDelta:
      prev.overallScore !== null && curr.overallScore !== null
        ? +(curr.overallScore - prev.overallScore).toFixed(2)
        : null,
    competencies,
    strengthsMaintained: both(prevS, currS),
    strengthsNew: only(currS, prevS),
    improvementsResolved: only(prevI, currI),
    improvementsPending: both(prevI, currI),
    improvementsNew: only(currI, prevI),
    previousRecommendations: prev.recommendations,
  };
}

const SUBMITTED_TYPES = ['SELF', 'MANAGER', 'PEER', 'SUBORDINATE', 'CLIENT'] as const;
export type SubmittedType = (typeof SUBMITTED_TYPES)[number];
export const isEvalType = (v: string): v is SubmittedType =>
  (SUBMITTED_TYPES as readonly string[]).includes(v);

const PRIVILEGED: Role[] = [...ADMIN_RH_ROLES];

export class EvaluationInsightsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Histórico de avaliações submetidas de um colaborador + comparação das duas
   * mais recentes do mesmo tipo. Acesso: o próprio, o gestor directo, ADMIN/RH.
   */
  async getHistory(userId: number, actor: Actor, type: SubmittedType = 'MANAGER') {
    const owner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, managerId: true },
    });
    const allowed =
      !!owner &&
      (actor.id === userId || owner.managerId === actor.id || isPrivileged(actor, PRIVILEGED));
    if (!allowed) throw new NotFoundException('Colaborador não encontrado');

    const rows = await this.prisma.performanceEvaluation.findMany({
      where: { evaluatedId: userId, isDraft: false, type },
      orderBy: { createdAt: 'asc' },
      include: {
        cycle: { select: { id: true, name: true, formId: true } },
        strengthItems: { select: { competency: true, score: true } },
        improvementItems: { select: { competency: true, score: true } },
        recommendationItems: {
          select: {
            status: true,
            dueDate: true,
            pdiAction: { select: { status: true, progress: true, completedAt: true } },
          },
        },
      },
    });

    const now = new Date();
    const entries: HistoryEntry[] = rows.map(r => {
      const states = r.recommendationItems.map(rec =>
        effectiveRecommendationState(rec, rec.pdiAction, now),
      );
      return {
        evaluationId: r.id,
        period: r.period,
        type: r.type,
        cycleId: r.cycleId,
        cycleName: r.cycle?.name ?? null,
        formId: r.cycle?.formId ?? null,
        // Sem classificação final (rascunho/incompleta) não há nota a mostrar.
        overallScore: r.ratingLabel ? r.overallScore : null,
        ratingLabel: r.ratingLabel,
        submittedAt: r.createdAt,
        strengths: r.strengthItems,
        improvements: r.improvementItems,
        recommendations: {
          total: states.length,
          done: states.filter(s => s.status === 'CONCLUIDA').length,
          open: states.filter(s => s.status === 'PENDENTE' || s.status === 'EM_CURSO').length,
          overdue: states.filter(s => s.overdue).length,
        },
      };
    });

    const comparison =
      entries.length >= 2
        ? compareEvaluations(entries[entries.length - 2], entries[entries.length - 1])
        : null;
    return { userId, type, entries, comparison };
  }

  /**
   * Indicadores agregados de desempenho (acrescentam-se aos de getReportsOverview).
   * Só contam avaliações submetidas; nunca expõem texto individual.
   */
  async getPerformanceIndicators(where: Prisma.PerformanceEvaluationWhereInput) {
    const submitted: Prisma.PerformanceEvaluationWhereInput = { ...where, isDraft: false };
    const [byRating, strengths, improvements, recs, pdiPlans] = await Promise.all([
      this.prisma.read.performanceEvaluation.groupBy({
        by: ['ratingLabel'],
        where: { ...submitted, ratingLabel: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.read.evaluationStrength.groupBy({
        by: ['competency'],
        where: { evaluation: submitted },
        _count: { _all: true },
        _avg: { score: true },
      }),
      this.prisma.read.evaluationImprovementArea.groupBy({
        by: ['competency'],
        where: { evaluation: submitted },
        _count: { _all: true },
        _avg: { score: true },
      }),
      this.prisma.read.evaluationRecommendation.findMany({
        where: { evaluation: submitted },
        select: {
          status: true,
          priority: true,
          actionType: true,
          dueDate: true,
          pdiAction: { select: { status: true, progress: true, completedAt: true } },
        },
      }),
      this.prisma.read.performanceEvaluation.findMany({
        where: { ...submitted, pdiPlanId: { not: null } },
        select: { pdiPlan: { select: { overallProgress: true, status: true } } },
      }),
    ]);

    const top = <
      T extends { competency: string; _count: { _all: number }; _avg: { score: number | null } },
    >(
      rows: T[],
    ) =>
      rows
        .sort((a, b) => b._count._all - a._count._all)
        .slice(0, 10)
        .map(r => ({
          competency: r.competency,
          count: r._count._all,
          avgScore: r._avg.score === null ? null : +r._avg.score.toFixed(2),
        }));

    const now = new Date();
    const states = recs.map(r => ({
      rec: r,
      ...effectiveRecommendationState(r, r.pdiAction, now),
    }));
    const countBy = <K extends string | number>(key: (s: (typeof states)[number]) => K) => {
      const m: Record<string, number> = {};
      for (const s of states) m[String(key(s))] = (m[String(key(s))] ?? 0) + 1;
      return m;
    };
    const plans = pdiPlans.map(p => p.pdiPlan).filter((p): p is NonNullable<typeof p> => !!p);

    return {
      byRating: byRating.map(r => ({ label: r.ratingLabel as string, count: r._count._all })),
      topStrengths: top(strengths),
      recurringImprovements: top(improvements),
      recommendations: {
        total: states.length,
        byStatus: countBy(s => s.status),
        byPriority: countBy(s => s.rec.priority),
        overdue: states.filter(s => s.overdue).length,
        // Necessidades de formação = recomendações do tipo Formação.
        trainingNeeds: states.filter(s => s.rec.actionType === 'FORMACAO').length,
      },
      pdi: {
        plans: plans.length,
        avgProgress: plans.length
          ? Math.round(plans.reduce((s, p) => s + p.overallProgress, 0) / plans.length)
          : null,
      },
    };
  }
}
