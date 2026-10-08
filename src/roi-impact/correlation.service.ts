// src/roi-impact/correlation.service.ts
// "Correlações" (docs/roi-impact.md §7) — as 7 análises predefinidas do
// spec, cada uma calculada a partir de pares de dados REAIS já existentes
// noutros módulos (nunca inventados nem copiados para duplicado). Segue a
// mesma disciplina de RoiAnalysisService#computeResult: quando a amostra é
// insuficiente ou uma variável não tem dado dedicado, o resultado fica
// marcado (nota + sem coeficiente) em vez de apresentar um número
// definitivo sem dados fiáveis (ver "Princípio orientador" no spec).
//
// Nem toda análise tem os dois lados igualmente "limpos" — ver comentário
// em cada método privado para a proveniência exacta de X/Y:
//   - Pares 1 e 6 (Horas×Desempenho, Mentoria×Progressão) são os mais
//     fiáveis: ambos os lados são campos reais com FK directa para User.
//   - Par 3 (PDI×Retenção) usa `Employee.status`, não `User` — LegacyPdi
//     liga-se a Employee, e Employee/User não têm FK entre si (bug conhecido
//     noutros serviços — nunca inventar essa ligação aqui).
//   - Par 5 (Onboarding×Produtividade) usa a data da 1ª avaliação de
//     desempenho como aproximação a "tempo até produtividade plena", por
//     não existir nenhum campo dedicado — assinalado em `note`.
//   - Par 7 (Liderança×Engagement) usa a média de SurveyResponse.score dos
//     subordinados directos (User.managerId) como proxy de "engagement da
//     equipa liderada", em vez do modelo TeamHealth (existe no schema mas
//     nunca é escrito por nenhum serviço — ficaria sempre vazio).
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoiAnalysisService } from './roi-analysis.service';
import {
  RunCorrelationDto,
  CorrelationFilterDto,
  CorrelationType,
  ImpactCategory,
  RoiInitiativeType,
} from './roi-impact.dto';
import { computePearson, CorrelationPoint, MIN_CORRELATION_SAMPLE } from './correlation-stats.util';

interface PeriodFilter {
  departmentId?: number;
  periodStart?: Date;
  periodEnd?: Date;
}

interface PairResult {
  xLabel: string;
  yLabel: string;
  points: CorrelationPoint[];
  note?: string;
}

function dateRange(f: PeriodFilter): { gte?: Date; lte?: Date } | undefined {
  if (!f.periodStart && !f.periodEnd) return undefined;
  return {
    ...(f.periodStart ? { gte: f.periodStart } : {}),
    ...(f.periodEnd ? { lte: f.periodEnd } : {}),
  };
}

function sumByKey<T>(
  rows: T[],
  keyOf: (r: T) => number,
  valOf: (r: T) => number,
): Map<number, number> {
  const map = new Map<number, number>();
  for (const r of rows) {
    const k = keyOf(r);
    map.set(k, (map.get(k) ?? 0) + valOf(r));
  }
  return map;
}

function avgByKey<T>(
  rows: T[],
  keyOf: (r: T) => number,
  valOf: (r: T) => number,
): Map<number, number> {
  const sums = new Map<number, { total: number; count: number }>();
  for (const r of rows) {
    const k = keyOf(r);
    const cur = sums.get(k) ?? { total: 0, count: 0 };
    cur.total += valOf(r);
    cur.count += 1;
    sums.set(k, cur);
  }
  const out = new Map<number, number>();
  for (const [k, v] of sums) out.set(k, v.total / v.count);
  return out;
}

export interface CorrelationDefinition {
  type: CorrelationType;
  label: string;
  xLabel: string;
  yLabel: string;
  description: string;
}

