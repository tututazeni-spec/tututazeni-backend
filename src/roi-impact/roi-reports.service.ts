// src/roi-impact/roi-reports.service.ts
// "Relatórios" (docs/roi-impact.md §10) — vistas de leitura sobre dados já
// existentes noutros serviços do módulo (RoiAnalysis/ImpactRecord/
// TrainingPlan/LeadershipProgram/OnboardingPlan) e no ExecutiveDashboard
// legado (RoiImpactService) — nunca recalcula nem duplica o que esses
// serviços já produzem, só agrega/filtra para a forma tabular que cada
// relatório do spec pede (mesma disciplina do resto do módulo: "Princípio
// orientador" — nunca apresenta um número definitivo sem dados fiáveis).
import { Injectable } from '@nestjs/common';
import { Prisma, OnboardingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../pdf/pdf.service';
import { TrainingPlanService } from '../trainings/training-plan.service';
import { RoiAnalysisService } from './roi-analysis.service';
import { RoiImpactService } from './roi-impact.service';
import {
  RoiReportFilterDto,
  TopInitiativesReportFilterDto,
  RoiAnalysisStatus,
} from './roi-impact.dto';

function groupAvgRoi<T extends { roiPercent: number | null }>(
  rows: T[],
  keyFn: (row: T) => string,
): { key: string; avgRoi: number; count: number }[] {
  const map = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    if (row.roiPercent == null) continue;
    const key = keyFn(row);
    const entry = map.get(key) ?? { sum: 0, count: 0 };
    entry.sum += row.roiPercent;
    entry.count += 1;
    map.set(key, entry);
  }
  return Array.from(map.entries()).map(([key, { sum, count }]) => ({
    key,
    avgRoi: +(sum / count).toFixed(1),
    count,
  }));
}

function dateFilter(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
}

