// src/avatar-training/avatar-training-reports.service.ts
// Fase 7 — indicadores (docs/Avatar_Training.md §3) e relatórios (§11). Todos os
// valores vêm de registos reais; sem dados devolve-se `null` com estado NO_DATA
// («Sem dados») e nunca um número inventado. Cada indicador traz período,
// fórmula, fonte e data de actualização.
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/decorators';
import { isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { AvatarTrainingIntegrationsService } from './avatar-training-integrations.service';
import { AvatarTrainingProvidersService } from './avatar-training-providers.service';
import { AvatarReportFilterDto, AvatarReportType } from './dto/avatar-training.dto';
import {
  AVATAR_ADMIN_ROLES,
  AVATAR_AUTHOR_ROLES,
  AVATAR_PROGRESS_ROLES,
  parseJson,
  parseSteps,
} from './avatar-training.helpers';

const MAX_ROWS = 20_000;
const DEFAULT_PERIOD_DAYS = 30;
const TUTOR_TAG = '"channel":"AI_TUTOR"';
const FINISHED = ['COMPLETED', 'FAILED'] as const;
const OPEN_ASSIGNMENT = ['ASSIGNED', 'IN_PROGRESS'] as const;
const SIMULATION_TYPES = ['ROLE_PLAY', 'PRACTICAL_ASSESSMENT'] as const;
const WIDE_ROLES = [Role.ADMIN, Role.RH, Role.DIRECTOR, Role.AUDITOR];
const TEAM_ROLES = [Role.GESTOR, Role.LIDER, Role.INSTRUCTOR];

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) =>
  xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
const pct = (part: number, total: number) => (total > 0 ? round1((part / total) * 100) : null);

/** Quem pode pedir cada relatório (a visibilidade dos dados é depois limitada pelo âmbito). */
const REPORT_ROLES: Record<AvatarReportType, Role[]> = {
  USAGE: AVATAR_PROGRESS_ROLES,
  PARTICIPATION: AVATAR_PROGRESS_ROLES,
  PERFORMANCE: AVATAR_PROGRESS_ROLES,
  SIMULATIONS: AVATAR_PROGRESS_ROLES,
  COMPETENCIES: AVATAR_PROGRESS_ROLES,
  MANDATORY: AVATAR_PROGRESS_ROLES,
  ONBOARDING: AVATAR_PROGRESS_ROLES,
  DEPARTMENTS: AVATAR_PROGRESS_ROLES,
  EFFECTIVENESS: AVATAR_PROGRESS_ROLES,
  ANSWER_QUALITY: AVATAR_AUTHOR_ROLES,
  AI_TUTOR: AVATAR_AUTHOR_ROLES,
  COSTS: AVATAR_ADMIN_ROLES,
  INCIDENTS: [...AVATAR_ADMIN_ROLES, Role.AUDITOR],
};

const REPORT_TITLES: Record<AvatarReportType, string> = {
  USAGE: 'Utilização dos avatares',
  PARTICIPATION: 'Participação e conclusão',
  PERFORMANCE: 'Aproveitamento',
  SIMULATIONS: 'Simulações',
  COMPETENCIES: 'Competências',
  MANDATORY: 'Formação obrigatória',
  ONBOARDING: 'Onboarding',
  DEPARTMENTS: 'Unidades e departamentos',
  EFFECTIVENESS: 'Eficácia da aprendizagem',
  ANSWER_QUALITY: 'Qualidade das respostas',
  AI_TUTOR: 'AI-Tutor',
  COSTS: 'Custos tecnológicos',
  INCIDENTS: 'Incidentes e auditoria',
};

interface Period {
  from: Date;
  to: Date;
}

interface Scope {
  user: Prisma.UserWhereInput;
  programId?: number;
}

type IndicatorStatus = 'OK' | 'NO_DATA' | 'RESTRICTED';

interface Indicator {
  code: string;
  label: string;
  value: number | null;
  unit: string;
  status: IndicatorStatus;
  detail?: Record<string, unknown>;
  formula: string;
  source: string;
}

const ATTEMPT_SELECT = {
  id: true,
  userId: true,
  assignmentId: true,
  attemptNumber: true,
  status: true,
  score: true,
  passed: true,
  startedAt: true,
  completedAt: true,
  pausedSeconds: true,
  user: { select: { departmentId: true } },
  assignment: {
    select: {
      mandatory: true,
      session: {
        select: {
          id: true,
          title: true,
          experienceType: true,
          avatarId: true,
          program: { select: { id: true, title: true, avatarId: true } },
        },
      },
    },
  },
} satisfies Prisma.AvatarTrainingAttemptSelect;

type AttemptRow = Prisma.AvatarTrainingAttemptGetPayload<{ select: typeof ATTEMPT_SELECT }>;

interface TutorEvent {
  interactionType: string;
  stepKey: string | null;
  sessionId: number;
  meta: {
    status?: string;
    mode?: string;
    latencyMs?: number;
    tokensUsed?: number;
    provider?: string;
    model?: string;
    origin?: string;
  };
}