const DEFINITIONS: Record<CorrelationType, Omit<CorrelationDefinition, 'type'>> = {
  HORAS_FORMACAO_DESEMPENHO: {
    label: 'Horas de formação × desempenho na avaliação',
    xLabel: 'Horas de formação (total)',
    yLabel: 'Score médio de desempenho',
    description:
      'Total de horas de formação frequentadas por colaborador vs. score médio nas avaliações de desempenho.',
  },
  COMPETENCIAS_PRODUTIVIDADE: {
    label: 'Competências desenvolvidas × produtividade',
    xLabel: 'Evolução de nível de competências (soma)',
    yLabel: 'Variação de produtividade (Impacto no Negócio)',
    description:
      'Evolução de nível de competências por colaborador vs. variação no indicador de produtividade registado em "Impacto no Negócio" — depende de haver registos de impacto lançados pelo RH.',
  },
  PDI_RETENCAO: {
    label: 'Participação em PDI × retenção do colaborador',
    xLabel: 'Progresso médio do PDI (%)',
    yLabel: 'Retenção (1 = activo, 0 = saído)',
    description:
      'Progresso nos planos de desenvolvimento individual vs. permanência do colaborador na empresa.',
  },
  INVESTIMENTO_ROTATIVIDADE: {
    label: 'Investimento em formação × rotatividade por departamento',
    xLabel: 'Investimento em formação (departamento)',
    yLabel: 'Taxa de rotatividade (%)',
    description:
      'Investimento total em formação por departamento vs. taxa de rotatividade do mesmo departamento.',
  },
  ONBOARDING_TEMPO_PRODUTIVIDADE: {
    label: 'Onboarding estruturado × tempo até produtividade plena',
    xLabel: 'Progresso do plano de onboarding (%)',
    yLabel: 'Dias até à 1ª avaliação de desempenho (aproximação)',
    description:
      'Progresso do plano de onboarding vs. dias entre a admissão e a primeira avaliação de desempenho submetida — usado como aproximação a "tempo até produtividade plena" por não existir um indicador dedicado.',
  },
  MENTORIA_PROGRESSAO_CARREIRA: {
    label: 'Mentoria/coaching × progressão de carreira',
    xLabel: 'Nº de mentorias como mentorado',
    yLabel: 'Progressão de carreira (1 = promovido, 0 = não)',
    description:
      'Participação em mentoria/coaching (como mentorado) vs. promoções aprovadas/executadas.',
  },
  LIDERANCA_ENGAGEMENT_EQUIPA: {
    label: 'Formação de liderança × engagement da equipa liderada',
    xLabel: 'Progresso em programa de liderança (%)',
    yLabel: 'Score médio de engagement da equipa (inquéritos)',
    description:
      'Progresso do gestor em programas de formação de liderança vs. score médio de engagement (inquéritos) dos seus subordinados directos.',
  },
};