@Injectable()
export class RoiReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfSvc: PdfService,
    private readonly trainingPlanSvc: TrainingPlanService,
    private readonly analysisSvc: RoiAnalysisService,
    private readonly roiImpactSvc: RoiImpactService,
  ) {}

  // ══════════════════════════════════════════════════════
  // FILTROS PARTILHADOS
  // ══════════════════════════════════════════════════════

  private buildAnalysisWhere(filter: RoiReportFilterDto): Prisma.RoiAnalysisWhereInput {
    return {
      ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
      ...(filter.unit ? { unit: filter.unit } : {}),
      ...(filter.initiativeType ? { initiativeType: filter.initiativeType } : {}),
      ...(filter.evaluationModelUsed ? { evaluationModelUsed: filter.evaluationModelUsed } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(dateFilter(filter.from, filter.to)
        ? { createdAt: dateFilter(filter.from, filter.to) }
        : {}),
    };
  }

  // "Nível hierárquico" (spec §10) — RoiAnalysis.responsibleId é uma FK solta
  // sem relação Prisma (ver schema), por isso o filtro não pode ser um
  // `where` aninhado; resolve-se os utilizadores com o roleCode pedido numa
  // query à parte e filtra-se em memória.
  private async filterByHierarchyLevel<T extends { responsibleId: number | null }>(
    rows: T[],
    hierarchyLevel?: string,
  ): Promise<T[]> {
    if (!hierarchyLevel) return rows;
    const users = await this.prisma.read.user.findMany({
      where: { role: { code: hierarchyLevel } },
      select: { id: true },
    });
    const allowed = new Set(users.map(u => u.id));
    return rows.filter(r => r.responsibleId != null && allowed.has(r.responsibleId));
  }

  // ══════════════════════════════════════════════════════
  // 1 — ROI CONSOLIDADO DA ACADEMIA (período)
  // ══════════════════════════════════════════════════════

  async roiConsolidated(filter: RoiReportFilterDto = {}) {
    const analyses = await this.filterByHierarchyLevel(
      await this.prisma.read.roiAnalysis.findMany({ where: this.buildAnalysisWhere(filter) }),
      filter.hierarchyLevel,
    );

    const withRoi = analyses.filter(a => a.roiPercent != null);
    const totalCost = analyses.reduce((sum, a) => sum + (a.computedCost ?? 0), 0);
    const totalBenefit = analyses.reduce((sum, a) => sum + (a.computedBenefit ?? 0), 0);
    const avgRoi = withRoi.length
      ? +(withRoi.reduce((sum, a) => sum + (a.roiPercent ?? 0), 0) / withRoi.length).toFixed(1)
      : null;

    const statusCounts = new Map<string, number>();
    for (const a of analyses) statusCounts.set(a.status, (statusCounts.get(a.status) ?? 0) + 1);

    return {
      period: { from: filter.from ?? null, to: filter.to ?? null },
      totalAnalyses: analyses.length,
      totalCost,
      totalBenefit,
      netBenefit: +(totalBenefit - totalCost).toFixed(0),
      avgRoi,
      byStatus: Array.from(statusCounts.entries()).map(([status, count]) => ({ status, count })),
    };
  }

  // ══════════════════════════════════════════════════════
  // 2 — ROI POR DEPARTAMENTO/UNIDADE/TIPO DE INICIATIVA
  // ══════════════════════════════════════════════════════

  async roiByDimension(filter: RoiReportFilterDto = {}) {
    const analyses = await this.filterByHierarchyLevel(
      await this.prisma.read.roiAnalysis.findMany({
        where: { ...this.buildAnalysisWhere(filter), roiPercent: { not: null } },
        include: { department: { select: { name: true } } },
      }),
      filter.hierarchyLevel,
    );

    return {
      total: analyses.length,
      byDepartment: groupAvgRoi(analyses, a => a.department?.name ?? 'Sem departamento'),
      byUnit: groupAvgRoi(analyses, a => a.unit ?? 'Sem unidade'),
      byInitiativeType: groupAvgRoi(analyses, a => a.initiativeType),
    };
  }

  // ══════════════════════════════════════════════════════
  // 3 — IMPACTO NO NEGÓCIO POR INDICADOR
  // ══════════════════════════════════════════════════════

  async impactByIndicator(filter: RoiReportFilterDto = {}) {
    const records = await this.prisma.read.impactRecord.findMany({
      where: {
        ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
        ...(filter.initiativeType ? { initiativeType: filter.initiativeType } : {}),
        ...(dateFilter(filter.from, filter.to)
          ? { createdAt: dateFilter(filter.from, filter.to) }
          : {}),
      },
    });

    const map = new Map<
      string,
      {
        category: string;
        count: number;
        sumAttributed: number;
        withValue: number;
        sumAttribution: number;
        withAttribution: number;
      }
    >();
    for (const r of records) {
      const entry = map.get(r.indicatorName) ?? {
        category: r.category,
        count: 0,
        sumAttributed: 0,
        withValue: 0,
        sumAttribution: 0,
        withAttribution: 0,
      };
      entry.count += 1;
      if (r.valueBefore != null && r.valueAfter != null) {
        const variation = r.valueAfter - r.valueBefore;
        const attributed =
          r.attributionPercent != null ? variation * (r.attributionPercent / 100) : variation;
        entry.sumAttributed += attributed;
        entry.withValue += 1;
      }
      if (r.attributionPercent != null) {
        entry.sumAttribution += r.attributionPercent;
        entry.withAttribution += 1;
      }
      map.set(r.indicatorName, entry);
    }

    const indicators = Array.from(map.entries()).map(([indicatorName, e]) => ({
      indicatorName,
      category: e.category,
      records: e.count,
      avgAttributedImpact: e.withValue ? +(e.sumAttributed / e.withValue).toFixed(2) : null,
      avgAttributionPercent: e.withAttribution
        ? +(e.sumAttribution / e.withAttribution).toFixed(1)
        : null,
    }));

    return { total: records.length, indicators };
  }

  // ══════════════════════════════════════════════════════
  // 4/5 — CUSTO DE FORMAÇÃO VS. ORÇAMENTO / EXECUÇÃO ORÇAMENTAL
  // ══════════════════════════════════════════════════════
  //
  // Fonte real do "orçamento" da Academia: TrainingPlan.plannedBudget
  // (docs/trainings-detalhado.md §2) — nunca inventado aqui. O realizado
  // reutiliza TrainingPlanService#getExecution (mesma fórmula de custo já
  // usada nesse módulo), em vez de duplicar a soma de custos das Training.

  private resolveYearsFromFilter(filter: RoiReportFilterDto): number[] | null {
    if (!filter.from && !filter.to) return null;
    const fromYear = filter.from
      ? new Date(filter.from).getFullYear()
      : new Date(filter.to as string).getFullYear();
    const toYear = filter.to ? new Date(filter.to).getFullYear() : new Date().getFullYear();
    const years: number[] = [];
    for (let y = Math.min(fromYear, toYear); y <= Math.max(fromYear, toYear); y++) years.push(y);
    return years;
  }

  private async getTrainingPlansExecution(filter: RoiReportFilterDto) {
    const years = this.resolveYearsFromFilter(filter);
    const plans = await this.prisma.read.trainingPlan.findMany({
      where: {
        ...(years ? { year: { in: years } } : {}),
        ...(filter.departmentId ? { targetDeptIds: { has: filter.departmentId } } : {}),
      },
      select: { id: true, name: true, year: true, period: true, plannedBudget: true, status: true },
    });

    const rows = await Promise.all(
      plans.map(async p => {
        const execution = await this.trainingPlanSvc.getExecution(p.id);
        const plannedBudget = p.plannedBudget ?? 0;
        const realizedBudget = execution.realized.budget;
        return {
          planId: p.id,
          name: p.name,
          year: p.year,
          period: p.period,
          status: p.status,
          plannedBudget,
          realizedBudget,
          executionRatePercent: execution.executionRate.budget,
          variance: +(plannedBudget - realizedBudget).toFixed(2),
        };
      }),
    );

    const totalPlannedBudget = +rows.reduce((sum, r) => sum + r.plannedBudget, 0).toFixed(2);
    const totalRealizedBudget = +rows.reduce((sum, r) => sum + r.realizedBudget, 0).toFixed(2);
    return {
      plans: rows,
      totalPlannedBudget,
      totalRealizedBudget,
      overallExecutionRatePercent:
        totalPlannedBudget > 0
          ? Math.round((totalRealizedBudget / totalPlannedBudget) * 100)
          : null,
    };
  }

  async trainingCostVsBudget(filter: RoiReportFilterDto = {}) {
    return this.getTrainingPlansExecution(filter);
  }

  async budgetExecution(filter: RoiReportFilterDto = {}) {
    const data = await this.getTrainingPlansExecution(filter);
    return {
      ...data,
      plans: [...data.plans].sort(
        (a, b) => (a.executionRatePercent ?? 0) - (b.executionRatePercent ?? 0),
      ),
    };
  }

  // ══════════════════════════════════════════════════════
  // 6 — TOP INICIATIVAS POR ROI
  // ══════════════════════════════════════════════════════

  async topInitiativesByRoi(filter: TopInitiativesReportFilterDto = {}) {
    const analyses = await this.filterByHierarchyLevel(
      await this.prisma.read.roiAnalysis.findMany({
        where: { ...this.buildAnalysisWhere(filter), roiPercent: { not: null } },
        orderBy: { roiPercent: 'desc' },
      }),
      filter.hierarchyLevel,
    );
    const limit = filter.limit ?? 10;
    const top = analyses.slice(0, limit);

    const rows = await Promise.all(
      top.map(async a => ({
        id: a.id,
        name: a.name,
        initiativeType: a.initiativeType,
        initiative:
          (await this.analysisSvc.resolveInitiative(a.initiativeType, a.initiativeId))?.label ??
          null,
        departmentId: a.departmentId,
        roiPercent: a.roiPercent,
        computedBenefit: a.computedBenefit,
        computedCost: a.computedCost,
        status: a.status,
      })),
    );
    return { total: analyses.length, top: rows };
  }

  // ══════════════════════════════════════════════════════
  // 7 — INICIATIVAS SEM DADOS SUFICIENTES PARA CÁLCULO
  // ══════════════════════════════════════════════════════

  async insufficientDataInitiatives(filter: RoiReportFilterDto = {}) {
    const analyses = await this.filterByHierarchyLevel(
      await this.prisma.read.roiAnalysis.findMany({
        where: {
          ...this.buildAnalysisWhere(filter),
          status: RoiAnalysisStatus.DADOS_INSUFICIENTES,
        },
        include: { department: { select: { name: true } } },
      }),
      filter.hierarchyLevel,
    );

    const rows = analyses.map(a => {
      const totalCostSoFar = [a.costDirect, a.costIndirect, a.costOpportunity].reduce(
        (sum: number, v) => sum + (v ?? 0),
        0,
      );
      return {
        id: a.id,
        name: a.name,
        initiativeType: a.initiativeType,
        department: a.department?.name ?? null,
        costRegistered: totalCostSoFar > 0,
        totalCostSoFar,
        createdAt: a.createdAt,
      };
    });
    return {
      total: rows.length,
      expensiveWithoutReturn: rows.filter(r => r.costRegistered).length,
      initiatives: rows,
    };
  }

  // ══════════════════════════════════════════════════════
  // 8 — EVOLUÇÃO DO ROI ANO A ANO
  // ══════════════════════════════════════════════════════

  async roiEvolutionYearly(filter: RoiReportFilterDto = {}) {
    const analyses = await this.filterByHierarchyLevel(
      await this.prisma.read.roiAnalysis.findMany({
        where: { ...this.buildAnalysisWhere(filter), roiPercent: { not: null } },
      }),
      filter.hierarchyLevel,
    );

    const map = new Map<
      number,
      { sum: number; count: number; totalBenefit: number; totalCost: number }
    >();
    for (const a of analyses) {
      const year = a.createdAt.getFullYear();
      const entry = map.get(year) ?? { sum: 0, count: 0, totalBenefit: 0, totalCost: 0 };
      entry.sum += a.roiPercent ?? 0;
      entry.count += 1;
      entry.totalBenefit += a.computedBenefit ?? 0;
      entry.totalCost += a.computedCost ?? 0;
      map.set(year, entry);
    }

    const years = Array.from(map.entries())
      .map(([year, e]) => ({
        year,
        avgRoi: +(e.sum / e.count).toFixed(1),
        count: e.count,
        totalBenefit: e.totalBenefit,
        totalCost: e.totalCost,
      }))
      .sort((a, b) => a.year - b.year);
    return { years };
  }

  // ══════════════════════════════════════════════════════
  // 9 — IMPACTO DO ONBOARDING NA RETENÇÃO
  // ══════════════════════════════════════════════════════

  async onboardingRetentionImpact(filter: RoiReportFilterDto = {}) {
    const plans = await this.prisma.read.onboardingPlan.findMany({
      where: {
        ...(dateFilter(filter.from, filter.to)
          ? { startDate: dateFilter(filter.from, filter.to) }
          : {}),
        ...(filter.departmentId ? { user: { departmentId: filter.departmentId } } : {}),
      },
      select: { userId: true, status: true },
    });

    const users = await this.prisma.read.user.findMany({
      where: { id: { in: plans.map(p => p.userId) } },
      select: { id: true, active: true },
    });
    const activeByUser = new Map(users.map(u => [u.id, u.active]));

    const cohorts: Record<
      'COMPLETED' | 'INCOMPLETE' | 'ABANDONED',
      { total: number; retained: number }
    > = {
      COMPLETED: { total: 0, retained: 0 },
      INCOMPLETE: { total: 0, retained: 0 },
      ABANDONED: { total: 0, retained: 0 },
    };
    for (const p of plans) {
      const key: keyof typeof cohorts =
        p.status === OnboardingStatus.COMPLETED
          ? 'COMPLETED'
          : p.status === OnboardingStatus.ABANDONED
            ? 'ABANDONED'
            : 'INCOMPLETE';
      cohorts[key].total += 1;
      if (activeByUser.get(p.userId)) cohorts[key].retained += 1;
    }

    const rate = (c: { total: number; retained: number }) =>
      c.total > 0 ? +((c.retained / c.total) * 100).toFixed(1) : null;

    return {
      completedCohort: {
        count: cohorts.COMPLETED.total,
        retentionRatePercent: rate(cohorts.COMPLETED),
      },
      incompleteCohort: {
        count: cohorts.INCOMPLETE.total,
        retentionRatePercent: rate(cohorts.INCOMPLETE),
      },
      abandonedCohort: {
        count: cohorts.ABANDONED.total,
        retentionRatePercent: rate(cohorts.ABANDONED),
      },
      note:
        plans.length === 0
          ? 'Sem planos de onboarding no período/departamento seleccionado.'
          : null,
    };
  }

  // ══════════════════════════════════════════════════════
  // 10 — IMPACTO DA LIDERANÇA NO ENGAGEMENT DE EQUIPA
  // ══════════════════════════════════════════════════════

  async leadershipEngagementImpact(filter: RoiReportFilterDto = {}) {
    const participations = await this.prisma.read.leadershipProgramParticipant.findMany({
      select: { userId: true, progress: true },
    });
    if (participations.length === 0) {
      return { leaders: [], note: 'Sem participantes em programas de liderança registados.' };
    }

    const progressSumByLeader = new Map<number, { sum: number; count: number }>();
    for (const p of participations) {
      const e = progressSumByLeader.get(p.userId) ?? { sum: 0, count: 0 };
      e.sum += p.progress;
      e.count += 1;
      progressSumByLeader.set(p.userId, e);
    }

    const leaderUsers = await this.prisma.read.user.findMany({
      where: {
        id: { in: Array.from(progressSumByLeader.keys()) },
        ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
      },
      select: { id: true, fullName: true },
    });

    const reports = await this.prisma.read.user.findMany({
      where: { managerId: { in: leaderUsers.map(l => l.id) } },
      select: { id: true, managerId: true },
    });
    const managerByReport = new Map(reports.map(r => [r.id, r.managerId as number]));

    const surveys = await this.prisma.read.surveyResponse.findMany({
      where: {
        userId: { in: reports.map(r => r.id) },
        score: { not: null },
        ...(dateFilter(filter.from, filter.to)
          ? { createdAt: dateFilter(filter.from, filter.to) }
          : {}),
      },
      select: { userId: true, score: true },
    });

    const engagementByLeader = new Map<number, { sum: number; count: number }>();
    for (const s of surveys) {
      const managerId = managerByReport.get(s.userId);
      if (managerId == null) continue;
      const e = engagementByLeader.get(managerId) ?? { sum: 0, count: 0 };
      e.sum += s.score ?? 0;
      e.count += 1;
      engagementByLeader.set(managerId, e);
    }

    const teamSizeByLeader = new Map<number, number>();
    for (const r of reports) {
      const managerId = r.managerId as number;
      teamSizeByLeader.set(managerId, (teamSizeByLeader.get(managerId) ?? 0) + 1);
    }

    const leaders = leaderUsers
      .map(u => {
        const progress = progressSumByLeader.get(u.id);
        const engagement = engagementByLeader.get(u.id);
        return {
          leaderId: u.id,
          leaderName: u.fullName,
          avgProgress: progress ? Math.round(progress.sum / progress.count) : 0,
          teamSize: teamSizeByLeader.get(u.id) ?? 0,
          avgEngagement:
            engagement && engagement.count > 0
              ? +(engagement.sum / engagement.count).toFixed(2)
              : null,
        };
      })
      .sort((a, b) => b.avgProgress - a.avgProgress);

    return {
      leaders,
      note: leaders.every(l => l.avgEngagement == null)
        ? 'Sem respostas de inquérito de engagement para as equipas destes líderes.'
        : null,
    };
  }

  // ══════════════════════════════════════════════════════
  // 11 — RELATÓRIO EXECUTIVO PARA ADMINISTRAÇÃO
  // ══════════════════════════════════════════════════════

  async executiveSummary(filter: RoiReportFilterDto = {}) {
    return this.roiImpactSvc.getExecutiveDashboard({
      from: filter.from,
      to: filter.to,
      departmentId: filter.departmentId,
    });
  }

  async exportExecutiveSummaryPdf(filter: RoiReportFilterDto = {}): Promise<Buffer> {
    const dashboard = await this.executiveSummary(filter);
    const period =
      'label' in dashboard.period
        ? dashboard.period.label
        : `${dashboard.period.from} a ${dashboard.period.to}`;

    return this.pdfSvc.generateExecutiveReport({
      title: 'Relatório Executivo — ROI & Impacto',
      period,
      metrics: [
        { label: 'ROI global', value: `${dashboard.headline.overallRoi}%` },
        { label: 'Benefício total', value: `$${dashboard.headline.totalBenefit.toLocaleString()}` },
        { label: 'Custo total', value: `$${dashboard.headline.totalCost.toLocaleString()}` },
        { label: 'Colaboradores impactados', value: dashboard.headline.impactedEmployees },
        { label: 'Iniciativas com ROI positivo', value: dashboard.headline.positiveRoiInitiatives },
        {
          label: 'Iniciativas com ROI negativo/indeterminado',
          value: dashboard.headline.negativeOrIndeterminateInitiatives,
        },
      ],
      sections: [
        { title: 'Síntese', content: dashboard.headline.narrative },
        {
          title: 'Principais insights',
          content: dashboard.topInsights.join('\n') || 'Sem insights disponíveis para o período.',
        },
        {
          title: 'Alertas',
          content:
            dashboard.alerts.map(a => `[${a.severity}] ${a.message}`).join('\n') ||
            'Sem alertas activos.',
        },
      ],
    });
  }
}