@Injectable()
export class AvatarTrainingReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: AvatarTrainingIntegrationsService,
    private readonly providers: AvatarTrainingProvidersService,
  ) {}

  // ── Âmbito, período e utilitários ──────────────────────────────────────────

  private period(f: AvatarReportFilterDto): Period {
    const to = f.to ? new Date(f.to) : new Date();
    const from = f.from
      ? new Date(f.from)
      : new Date(to.getTime() - DEFAULT_PERIOD_DAYS * 86_400_000);
    if (from > to) throw new BadRequestException('O início do período é posterior ao fim');
    return { from, to };
  }

  /** Formando: só o próprio; GESTOR/LIDER/INSTRUCTOR: equipa directa; restantes: todos. */
  private async scope(user: CurrentUserData, f: AvatarReportFilterDto): Promise<Scope> {
    const dept = f.departmentId ? { departmentId: f.departmentId } : {};
    const programId = f.programId;
    if (isPrivileged(user, WIDE_ROLES)) return { user: dept, programId };
    const ids = isPrivileged(user, TEAM_ROLES)
      ? [...(await this.integrations.directReportIds(user.id)), user.id]
      : [user.id];
    return { user: { id: { in: ids }, ...dept }, programId };
  }

  /** Relatórios de conteúdo (qualidade, AI-Tutor) são agregados e não pessoais: só filtram por departamento. */
  private contentScope(f: AvatarReportFilterDto): Scope {
    return {
      user: f.departmentId ? { departmentId: f.departmentId } : {},
      programId: f.programId,
    };
  }

  private attemptWhere(s: Scope, p: Period): Prisma.AvatarTrainingAttemptWhereInput {
    return {
      user: s.user,
      startedAt: { gte: p.from, lte: p.to },
      ...(s.programId ? { assignment: { session: { programId: s.programId } } } : {}),
    };
  }

  private assignmentWhere(
    s: Scope,
    p: Period,
    extra: Prisma.AvatarTrainingAssignmentWhereInput = {},
  ): Prisma.AvatarTrainingAssignmentWhereInput {
    return {
      user: s.user,
      assignedAt: { gte: p.from, lte: p.to },
      status: { not: 'CANCELLED' },
      ...(s.programId ? { session: { programId: s.programId } } : {}),
      ...extra,
    };
  }

  private async loadAttempts(where: Prisma.AvatarTrainingAttemptWhereInput) {
    const rows = await this.prisma.avatarTrainingAttempt.findMany({
      where,
      select: ATTEMPT_SELECT,
      orderBy: [{ assignmentId: 'asc' }, { attemptNumber: 'asc' }],
      take: MAX_ROWS + 1,
    });
    return { rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS };
  }

  private async tutorEvents(s: Scope, p: Period) {
    const rows = await this.prisma.avatarTrainingInteraction.findMany({
      where: {
        createdAt: { gte: p.from, lte: p.to },
        attempt: {
          user: s.user,
          ...(s.programId ? { assignment: { session: { programId: s.programId } } } : {}),
        },
        OR: [
          { interactionType: 'AVATAR_MESSAGE', metadata: { contains: TUTOR_TAG } },
          { interactionType: 'HELP_REQUEST' },
        ],
      },
      select: {
        interactionType: true,
        stepKey: true,
        metadata: true,
        attempt: { select: { assignment: { select: { sessionId: true } } } },
      },
      take: MAX_ROWS + 1,
    });
    const events: TutorEvent[] = rows.slice(0, MAX_ROWS).map(r => ({
      interactionType: r.interactionType,
      stepKey: r.stepKey,
      sessionId: r.attempt.assignment.sessionId,
      meta: parseJson<TutorEvent['meta']>(r.metadata, {}),
    }));
    return { events, truncated: rows.length > MAX_ROWS };
  }

  /** Respostas do tutor (uma por pedido) e pedidos de ajuda humana que não vieram do tutor. */
  private splitTutor(events: TutorEvent[]) {
    const responses = events.filter(e => e.interactionType === 'AVATAR_MESSAGE');
    const humanHelp = events.filter(
      e => e.interactionType === 'HELP_REQUEST' && e.meta.origin !== 'AI_TUTOR',
    );
    return { responses, humanHelp };
  }

  private durationMinutes(a: Pick<AttemptRow, 'startedAt' | 'completedAt' | 'pausedSeconds'>) {
    if (!a.completedAt) return null;
    const ms = a.completedAt.getTime() - a.startedAt.getTime() - a.pausedSeconds * 1000;
    return Math.max(0, ms / 60_000);
  }

  /** Primeira e última nota por atribuição (tentativas já ordenadas por número). */
  private firstLast(rows: AttemptRow[]) {
    const byAssignment = new Map<number, AttemptRow[]>();
    for (const r of rows) {
      if (r.score === null || !FINISHED.includes(r.status as (typeof FINISHED)[number])) continue;
      byAssignment.set(r.assignmentId, [...(byAssignment.get(r.assignmentId) ?? []), r]);
    }
    return [...byAssignment.values()]
      .filter(g => g.length > 1)
      .map(g => ({
        first: g[0],
        last: g[g.length - 1],
        delta: g[g.length - 1].score! - g[0].score!,
      }));
  }

  private indicator(base: Omit<Indicator, 'status'>, status?: IndicatorStatus): Indicator {
    return { ...base, status: status ?? (base.value === null ? 'NO_DATA' : 'OK') };
  }

  /** Acrescenta período, data de actualização e «Sem dados» a cada indicador. */
  private stamp(items: Indicator[], p: Period, now: Date) {
    return items.map(i => ({
      ...i,
      note: i.status === 'NO_DATA' ? 'Sem dados' : undefined,
      period: { from: p.from.toISOString(), to: p.to.toISOString() },
      updatedAt: now.toISOString(),
    }));
  }

  // ── §3 Visão Geral ─────────────────────────────────────────────────────────

  async overview(user: CurrentUserData, f: AvatarReportFilterDto) {
    const p = this.period(f);
    const s = await this.scope(user, f);
    const now = new Date();
    const admin = isPrivileged(user, AVATAR_ADMIN_ROLES);
    const where = this.attemptWhere(s, p);

    const [{ rows, truncated }, started, mandatory, overdue, tutorRaw] = await Promise.all([
      this.loadAttempts({ ...where, status: { in: [...FINISHED] } }),
      this.prisma.avatarTrainingAttempt.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.avatarTrainingAssignment.groupBy({
        by: ['status'],
        where: this.assignmentWhere(s, p, { mandatory: true }),
        _count: { _all: true },
      }),
      this.prisma.avatarTrainingAssignment.count({
        where: this.assignmentWhere(s, p, {
          mandatory: true,
          status: { in: [...OPEN_ASSIGNMENT] },
          dueDate: { lt: now },
        }),
      }),
      this.tutorEvents(s, p),
    ]);

    const learners = await this.prisma.avatarTrainingAttempt.groupBy({ by: ['userId'], where });
    const byStatus: Record<string, number> = {};
    for (const g of started) byStatus[g.status] = g._count._all;
    const startedTotal = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const completed = byStatus.COMPLETED ?? 0;
    const eligible = startedTotal - (byStatus.IN_PROGRESS ?? 0) - (byStatus.PAUSED ?? 0);

    const scores = rows.map(r => r.score).filter((x): x is number => x !== null);
    const durations = rows
      .filter(r => r.status === 'COMPLETED')
      .map(r => this.durationMinutes(r))
      .filter((x): x is number => x !== null);
    const judged = rows.filter(r => r.passed !== null);
    const deltas = this.firstLast(rows).map(x => x.delta);
    const simulations = rows.filter(r =>
      SIMULATION_TYPES.includes(
        r.assignment.session.experienceType as (typeof SIMULATION_TYPES)[number],
      ),
    ).length;

    const mand: Record<string, number> = {};
    for (const g of mandatory) mand[g.status] = g._count._all;
    const mandTotal = Object.values(mand).reduce((a, b) => a + b, 0);
    const mandOpen = (mand.ASSIGNED ?? 0) + (mand.IN_PROGRESS ?? 0);

    const { responses, humanHelp } = this.splitTutor(tutorRaw.events);
    const unanswered = responses.filter(
      e => e.meta.status === 'NO_SOURCE' || e.meta.status === 'ESCALATED',
    ).length;
    const tutorFailures = responses.filter(e => e.meta.status === 'UNAVAILABLE').length;
    const toReview = new Set(
      [
        ...responses.filter(e => e.meta.status === 'NO_SOURCE' || e.meta.status === 'ESCALATED'),
        ...humanHelp,
      ].map(e => `${e.sessionId}:${e.stepKey ?? ''}`),
    ).size;

    const usage = admin
      ? await this.prisma.avatarTrainingUsage.aggregate({
          where: { createdAt: { gte: p.from, lte: p.to } },
          _sum: { estimatedCost: true },
          _count: { _all: true },
        })
      : null;
    const providerFailures = admin
      ? await this.prisma.avatarTrainingUsage.count({
          where: { createdAt: { gte: p.from, lte: p.to }, success: false },
        })
      : 0;

    const restricted = (
      code: string,
      label: string,
      unit: string,
      formula: string,
      source: string,
    ) => this.indicator({ code, label, value: null, unit, formula, source }, 'RESTRICTED');

    const indicators = [
      this.indicator({
        code: 'SESSIONS',
        label: 'Sessões realizadas',
        value: startedTotal || null,
        unit: 'sessões',
        detail: { byStatus },
        formula: 'Tentativas iniciadas no período, com cada estado apresentado em separado.',
        source: 'AvatarTrainingAttempt',
      }),
      this.indicator({
        code: 'COMPLETION_RATE',
        label: 'Taxa de conclusão',
        value: pct(completed, eligible),
        unit: '%',
        detail: { completed, eligible },
        formula:
          'Tentativas concluídas ÷ tentativas iniciadas já terminadas (exclui as ainda em curso ou em pausa) × 100.',
        source: 'AvatarTrainingAttempt',
      }),
      this.indicator({
        code: 'AVG_SCORE',
        label: 'Aproveitamento médio',
        value: avg(scores),
        unit: 'pontos (escala 0–100)',
        detail: { evaluated: scores.length },
        formula: 'Média das notas das tentativas concluídas ou reprovadas com nota.',
        source: 'AvatarTrainingAttempt.score',
      }),
      this.indicator({
        code: 'AVG_DURATION',
        label: 'Tempo médio',
        value: avg(durations),
        unit: 'min',
        detail: { sessions: durations.length },
        formula: 'Duração das sessões concluídas (início → conclusão) menos o tempo em pausa.',
        source: 'AvatarTrainingAttempt',
      }),
      this.indicator({
        code: 'ACTIVE_LEARNERS',
        label: 'Formandos activos',
        value: learners.length || null,
        unit: 'formandos',
        formula: 'Utilizadores com pelo menos uma tentativa iniciada no período.',
        source: 'AvatarTrainingAttempt',
      }),
      this.indicator({
        code: 'SIMULATIONS_DONE',
        label: 'Simulações concluídas',
        value: rows.length ? simulations : null,
        unit: 'simulações',
        formula: 'Tentativas terminadas em sessões de role-play ou avaliação prática.',
        source: 'AvatarTrainingAttempt + AvatarTrainingSession.experienceType',
      }),
      this.indicator({
        code: 'PASS_RATE',
        label: 'Taxa de aprovação',
        value: pct(judged.filter(r => r.passed).length, judged.length),
        unit: '%',
        detail: { evaluated: judged.length },
        formula: 'Tentativas aprovadas ÷ tentativas avaliadas terminadas × 100.',
        source: 'AvatarTrainingAttempt.passed',
      }),
      this.indicator({
        code: 'EVOLUTION',
        label: 'Evolução entre tentativas',
        value: avg(deltas),
        unit: 'pontos',
        detail: { comparable: deltas.length },
        formula:
          'Média de (última − primeira nota) nas atribuições com 2+ tentativas avaliadas na mesma sessão.',
        source: 'AvatarTrainingAttempt.score',
      }),
      this.indicator({
        code: 'MANDATORY',
        label: 'Formação obrigatória',
        value: mandTotal ? pct(mand.COMPLETED ?? 0, mandTotal) : null,
        unit: '% concluída',
        detail: {
          total: mandTotal,
          completed: mand.COMPLETED ?? 0,
          pending: Math.max(0, mandOpen - overdue),
          overdue,
        },
        formula:
          'Atribuições obrigatórias do período: concluídas, pendentes e fora do prazo (abertas com prazo ultrapassado).',
        source: 'AvatarTrainingAssignment',
      }),
      this.indicator({
        code: 'ANSWER_QUALITY',
        label: 'Qualidade das respostas',
        value: responses.length ? pct(unanswered, responses.length) : null,
        unit: '% sem resposta adequada',
        detail: {
          tutorResponses: responses.length,
          unanswered,
          reportedErrors: tutorFailures,
          contentsToReview: toReview,
        },
        formula:
          'Respostas do AI-Tutor sem fonte suficiente ou escaladas para formador ÷ respostas do tutor × 100.',
        source: 'AvatarTrainingInteraction (canal AI-Tutor)',
      }),
      usage
        ? this.indicator({
            code: 'TECH_CONSUMPTION',
            label: 'Consumo tecnológico',
            value: usage._count._all ? round1(usage._sum.estimatedCost ?? 0) : null,
            unit: 'custo estimado',
            detail: { requests: usage._count._all },
            formula: 'Soma do custo estimado de voz/vídeo (unidades × tarifa configurada).',
            source: 'AvatarTrainingUsage',
          })
        : restricted(
            'TECH_CONSUMPTION',
            'Consumo tecnológico',
            'custo estimado',
            'Soma do custo estimado de voz/vídeo.',
            'AvatarTrainingUsage',
          ),
      admin
        ? this.indicator({
            code: 'INCIDENTS',
            label: 'Incidentes técnicos',
            value: providerFailures + tutorFailures + (byStatus.ABANDONED ?? 0) || null,
            unit: 'incidentes',
            detail: {
              providerFailures,
              tutorFailures,
              interruptedSessions: byStatus.ABANDONED ?? 0,
            },
            formula: 'Falhas de fornecedor + falhas do AI-Tutor + sessões abandonadas no período.',
            source: 'AvatarTrainingUsage + AvatarTrainingInteraction + AvatarTrainingAttempt',
          })
        : restricted(
            'INCIDENTS',
            'Incidentes técnicos',
            'incidentes',
            'Falhas de fornecedor, do AI-Tutor e sessões abandonadas.',
            'AvatarTrainingUsage',
          ),
    ];

    const alerts: { code: string; severity: 'WARNING' | 'CRITICAL'; message: string }[] = [];
    if (overdue > 0) {
      alerts.push({
        code: 'MANDATORY_OVERDUE',
        severity: 'CRITICAL',
        message: `${overdue} formação(ões) obrigatória(s) com avatar fora do prazo.`,
      });
    }
    if (toReview > 0) {
      alerts.push({
        code: 'CONTENT_TO_REVIEW',
        severity: 'WARNING',
        message: `${toReview} etapa(s) com perguntas sem resposta adequada — rever conteúdos ou fontes.`,
      });
    }
    if (admin) {
      alerts.push(...(await this.costLimitAlerts(now)));
      if (providerFailures > 0) {
        alerts.push({
          code: 'PROVIDER_FAILURES',
          severity: 'WARNING',
          message: `${providerFailures} falha(s) de fornecedor de voz/vídeo no período.`,
        });
      }
    }

    return {
      period: { from: p.from.toISOString(), to: p.to.toISOString() },
      scope: isPrivileged(user, WIDE_ROLES)
        ? 'ALL'
        : isPrivileged(user, TEAM_ROLES)
          ? 'TEAM'
          : 'SELF',
      generatedAt: now.toISOString(),
      truncated: truncated || tutorRaw.truncated,
      indicators: this.stamp(indicators, p, now),
      alerts,
    };
  }

  /** Fornecedores que já gastaram 80%+ do limite mensal configurado. */
  private async costLimitAlerts(now: Date) {
    const limits = await this.prisma.avatarTrainingProviderConfig.findMany({
      where: { monthlyCostLimit: { gt: 0 } },
    });
    if (!limits.length) return [];
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const spent = await this.prisma.avatarTrainingUsage.groupBy({
      by: ['provider', 'serviceType'],
      where: { createdAt: { gte: monthStart } },
      _sum: { estimatedCost: true },
    });
    const alerts: { code: string; severity: 'WARNING' | 'CRITICAL'; message: string }[] = [];
    for (const l of limits) {
      const used =
        spent.find(x => x.provider === l.provider && x.serviceType === l.serviceType)?._sum
          .estimatedCost ?? 0;
      const share = l.monthlyCostLimit ? used / l.monthlyCostLimit : 0;
      if (share >= 0.8) {
        alerts.push({
          code: 'COST_LIMIT',
          severity: share >= 1 ? 'CRITICAL' : 'WARNING',
          message: `${l.provider} (${l.serviceType}) usou ${Math.round(share * 100)}% do limite mensal.`,
        });
      }
    }
    return alerts;
  }

  // ── §11 Relatórios ─────────────────────────────────────────────────────────

  /** Catálogo dos relatórios a que o utilizador tem acesso. */
  catalog(user: CurrentUserData) {
    return Object.values(AvatarReportType)
      .filter(t => isPrivileged(user, REPORT_ROLES[t]))
      .map(t => ({ type: t, title: REPORT_TITLES[t] }));
  }

  async report(user: CurrentUserData, type: AvatarReportType, f: AvatarReportFilterDto) {
    if (!isPrivileged(user, REPORT_ROLES[type])) {
      throw new ForbiddenException('Sem permissão para este relatório');
    }
    const p = this.period(f);
    const generatedAt = new Date().toISOString();
    const body = await this.build(user, type, f, p);
    return {
      type,
      title: REPORT_TITLES[type],
      period: { from: p.from.toISOString(), to: p.to.toISOString() },
      generatedAt,
      noData: body.rows.length === 0,
      ...body,
    };
  }

  /** Exportação CSV (UTF-8 com BOM, para abrir bem no Excel) com as mesmas regras de acesso e âmbito. */
  async exportCsv(user: CurrentUserData, type: AvatarReportType, f: AvatarReportFilterDto) {
    const report = await this.report(user, type, f);
    const rows = report.rows as Record<string, unknown>[];
    const columns = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return '';
      let s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
      // Evita injecção de fórmulas em folhas de cálculo.
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      columns.map(esc).join(','),
      ...rows.map(r => columns.map(c => esc(r[c])).join(',')),
    ];
    const day = (d: string) => d.slice(0, 10);
    return {
      filename: `avatar-training-${type.toLowerCase()}-${day(report.period.from)}_${day(report.period.to)}.csv`,
      content: `﻿${lines.join('\r\n')}\r\n`,
    };
  }

  private async build(
    user: CurrentUserData,
    type: AvatarReportType,
    f: AvatarReportFilterDto,
    p: Period,
  ): Promise<{
    rows: unknown[];
    source: string;
    formula: string;
    truncated?: boolean;
    totals?: unknown;
    extra?: unknown;
  }> {
    switch (type) {
      case AvatarReportType.USAGE:
        return this.usage(await this.scope(user, f), p);
      case AvatarReportType.PARTICIPATION:
        return this.participation(await this.scope(user, f), p);
      case AvatarReportType.PERFORMANCE:
        return this.performance(await this.scope(user, f), p);
      case AvatarReportType.SIMULATIONS:
        return this.simulations(await this.scope(user, f), p);
      case AvatarReportType.COMPETENCIES:
        return this.competencies(await this.scope(user, f), p);
      case AvatarReportType.MANDATORY:
        return this.mandatory(await this.scope(user, f), p);
      case AvatarReportType.ONBOARDING:
        return this.onboarding(await this.scope(user, f), p);
      case AvatarReportType.DEPARTMENTS:
        return this.departments(await this.scope(user, f), p);
      case AvatarReportType.EFFECTIVENESS:
        return this.effectiveness(await this.scope(user, f), p);
      case AvatarReportType.ANSWER_QUALITY:
        return this.answerQuality(this.contentScope(f), p);
      case AvatarReportType.AI_TUTOR:
        return this.aiTutor(this.contentScope(f), p);
      case AvatarReportType.COSTS:
        return this.costs(p);
      case AvatarReportType.INCIDENTS:
        return this.incidents(p);
    }
  }

  private async usage(s: Scope, p: Period) {
    const { rows, truncated } = await this.loadAttempts(this.attemptWhere(s, p));
    const groups = new Map<number | null, AttemptRow[]>();
    for (const r of rows) {
      const session = r.assignment.session;
      const key = session.avatarId ?? session.program.avatarId ?? null;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const ids = [...groups.keys()].filter((k): k is number => k !== null);
    const avatars = await this.prisma.trainingAvatar.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, language: true },
    });
    const out = [...groups.entries()].map(([id, g]) => {
      const a = avatars.find(x => x.id === id);
      const byType: Record<string, number> = {};
      for (const r of g) {
        const t = r.assignment.session.experienceType;
        byType[t] = (byType[t] ?? 0) + 1;
      }
      return {
        avatarId: id,
        avatar: a?.name ?? 'Sem avatar associado',
        language: a?.language ?? null,
        sessions: g.length,
        learners: new Set(g.map(r => r.userId)).size,
        completed: g.filter(r => r.status === 'COMPLETED').length,
        avgDurationMinutes: avg(
          g
            .filter(r => r.status === 'COMPLETED')
            .map(r => this.durationMinutes(r))
            .filter((x): x is number => x !== null),
        ),
        byExperienceType: byType,
      };
    });
    out.sort((a, b) => b.sessions - a.sessions);
    return {
      rows: out,
      truncated,
      totals: { sessions: rows.length },
      source: 'AvatarTrainingAttempt + AvatarTrainingSession + TrainingAvatar',
      formula: 'Tentativas iniciadas no período agrupadas pelo avatar da sessão (ou da formação).',
    };
  }

  private async participation(s: Scope, p: Period) {
    const { rows, truncated } = await this.loadAttempts(this.attemptWhere(s, p));
    const groups = new Map<number, AttemptRow[]>();
    for (const r of rows) {
      const id = r.assignment.session.program.id;
      groups.set(id, [...(groups.get(id) ?? []), r]);
    }
    const out = [...groups.values()].map(g => {
      const byStatus: Record<string, number> = {};
      for (const r of g) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      const ended = g.length - (byStatus.IN_PROGRESS ?? 0) - (byStatus.PAUSED ?? 0);
      return {
        programId: g[0].assignment.session.program.id,
        program: g[0].assignment.session.program.title,
        learners: new Set(g.map(r => r.userId)).size,
        attempts: g.length,
        byStatus,
        completionRate: pct(byStatus.COMPLETED ?? 0, ended),
      };
    });
    out.sort((a, b) => b.attempts - a.attempts);
    return {
      rows: out,
      truncated,
      source: 'AvatarTrainingAttempt',
      formula: 'Concluídas ÷ tentativas já terminadas (exclui em curso/pausa) × 100, por formação.',
    };
  }

  private async performance(s: Scope, p: Period) {
    const { rows, truncated } = await this.loadAttempts({
      ...this.attemptWhere(s, p),
      status: { in: [...FINISHED] },
    });
    const groups = new Map<number, AttemptRow[]>();
    for (const r of rows) {
      const id = r.assignment.session.program.id;
      groups.set(id, [...(groups.get(id) ?? []), r]);
    }
    const out = [...groups.values()].map(g => {
      const scores = g.map(r => r.score).filter((x): x is number => x !== null);
      const judged = g.filter(r => r.passed !== null);
      return {
        programId: g[0].assignment.session.program.id,
        program: g[0].assignment.session.program.title,
        evaluated: scores.length,
        avgScore: avg(scores),
        bestScore: scores.length ? Math.max(...scores) : null,
        passRate: pct(judged.filter(r => r.passed).length, judged.length),
        evolution: avg(this.firstLast(g).map(x => x.delta)),
      };
    });
    return {
      rows: out,
      truncated,
      extra: { scale: '0–100' },
      source: 'AvatarTrainingAttempt.score / passed',
      formula:
        'Notas de tentativas terminadas por formação; evolução = média (última − primeira nota) por atribuição.',
    };
  }

  private async simulations(s: Scope, p: Period) {
    const { rows, truncated } = await this.loadAttempts({
      ...this.attemptWhere(s, p),
      status: { in: [...FINISHED] },
      assignment: {
        session: {
          experienceType: { in: [...SIMULATION_TYPES] },
          ...(s.programId ? { programId: s.programId } : {}),
        },
      },
    });
    const reviews = rows.length
      ? await this.prisma.avatarTrainingInteraction.findMany({
          where: {
            attemptId: { in: rows.map(r => r.id) },
            stepKey: 'REVIEW',
            metadata: { contains: '"rubric"' },
          },
          select: { attemptId: true, metadata: true },
          orderBy: { sequence: 'asc' },
        })
      : [];
    // Revisão mais recente por tentativa.
    const rubricByAttempt = new Map<number, { label: string; score: number }[]>();
    for (const r of reviews) {
      const rub = parseJson<{ rubric?: { label: string; score: number }[] }>(r.metadata, {}).rubric;
      if (rub) rubricByAttempt.set(r.attemptId, rub);
    }
    const groups = new Map<number, AttemptRow[]>();
    for (const r of rows) {
      const id = r.assignment.session.id;
      groups.set(id, [...(groups.get(id) ?? []), r]);
    }
    const out = [...groups.values()].map(g => {
      const criteria = new Map<string, number[]>();
      for (const a of g) {
        for (const c of rubricByAttempt.get(a.id) ?? []) {
          criteria.set(c.label, [...(criteria.get(c.label) ?? []), c.score]);
        }
      }
      const scores = g.map(r => r.score).filter((x): x is number => x !== null);
      const judged = g.filter(r => r.passed !== null);
      return {
        sessionId: g[0].assignment.session.id,
        scenario: g[0].assignment.session.title,
        program: g[0].assignment.session.program.title,
        finished: g.length,
        avgScore: avg(scores),
        passRate: pct(judged.filter(r => r.passed).length, judged.length),
        byCriterion: [...criteria.entries()].map(([label, xs]) => ({
          criterion: label,
          avgScore: avg(xs),
          reviews: xs.length,
        })),
      };
    });
    return {
      rows: out,
      truncated,
      source: 'AvatarTrainingAttempt + revisões de rubrica (AvatarTrainingInteraction)',
      formula:
        'Simulações = sessões de role-play ou avaliação prática; critérios da rubrica revista.',
    };
  }

  private async competencies(s: Scope, p: Period) {
    const results = await this.prisma.avatarTrainingCompetencyResult.findMany({
      where: {
        assessedAt: { gte: p.from, lte: p.to },
        attempt: {
          user: s.user,
          ...(s.programId ? { assignment: { session: { programId: s.programId } } } : {}),
        },
      },
      select: {
        competencyId: true,
        userId: true,
        score: true,
        levelBefore: true,
        levelAfter: true,
        applied: true,
      },
      take: MAX_ROWS + 1,
    });
    const truncated = results.length > MAX_ROWS;
    const groups = new Map<number, typeof results>();
    for (const r of results.slice(0, MAX_ROWS)) {
      groups.set(r.competencyId, [...(groups.get(r.competencyId) ?? []), r]);
    }
    const names = await this.prisma.competency.findMany({
      where: { id: { in: [...groups.keys()] } },
      select: { id: true, name: true },
    });
    const out = [...groups.entries()].map(([id, g]) => {
      const gains = g
        .filter(r => r.levelBefore !== null && r.levelAfter !== null)
        .map(r => (r.levelAfter as number) - (r.levelBefore as number));
      return {
        competencyId: id,
        competency: names.find(n => n.id === id)?.name ?? `Competência ${id}`,
        learners: new Set(g.map(r => r.userId)).size,
        results: g.length,
        avgScore: avg(g.map(r => r.score)),
        levelUpdates: g.filter(r => r.applied).length,
        avgLevelGain: avg(gains),
      };
    });
    out.sort((a, b) => b.results - a.results);
    return {
      rows: out,
      truncated,
      source: 'AvatarTrainingCompetencyResult (nível oficial em UserCompetency)',
      formula: 'Evidências registadas em sessões aprovadas no período, agrupadas por competência.',
    };
  }

  private async mandatory(s: Scope, p: Period) {
    const now = new Date();
    const list = await this.prisma.avatarTrainingAssignment.findMany({
      where: this.assignmentWhere(s, p, { mandatory: true }),
      select: {
        id: true,
        userId: true,
        status: true,
        dueDate: true,
        user: { select: { fullName: true } },
        session: { select: { title: true, program: { select: { id: true, title: true } } } },
      },
      take: MAX_ROWS + 1,
    });
    const truncated = list.length > MAX_ROWS;
    const rows = list.slice(0, MAX_ROWS);
    const isOverdue = (a: (typeof rows)[number]) =>
      (a.status === 'ASSIGNED' || a.status === 'IN_PROGRESS') && !!a.dueDate && a.dueDate < now;
    const groups = new Map<number, typeof rows>();
    for (const r of rows) {
      const id = r.session.program.id;
      groups.set(id, [...(groups.get(id) ?? []), r]);
    }
    const out = [...groups.values()].map(g => {
      const completed = g.filter(a => a.status === 'COMPLETED').length;
      const overdue = g.filter(isOverdue).length;
      const open = g.filter(a => a.status === 'ASSIGNED' || a.status === 'IN_PROGRESS').length;
      return {
        programId: g[0].session.program.id,
        program: g[0].session.program.title,
        assigned: g.length,
        completed,
        pending: open - overdue,
        overdue,
        completionRate: pct(completed, g.length),
      };
    });
    const overdueList = rows
      .filter(isOverdue)
      .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())
      .slice(0, 50)
      .map(a => ({
        assignmentId: a.id,
        userId: a.userId,
        learner: a.user.fullName,
        session: a.session.title,
        dueDate: a.dueDate,
        daysOverdue: Math.floor((now.getTime() - a.dueDate!.getTime()) / 86_400_000),
      }));
    return {
      rows: out,
      truncated,
      extra: { overdueList },
      source: 'AvatarTrainingAssignment',
      formula:
        'Atribuições obrigatórias criadas no período; fora do prazo = abertas com prazo ultrapassado.',
    };
  }

  private async onboarding(s: Scope, p: Period) {
    const now = new Date();
    const list = await this.prisma.avatarTrainingAssignment.findMany({
      where: this.assignmentWhere(s, p, { origin: 'ONBOARDING' }),
      select: {
        status: true,
        dueDate: true,
        session: { select: { program: { select: { id: true, title: true } } } },
      },
      take: MAX_ROWS + 1,
    });
    const truncated = list.length > MAX_ROWS;
    const groups = new Map<number, typeof list>();
    for (const r of list.slice(0, MAX_ROWS)) {
      const id = r.session.program.id;
      groups.set(id, [...(groups.get(id) ?? []), r]);
    }
    const out = [...groups.values()].map(g => {
      const completed = g.filter(a => a.status === 'COMPLETED').length;
      const overdue = g.filter(
        a =>
          (a.status === 'ASSIGNED' || a.status === 'IN_PROGRESS') && !!a.dueDate && a.dueDate < now,
      ).length;
      return {
        programId: g[0].session.program.id,
        program: g[0].session.program.title,
        assigned: g.length,
        completed,
        overdue,
        completionRate: pct(completed, g.length),
      };
    });
    return {
      rows: out,
      truncated,
      source: 'AvatarTrainingAssignment (origem ONBOARDING)',
      formula: 'Sessões atribuídas a partir de tarefas de onboarding, por formação.',
    };
  }

  private async departments(s: Scope, p: Period) {
    const { rows, truncated } = await this.loadAttempts(this.attemptWhere(s, p));
    const groups = new Map<number | null, AttemptRow[]>();
    for (const r of rows) {
      const key = r.user.departmentId ?? null;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const ids = [...groups.keys()].filter((k): k is number => k !== null);
    const names = await this.prisma.department.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const out = [...groups.entries()].map(([id, g]) => {
      const ended = g.filter(r => !['IN_PROGRESS', 'PAUSED'].includes(r.status)).length;
      const scores = g.map(r => r.score).filter((x): x is number => x !== null);
      return {
        departmentId: id,
        department: names.find(n => n.id === id)?.name ?? 'Sem departamento',
        learners: new Set(g.map(r => r.userId)).size,
        attempts: g.length,
        completed: g.filter(r => r.status === 'COMPLETED').length,
        completionRate: pct(g.filter(r => r.status === 'COMPLETED').length, ended),
        avgScore: avg(scores),
      };
    });
    out.sort((a, b) => b.attempts - a.attempts);
    return {
      rows: out,
      truncated,
      source: 'AvatarTrainingAttempt + User.departmentId',
      formula: 'Indicadores agregados por departamento do formando (sem dados individuais).',
    };
  }

  private async effectiveness(s: Scope, p: Period) {
    const { rows, truncated } = await this.loadAttempts(this.attemptWhere(s, p));
    const pairs = this.firstLast(rows);
    const groups = new Map<number, typeof pairs>();
    for (const x of pairs) {
      const id = x.first.assignment.session.id;
      groups.set(id, [...(groups.get(id) ?? []), x]);
    }
    const out = [...groups.values()].map(g => ({
      sessionId: g[0].first.assignment.session.id,
      session: g[0].first.assignment.session.title,
      program: g[0].first.assignment.session.program.title,
      learners: g.length,
      avgFirstScore: avg(g.map(x => x.first.score as number)),
      avgLastScore: avg(g.map(x => x.last.score as number)),
      avgDelta: avg(g.map(x => x.delta)),
      improvedRate: pct(g.filter(x => x.delta > 0).length, g.length),
    }));
    return {
      rows: out,
      truncated,
      source: 'AvatarTrainingAttempt.score',
      formula:
        'Compara a primeira e a última nota do mesmo formando na mesma sessão (avaliação equivalente); só com 2+ tentativas avaliadas.',
    };
  }

  private async answerQuality(s: Scope, p: Period) {
    const { events, truncated } = await this.tutorEvents(s, p);
    const { responses, humanHelp } = this.splitTutor(events);
    const groups = new Map<
      string,
      {
        sessionId: number;
        stepKey: string | null;
        requests: number;
        noSource: number;
        escalated: number;
        unavailable: number;
        helpRequests: number;
      }
    >();
    const slot = (e: TutorEvent) => {
      const key = `${e.sessionId}:${e.stepKey ?? ''}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          sessionId: e.sessionId,
          stepKey: e.stepKey,
          requests: 0,
          noSource: 0,
          escalated: 0,
          unavailable: 0,
          helpRequests: 0,
        };
        groups.set(key, g);
      }
      return g;
    };
    for (const e of responses) {
      const g = slot(e);
      g.requests++;
      if (e.meta.status === 'NO_SOURCE') g.noSource++;
      if (e.meta.status === 'ESCALATED') g.escalated++;
      if (e.meta.status === 'UNAVAILABLE') g.unavailable++;
    }
    for (const e of humanHelp) slot(e).helpRequests++;

    const sessions = await this.prisma.avatarTrainingSession.findMany({
      where: { id: { in: [...new Set([...groups.values()].map(g => g.sessionId))] } },
      select: { id: true, title: true, contentConfig: true },
    });
    const rows = [...groups.values()]
      .map(g => {
        const session = sessions.find(x => x.id === g.sessionId);
        const step = parseSteps(session?.contentConfig).find(x => x.key === g.stepKey);
        const flagged = g.noSource + g.escalated + g.helpRequests;
        return {
          ...g,
          session: session?.title ?? `Sessão ${g.sessionId}`,
          step: step?.title ?? null,
          unansweredRate: pct(g.noSource + g.escalated, g.requests),
          toReview: flagged > 0,
        };
      })
      .sort(
        (a, b) =>
          b.noSource + b.escalated + b.helpRequests - (a.noSource + a.escalated + a.helpRequests),
      )
      .slice(0, 50);
    return {
      rows,
      truncated,
      totals: {
        tutorResponses: responses.length,
        unanswered: responses.filter(e => ['NO_SOURCE', 'ESCALATED'].includes(e.meta.status ?? ''))
          .length,
        errors: responses.filter(e => e.meta.status === 'UNAVAILABLE').length,
      },
      source: 'AvatarTrainingInteraction (canal AI-Tutor) + pedidos de ajuda',
      formula:
        'Etapas com respostas do tutor sem fonte suficiente, escaladas para formador ou com pedidos de ajuda — candidatas a revisão.',
    };
  }

  private async aiTutor(s: Scope, p: Period) {
    const { events, truncated } = await this.tutorEvents(s, p);
    const { responses } = this.splitTutor(events);
    const count = (key: 'status' | 'mode' | 'provider' | 'model') => {
      const m: Record<string, number> = {};
      for (const e of responses) {
        const k = e.meta[key];
        if (k) m[k] = (m[k] ?? 0) + 1;
      }
      return Object.entries(m).map(([name, requests]) => ({ name, requests }));
    };
    const ok = responses.filter(e => e.meta.status === 'OK' || e.meta.status === 'ESCALATED');
    const tokens = ok.map(e => e.meta.tokensUsed).filter((x): x is number => typeof x === 'number');
    const latencies = ok
      .map(e => e.meta.latencyMs)
      .filter((x): x is number => typeof x === 'number');
    const failures = responses.filter(
      e => e.meta.status === 'UNAVAILABLE' || e.meta.status === 'LIMIT_REACHED',
    ).length;
    return {
      rows: count('mode'),
      truncated,
      totals: {
        requests: responses.length,
        failures,
        failureRate: pct(failures, responses.length),
        avgLatencyMs: latencies.length
          ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
          : null,
        tokens: tokens.length ? tokens.reduce((a, b) => a + b, 0) : null,
        avgTokensPerRequest: tokens.length
          ? Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length)
          : null,
        // O AI-Tutor não tem tarifa configurada: o custo não é estimado.
        estimatedCost: null,
        costNote: 'Sem tarifa configurada para o AI-Tutor — apresentado o consumo em tokens.',
      },
      extra: { byStatus: count('status'), byProvider: count('provider'), byModel: count('model') },
      source: 'AvatarTrainingInteraction (canal AI-Tutor)',
      formula: 'Pedidos por tipo, latência e tokens registados em cada resposta do tutor.',
    };
  }

  private async costs(p: Period) {
    const summary = await this.providers.usageSummary(p.from.toISOString(), p.to.toISOString());
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [configs, month, completed] = await Promise.all([
      this.prisma.avatarTrainingProviderConfig.findMany(),
      this.prisma.avatarTrainingUsage.groupBy({
        by: ['provider', 'serviceType'],
        where: { createdAt: { gte: monthStart } },
        _sum: { estimatedCost: true },
      }),
      this.prisma.avatarTrainingAttempt.count({
        where: { status: 'COMPLETED', completedAt: { gte: p.from, lte: p.to } },
      }),
    ]);
    const limits = configs.map(c => {
      const spent =
        month.find(m => m.provider === c.provider && m.serviceType === c.serviceType)?._sum
          .estimatedCost ?? 0;
      return {
        provider: c.provider,
        serviceType: c.serviceType,
        status: c.status,
        costPerUnit: c.costPerUnit,
        monthlyCostLimit: c.monthlyCostLimit,
        monthToDate: round1(spent),
        percentOfLimit: c.monthlyCostLimit ? round1((spent / c.monthlyCostLimit) * 100) : null,
      };
    });
    return {
      rows: summary.byProvider,
      totals: {
        totalEstimatedCost: summary.totalEstimatedCost,
        sessionsWithVoice: summary.sessionsWithVoice,
        costPerSession: summary.costPerSession,
        costPerCompletedSession: completed ? summary.totalEstimatedCost / completed : null,
      },
      extra: { limits },
      source: 'AvatarTrainingUsage + AvatarTrainingProviderConfig',
      formula: summary.formula,
    };
  }

  private async incidents(p: Period) {
    const range = { gte: p.from, lte: p.to };
    const [failures, abandoned, tutor, audit, auditByAction] = await Promise.all([
      this.prisma.avatarTrainingUsage.groupBy({
        by: ['provider', 'serviceType', 'errorCode'],
        where: { createdAt: range, success: false },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.prisma.avatarTrainingAttempt.count({
        where: { status: 'ABANDONED', startedAt: range },
      }),
      this.tutorEvents({ user: {} }, p),
      this.prisma.auditLog.findMany({
        where: {
          createdAt: range,
          OR: [{ entity: { startsWith: 'AvatarTraining' } }, { entity: 'TrainingAvatar' }],
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          userId: true,
          action: true,
          entity: true,
          entityId: true,
          createdAt: true,
        },
      }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where: {
          createdAt: range,
          OR: [{ entity: { startsWith: 'AvatarTraining' } }, { entity: 'TrainingAvatar' }],
        },
        _count: { _all: true },
      }),
    ]);
    const tutorFailures = this.splitTutor(tutor.events).responses.filter(
      e => e.meta.status === 'UNAVAILABLE',
    ).length;
    return {
      rows: failures.map(g => ({
        provider: g.provider,
        serviceType: g.serviceType,
        errorCode: g.errorCode,
        count: g._count._all,
        lastAt: g._max.createdAt,
      })),
      totals: {
        providerFailures: failures.reduce((n, g) => n + g._count._all, 0),
        tutorFailures,
        interruptedSessions: abandoned,
      },
      extra: {
        auditByAction: auditByAction.map(a => ({ action: a.action, count: a._count._all })),
        recentAudit: audit,
      },
      source: 'AvatarTrainingUsage + AvatarTrainingAttempt + AvatarTrainingInteraction + AuditLog',
      formula:
        'Falhas de fornecedor, falhas do AI-Tutor, sessões abandonadas e eventos de auditoria do módulo.',
    };
  }
}