@Injectable()
export class CorrelationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analysisSvc: RoiAnalysisService,
  ) {}

  // ══════════════════════════════════════════════════════
  // DEFINIÇÕES — as 7 análises pré-definidas do spec (§7)
  // ══════════════════════════════════════════════════════

  listDefinitions(): CorrelationDefinition[] {
    return (Object.keys(DEFINITIONS) as CorrelationType[]).map(type => ({
      type,
      ...DEFINITIONS[type],
    }));
  }

  // ══════════════════════════════════════════════════════
  // EXECUÇÃO — calcula e regista uma correlação
  // ══════════════════════════════════════════════════════

  async run(dto: RunCorrelationDto, createdById: number) {
    const period: PeriodFilter = {
      departmentId: dto.departmentId,
      periodStart: dto.periodStart ? new Date(dto.periodStart) : undefined,
      periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : undefined,
    };

    const pair = await this.buildPair(dto.type, period);
    const stat = computePearson(pair.points);

    const insufficientNote =
      stat == null
        ? `Amostra insuficiente (${pair.points.length} colaborador(es)/departamento(s), mínimo ${MIN_CORRELATION_SAMPLE}) para calcular um coeficiente fiável — correlação não apresentada como número definitivo.`
        : null;

    return this.prisma.correlation.create({
      data: {
        type: dto.type,
        departmentId: dto.departmentId ?? null,
        periodStart: period.periodStart ?? null,
        periodEnd: period.periodEnd ?? null,
        xLabel: pair.xLabel,
        yLabel: pair.yLabel,
        sampleSize: pair.points.length,
        coefficient: stat?.coefficient ?? null,
        pValue: stat?.pValue ?? null,
        significant: stat?.significant ?? null,
        dataPoints: pair.points as unknown as Prisma.InputJsonValue,
        note: [pair.note, insufficientNote].filter(Boolean).join(' ') || null,
        createdById,
      },
    });
  }

  async findAll(filter: CorrelationFilterDto = {}) {
    const where = {
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
    };
    const correlations = await this.prisma.read.correlation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        departmentId: true,
        periodStart: true,
        periodEnd: true,
        xLabel: true,
        yLabel: true,
        sampleSize: true,
        coefficient: true,
        pValue: true,
        significant: true,
        note: true,
        createdAt: true,
      },
    });
    return {
      total: correlations.length,
      correlations: correlations.map(c => ({ ...c, label: DEFINITIONS[c.type]?.label ?? c.type })),
    };
  }

  async findOne(id: number) {
    const c = await this.prisma.read.correlation.findUnique({ where: { id } });
    if (!c) throw new NotFoundException(`Correlação ${id} não encontrada`);
    return { ...c, label: DEFINITIONS[c.type]?.label ?? c.type };
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.correlation.delete({ where: { id } });
  }

  // ══════════════════════════════════════════════════════
  // DISPATCH
  // ══════════════════════════════════════════════════════

  private async buildPair(type: CorrelationType, period: PeriodFilter): Promise<PairResult> {
    switch (type) {
      case 'HORAS_FORMACAO_DESEMPENHO':
        return this.horasFormacaoDesempenho(period);
      case 'COMPETENCIAS_PRODUTIVIDADE':
        return this.competenciasProdutividade(period);
      case 'PDI_RETENCAO':
        return this.pdiRetencao(period);
      case 'INVESTIMENTO_ROTATIVIDADE':
        return this.investimentoRotatividade(period);
      case 'ONBOARDING_TEMPO_PRODUTIVIDADE':
        return this.onboardingTempoProdutividade(period);
      case 'MENTORIA_PROGRESSAO_CARREIRA':
        return this.mentoriaProgressaoCarreira(period);
      case 'LIDERANCA_ENGAGEMENT_EQUIPA':
        return this.liderancaEngagementEquipa(period);
    }
  }

  // ══════════════════════════════════════════════════════
  // PAR 1 — Horas de formação × desempenho na avaliação
  // ══════════════════════════════════════════════════════

  private async horasFormacaoDesempenho(period: PeriodFilter): Promise<PairResult> {
    const def = DEFINITIONS.HORAS_FORMACAO_DESEMPENHO;
    const range = dateRange(period);

    const hoursRows = await this.prisma.read.trainingParticipant.findMany({
      where: {
        attendedHours: { not: null },
        ...(range ? { completedAt: range } : {}),
        ...(period.departmentId ? { user: { departmentId: period.departmentId } } : {}),
      },
      select: { userId: true, attendedHours: true },
    });
    const scoreRows = await this.prisma.read.performanceReview.findMany({
      where: {
        score: { not: null },
        ...(range ? { submittedAt: range } : {}),
        ...(period.departmentId ? { user: { departmentId: period.departmentId } } : {}),
      },
      select: { userId: true, score: true },
    });

    const hoursByUser = sumByKey(
      hoursRows,
      r => r.userId,
      r => r.attendedHours ?? 0,
    );
    const scoreByUser = avgByKey(
      scoreRows,
      r => r.userId,
      r => r.score ?? 0,
    );

    const points: CorrelationPoint[] = [];
    for (const [userId, x] of hoursByUser) {
      const y = scoreByUser.get(userId);
      if (y != null) points.push({ x: +x.toFixed(1), y: +y.toFixed(2) });
    }
    return { xLabel: def.xLabel, yLabel: def.yLabel, points };
  }

  // ══════════════════════════════════════════════════════
  // PAR 2 — Competências desenvolvidas × produtividade
  // ══════════════════════════════════════════════════════

  private async competenciasProdutividade(period: PeriodFilter): Promise<PairResult> {
    const def = DEFINITIONS.COMPETENCIAS_PRODUTIVIDADE;
    const range = dateRange(period);

    const evoRows = await this.prisma.read.competencyEvolutionLog.findMany({
      where: {
        ...(range ? { createdAt: range } : {}),
        ...(period.departmentId ? { user: { departmentId: period.departmentId } } : {}),
      },
      select: { userId: true, previousLevel: true, newLevel: true },
    });
    const impactRows = await this.prisma.read.impactRecord.findMany({
      where: {
        category: ImpactCategory.PRODUTIVIDADE,
        subjectType: 'COLABORADOR',
        userId: { not: null },
        valueBefore: { not: null },
        valueAfter: { not: null },
        ...(range ? { observationPeriodStart: range } : {}),
      },
      select: { userId: true, valueBefore: true, valueAfter: true },
    });

    const evolutionByUser = sumByKey(
      evoRows,
      r => r.userId,
      r => r.newLevel - r.previousLevel,
    );
    const impactRowsWithUser = impactRows.filter(r => r.userId != null) as Array<{
      userId: number;
      valueBefore: number;
      valueAfter: number;
    }>;
    const productivityByUser = avgByKey(
      impactRowsWithUser,
      r => r.userId,
      r => r.valueAfter - r.valueBefore,
    );

    const points: CorrelationPoint[] = [];
    for (const [userId, x] of evolutionByUser) {
      const y = productivityByUser.get(userId);
      if (y != null) points.push({ x, y: +y.toFixed(2) });
    }
    return {
      xLabel: def.xLabel,
      yLabel: def.yLabel,
      points,
      note:
        points.length < MIN_CORRELATION_SAMPLE
          ? 'Depende de registos de "Impacto no Negócio" (categoria Produtividade) com valor antes/depois lançados pelo RH — sem esses registos a amostra fica vazia.'
          : undefined,
    };
  }

  // ══════════════════════════════════════════════════════
  // PAR 3 — Participação em PDI × retenção do colaborador
  // ══════════════════════════════════════════════════════

  private async pdiRetencao(period: PeriodFilter): Promise<PairResult> {
    const def = DEFINITIONS.PDI_RETENCAO;
    const range = dateRange(period);

    const pdiRows = await this.prisma.read.legacyPdi.findMany({
      where: { ...(range ? { startDate: range } : {}) },
      select: { employeeId: true, progressPercent: true },
    });
    const progressByEmployee = avgByKey(
      pdiRows,
      r => r.employeeId,
      r => r.progressPercent,
    );

    const employeeIds = Array.from(progressByEmployee.keys());
    const employees = await this.prisma.read.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, status: true },
    });
    const statusByEmployee = new Map(employees.map(e => [e.id, e.status]));

    const points: CorrelationPoint[] = [];
    for (const [employeeId, x] of progressByEmployee) {
      const status = statusByEmployee.get(employeeId);
      if (status == null) continue;
      points.push({ x: +x.toFixed(1), y: status === 'ACTIVE' ? 1 : 0 });
    }
    return {
      xLabel: def.xLabel,
      yLabel: def.yLabel,
      points,
      note: 'PDI liga-se a "Employee" (ficha de RH), não directamente a "User" — a retenção usa Employee.status, não dados de sessão.',
    };
  }

  // ══════════════════════════════════════════════════════
  // PAR 4 — Investimento em formação × rotatividade por departamento
  // ══════════════════════════════════════════════════════

  private async investimentoRotatividade(period: PeriodFilter): Promise<PairResult> {
    const def = DEFINITIONS.INVESTIMENTO_ROTATIVIDADE;
    const range = dateRange(period);

    const costRows = await this.prisma.read.costEntry.findMany({
      where: { ...(range ? { incurredAt: range } : {}) },
      select: { initiativeType: true, initiativeId: true, amount: true },
    });

    const deptCache = new Map<string, number | null>();
    const investmentByDept = new Map<number, number>();
    for (const c of costRows) {
      const cacheKey = `${c.initiativeType}:${c.initiativeId}`;
      if (!deptCache.has(cacheKey)) {
        const initiative = await this.analysisSvc.resolveInitiative(
          c.initiativeType as RoiInitiativeType,
          c.initiativeId,
        );
        deptCache.set(cacheKey, initiative?.departmentId ?? null);
      }
      const departmentId = deptCache.get(cacheKey);
      if (departmentId == null) continue;
      investmentByDept.set(departmentId, (investmentByDept.get(departmentId) ?? 0) + c.amount);
    }

    const departmentIds = Array.from(investmentByDept.keys());
    const points: CorrelationPoint[] = [];
    for (const departmentId of departmentIds) {
      const [headcount, exits] = await Promise.all([
        this.prisma.read.user.count({ where: { departmentId } }),
        this.prisma.read.user.count({
          where: { departmentId, exitDate: range ? range : { not: null } },
        }),
      ]);
      if (headcount === 0) continue;
      const turnoverRate = (exits / headcount) * 100;
      points.push({
        x: +(investmentByDept.get(departmentId) ?? 0).toFixed(2),
        y: +turnoverRate.toFixed(1),
      });
    }
    return {
      xLabel: def.xLabel,
      yLabel: def.yLabel,
      points,
      note: 'Só inclui custos cuja iniciativa tem departamento resolvível (Curso/Evento) — Formação (turma/sessão) ainda não guarda departamento de origem.',
    };
  }

  // ══════════════════════════════════════════════════════
  // PAR 5 — Onboarding estruturado × tempo até produtividade plena
  // ══════════════════════════════════════════════════════

  private async onboardingTempoProdutividade(period: PeriodFilter): Promise<PairResult> {
    const def = DEFINITIONS.ONBOARDING_TEMPO_PRODUTIVIDADE;
    const range = dateRange(period);

    const plans = await this.prisma.read.onboardingPlan.findMany({
      where: {
        ...(range ? { startDate: range } : {}),
        ...(period.departmentId ? { user: { departmentId: period.departmentId } } : {}),
      },
      select: { userId: true, progress: true },
    });
    const progressByUser = avgByKey(
      plans,
      r => r.userId,
      r => r.progress,
    );
    const userIds = Array.from(progressByUser.keys());

    const users = await this.prisma.read.user.findMany({
      where: { id: { in: userIds }, hireDate: { not: null } },
      select: { id: true, hireDate: true },
    });
    const hireDateByUser = new Map(users.map(u => [u.id, u.hireDate as Date]));

    const reviews = await this.prisma.read.performanceReview.findMany({
      where: { userId: { in: userIds }, submittedAt: { not: null } },
      select: { userId: true, submittedAt: true },
      orderBy: { submittedAt: 'asc' },
    });
    const firstReviewByUser = new Map<number, Date>();
    for (const r of reviews) {
      if (!firstReviewByUser.has(r.userId)) firstReviewByUser.set(r.userId, r.submittedAt as Date);
    }

    const points: CorrelationPoint[] = [];
    for (const [userId, x] of progressByUser) {
      const hireDate = hireDateByUser.get(userId);
      const firstReview = firstReviewByUser.get(userId);
      if (!hireDate || !firstReview) continue;
      const days = Math.round((firstReview.getTime() - hireDate.getTime()) / 86400000);
      if (days < 0) continue;
      points.push({ x: +x.toFixed(0), y: days });
    }
    return {
      xLabel: def.xLabel,
      yLabel: def.yLabel,
      points,
      note: 'Sem um indicador dedicado de "produtividade plena" no schema, o eixo Y aproxima-se pelos dias até à primeira avaliação de desempenho submetida.',
    };
  }

  // ══════════════════════════════════════════════════════
  // PAR 6 — Mentoria/coaching × progressão de carreira
  // ══════════════════════════════════════════════════════

  private async mentoriaProgressaoCarreira(period: PeriodFilter): Promise<PairResult> {
    const def = DEFINITIONS.MENTORIA_PROGRESSAO_CARREIRA;
    const range = dateRange(period);

    const mentorships = await this.prisma.read.mentoring.findMany({
      where: {
        ...(range ? { startedAt: range } : {}),
        ...(period.departmentId ? { mentee: { departmentId: period.departmentId } } : {}),
      },
      select: { menteeId: true },
    });
    const countByMentee = sumByKey(
      mentorships,
      r => r.menteeId,
      () => 1,
    );
    const menteeIds = Array.from(countByMentee.keys());

    const promotions = await this.prisma.read.promotionRequest.findMany({
      where: {
        userId: { in: menteeIds },
        status: { in: ['APPROVED', 'EXECUTED'] },
        ...(range ? { effectiveDate: range } : {}),
      },
      select: { userId: true },
    });
    const promotedSet = new Set(promotions.map(p => p.userId));

    const points: CorrelationPoint[] = menteeIds.map(menteeId => ({
      x: countByMentee.get(menteeId) ?? 0,
      y: promotedSet.has(menteeId) ? 1 : 0,
    }));
    return { xLabel: def.xLabel, yLabel: def.yLabel, points };
  }

  // ══════════════════════════════════════════════════════
  // PAR 7 — Formação de liderança × engagement da equipa liderada
  // ══════════════════════════════════════════════════════

  private async liderancaEngagementEquipa(period: PeriodFilter): Promise<PairResult> {
    const def = DEFINITIONS.LIDERANCA_ENGAGEMENT_EQUIPA;
    const range = dateRange(period);

    const leaders = await this.prisma.read.leadershipProgramParticipant.findMany({
      select: { userId: true, progress: true },
    });
    const progressByLeader = avgByKey(
      leaders,
      r => r.userId,
      r => r.progress,
    );
    const leaderIds = Array.from(progressByLeader.keys());

    const reports = await this.prisma.read.user.findMany({
      where: { managerId: { in: leaderIds } },
      select: { id: true, managerId: true },
    });
    const managerByReport = new Map(reports.map(r => [r.id, r.managerId as number]));
    const reportIds = reports.map(r => r.id);

    const surveys = await this.prisma.read.surveyResponse.findMany({
      where: {
        userId: { in: reportIds },
        score: { not: null },
        ...(range ? { createdAt: range } : {}),
      },
      select: { userId: true, score: true },
    });

    const engagementSumByLeader = new Map<number, { total: number; count: number }>();
    for (const s of surveys) {
      const managerId = managerByReport.get(s.userId);
      if (managerId == null) continue;
      const cur = engagementSumByLeader.get(managerId) ?? { total: 0, count: 0 };
      cur.total += s.score ?? 0;
      cur.count += 1;
      engagementSumByLeader.set(managerId, cur);
    }

    const points: CorrelationPoint[] = [];
    for (const [leaderId, x] of progressByLeader) {
      const agg = engagementSumByLeader.get(leaderId);
      if (!agg || agg.count === 0) continue;
      points.push({ x: +x.toFixed(0), y: +(agg.total / agg.count).toFixed(2) });
    }
    return {
      xLabel: def.xLabel,
      yLabel: def.yLabel,
      points,
      note: 'Engagement aproximado pela média de respostas a inquéritos (SurveyResponse) dos subordinados directos — o schema tem um modelo TeamHealth dedicado mas nenhum serviço o alimenta ainda.',
    };
  }
}
