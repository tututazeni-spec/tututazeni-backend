// src/roi-impact/roi-impact.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoiFilterDto, CalculateRoiDto, WhatIfDto, RoiConfidence } from './roi-impact.dto';

// ─────────────────────────────────────────────────────────────────
// CONSTANTS & HELPERS
// ─────────────────────────────────────────────────────────────────

const DEFAULTS = {
  costPerEnrollment:   200,   // USD per enrollment (training cost)
  benefitPerCompletion:500,   // USD estimated value per completion
  avgSalaryPerDay:     200,   // USD avg daily salary
  turnoverCost:        15000, // USD avg cost to replace an employee
  avgWorkdayValue:     300,   // USD value of a productive workday
};

function pct(num: number, den: number): number {
  return den > 0 ? +(((num / den) * 100)).toFixed(1) : 0;
}

function roiFormula(benefit: number, cost: number): number {
  return cost > 0 ? +(((benefit - cost) / cost) * 100).toFixed(1) : 0;
}

function bcr(benefit: number, cost: number): number {
  return cost > 0 ? +(benefit / cost).toFixed(2) : 0;
}

function paybackMonths(cost: number, benefitPerMonth: number): number {
  return benefitPerMonth > 0 ? +(cost / benefitPerMonth).toFixed(1) : 0;
}

function dateRange(filter: RoiFilterDto): { gte: Date; lte: Date } {
  const lte = filter.to   ? new Date(filter.to)   : new Date();
  const gte = filter.from ? new Date(filter.from) : new Date(lte.getFullYear() - 1, lte.getMonth(), 1);
  return { gte, lte };
}

function confidenceLevel(sampleSize: number, dataPoints: number): RoiConfidence {
  if (sampleSize >= 50 && dataPoints >= 3) return RoiConfidence.HIGH;
  if (sampleSize >= 20 && dataPoints >= 2) return RoiConfidence.MEDIUM;
  return RoiConfidence.LOW;
}

function buildNarrative(roi: number, benefit: number, cost: number, completions: number): string {
  if (completions === 0) return 'Dados insuficientes para gerar narrativa de impacto.';
  const label = roi >= 200 ? 'excepcional' : roi >= 100 ? 'muito positivo' : roi >= 0 ? 'positivo' : 'negativo';
  return `O programa de aprendizagem gerou um retorno ${label} de ${roi}% sobre o investimento. ` +
    `Com ${completions} conclusões no período, o benefício estimado de $${benefit.toLocaleString()} ` +
    `superou o custo de $${cost.toLocaleString()} em $${(benefit - cost).toLocaleString()}.`;
}

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class RoiImpactService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // CORE ROI CALCULATION
  // ══════════════════════════════════════════════════════

  async calculateTrainingRoi(from: string, to: string, departmentId?: number) {
    const filter: RoiFilterDto = { from, to, departmentId };
    return this.calculateRoiFull(filter, {});
  }

  async calculateRoiFull(filter: RoiFilterDto, params: Partial<CalculateRoiDto>) {
    const range     = dateRange(filter);
    const uWhere    = filter.departmentId ? { user: { departmentId: filter.departmentId } } : {};
    const costPerEnroll = params.costPerEnrollment    ?? DEFAULTS.costPerEnrollment;
    const benefitPerC   = params.benefitPerCompletion ?? DEFAULTS.benefitPerCompletion;

    const where: any = { enrolledAt: { gte: range.gte, lte: range.lte }, ...uWhere };

    const [
      enrollments, completed, inProgress,
      avgAssessmentScore,
      totalLessonCompletions,
      performanceBefore, performanceAfter,
      turnoverBefore, turnoverAfter,
      competencyEvolution,
    ] = await Promise.all([
      this.prisma.enrollment.count({ where }),
      this.prisma.enrollment.count({ where: { ...where, status: 'CONCLUIDO' } }),
      this.prisma.enrollment.count({ where: { ...where, status: 'EM_ANDAMENTO' } }),
      (this.prisma as any).assessmentAttempt.aggregate({
       where: { createdAt: { gte: range.gte, lte: range.lte } },
       _avg:  { score: true },
       }).catch(() => ({ _avg: { score: null } })),
      (this.prisma as any).lessonProgress.count({
      where: { completed: true, updatedAt: { gte: range.gte, lte: range.lte } },
      }).catch(() => 0),
      // Performance before training period
      this.prisma.performanceReview.aggregate({
        where: { createdAt: { lt: range.gte }, ...(filter.departmentId ? { user: { departmentId: filter.departmentId } } : {}) },
        _avg:  { score: true },
      }).catch(() => ({ _avg: { score: null } })),
      // Performance after training period
      this.prisma.performanceReview.aggregate({
        where: { createdAt: { gte: range.gte }, ...(filter.departmentId ? { user: { departmentId: filter.departmentId } } : {}) },
        _avg:  { score: true },
      }).catch(() => ({ _avg: { score: null } })),
      // Turnover proxy: inactive users created before period
      this.prisma.user.count({ where: { active: false, createdAt: { lt: range.gte } } }),
      this.prisma.user.count({ where: { active: false, updatedAt: { gte: range.gte, lte: range.lte } } }),
      // Competency evolution
      this.prisma.userCompetency.aggregate({
        where: filter.departmentId ? { user: { departmentId: filter.departmentId } } : {},
        _avg:  { currentLevel: true },
      }).catch(() => ({ _avg: { currentLevel: null } })),
    ]);

    const completionRate = pct(completed, enrollments);
    const totalCost      = enrollments * costPerEnroll;
    const totalBenefit   = completed   * benefitPerC;
    const roi            = roiFormula(totalBenefit, totalCost);
    const bcrVal         = bcr(totalBenefit, totalCost);
    const payback        = paybackMonths(totalCost, totalBenefit / 12);

    // Retention impact
    const retentionSaved    = Math.max(0, turnoverBefore - turnoverAfter);
    const retentionBenefit  = retentionSaved * DEFAULTS.turnoverCost;

    // Performance lift
    const perfBefore = performanceBefore._avg.score ?? 0;
    const perfAfter  = performanceAfter._avg.score  ?? 0;
    const perfLift   = perfBefore > 0 ? +(perfAfter - perfBefore).toFixed(2) : 0;

    // Learning hours
    const totalHours = Math.round((totalLessonCompletions * 15) / 60);

    const confidence = confidenceLevel(completed, [
      avgAssessmentScore._avg.score !== null ? 1 : 0,
      perfBefore > 0 && perfAfter > 0 ? 1 : 0,
      retentionSaved > 0 ? 1 : 0,
    ].filter(Boolean).length);

    return {
      period:  { from: range.gte, to: range.lte },
      volume: {
        enrollments, completed, inProgress,
        completionRate,
        uniqueLearners: 0, // would need distinct query
        totalHours,
        avgScore: avgAssessmentScore._avg.score ? +avgAssessmentScore._avg.score.toFixed(1) : null,
      },
      financial: {
        totalCost,    totalBenefit,
        roi,          bcrVal,
        paybackMonths: payback,
        netBenefit:   +(totalBenefit - totalCost).toFixed(0),
        retentionBenefit,
        totalWithRetention: +(totalBenefit + retentionBenefit).toFixed(0),
        roiWithRetention:   roiFormula(totalBenefit + retentionBenefit, totalCost),
        roiLabel: roi >= 200 ? 'EXCEPTIONAL' : roi >= 100 ? 'EXCELLENT' : roi >= 0 ? 'POSITIVE' : 'NEGATIVE',
        status:   roi >= 100 ? '🟢' : roi >= 0 ? '🟡' : '🔴',
      },
      impact: {
        perfBefore:   perfBefore > 0 ? +perfBefore.toFixed(2) : null,
        perfAfter:    perfAfter  > 0 ? +perfAfter.toFixed(2)  : null,
        perfLift,
        retentionSaved,
        avgCompetency: competencyEvolution._avg.currentLevel ? +competencyEvolution._avg.currentLevel.toFixed(2) : null,
      },
      confidence,
      assumptions: {
        costPerEnrollment:   costPerEnroll,
        benefitPerCompletion:benefitPerC,
        note:                confidence === 'LOW' ? '⚠️ Amostra pequena — use com cautela' : null,
      },
      narrative: buildNarrative(roi, totalBenefit, totalCost, completed),
    };
  }

  // ══════════════════════════════════════════════════════
  // IMPACT METRICS (Kirkpatrick L1–L5)
  // ══════════════════════════════════════════════════════

  async getImpactMetrics(filter: RoiFilterDto = {}) {
    const range = dateRange(filter);
    const uWhere = filter.departmentId ? { user: { departmentId: filter.departmentId } } : {};

    const [
      // L1: Reaction
      surveyResponses, avgSurveyScore,
      // L2: Learning
      completions, avgAssessmentScore, lessonHours,
      // L3: Behaviour (PDI actions, skill evolution)
      completedActions, skillAvg,
      // L4: Results (performance, retention)
      avgPerf, prevAvgPerf,
      totalActive, inactiveThisPeriod,
      // L5: ROI proxy
      totalEnroll,
    ] = await Promise.all([
      // L1
      this.prisma.surveyResponse.count({ where: { createdAt: { gte: range.gte }, ...uWhere } }),
      this.prisma.surveyResponse.aggregate({ where: { createdAt: { gte: range.gte }, ...uWhere }, _avg: { score: true } }).catch(() => ({ _avg: { score: null } })),
      // L2
      this.prisma.enrollment.count({ where: { status: 'CONCLUIDO', enrolledAt: { gte: range.gte, lte: range.lte }, ...uWhere } }),
      (this.prisma as any).assessmentAttempt.aggregate({ where: { createdAt: { gte: range.gte, lte: range.lte } }, _avg: { score: true } }).catch(() => ({ _avg: { score: null } })),
      (this.prisma as any).lessonProgress.count({ where: { completed: true, updatedAt: { gte: range.gte } } }).catch(() => 0),
      // L3
      this.prisma.developmentPlanAction.count({ where: { status: 'COMPLETED', completedAt: { gte: range.gte }, plan: uWhere ? { user: uWhere.user } : {} } }).catch(() => 0),
      this.prisma.userCompetency.aggregate({ where: uWhere, _avg: { currentLevel: true } }).catch(() => ({ _avg: { currentLevel: null } })),
      // L4
      this.prisma.performanceReview.aggregate({ where: { createdAt: { gte: range.gte }, ...uWhere }, _avg: { score: true } }).catch(() => ({ _avg: { score: null } })),
      this.prisma.performanceReview.aggregate({ where: { createdAt: { lt: range.gte }, ...uWhere }, _avg: { score: true } }).catch(() => ({ _avg: { score: null } })),
      this.prisma.user.count({ where: { active: true, ...(filter.departmentId ? { departmentId: filter.departmentId } : {}) } }),
      this.prisma.user.count({ where: { active: false, updatedAt: { gte: range.gte }, ...(filter.departmentId ? { departmentId: filter.departmentId } : {}) } }),
      // L5
      this.prisma.enrollment.count({ where: { enrolledAt: { gte: range.gte, lte: range.lte }, ...uWhere } }),
    ]);

    const perfBefore    = prevAvgPerf._avg.score ?? 0;
    const perfAfter     = avgPerf._avg.score     ?? 0;
    const perfLift      = perfBefore > 0 && perfAfter > 0 ? +(perfAfter - perfBefore).toFixed(2) : null;
    const retentionRate = totalActive > 0 ? pct(totalActive - inactiveThisPeriod, totalActive) : null;
    const engScore      = avgSurveyScore._avg.score ? +(avgSurveyScore._avg.score * 20).toFixed(1) : null; // scale to 100

    const costEst    = totalEnroll * DEFAULTS.costPerEnrollment;
    const benefitEst = completions * DEFAULTS.benefitPerCompletion;

    return {
      period: { from: range.gte, to: range.lte },
      levels: {
        L1_reaction: {
          label:   'Reação & Satisfação',
          score:   engScore,
          responses: surveyResponses,
          confidence: RoiConfidence.MEDIUM,
        },
        L2_learning: {
          label:     'Aprendizagem',
          completions,
          avgScore:  avgAssessmentScore._avg.score ? +avgAssessmentScore._avg.score.toFixed(1) : null,
          hoursEstimated: Math.round((lessonHours * 15) / 60),
          confidence: completions >= 20 ? RoiConfidence.HIGH : RoiConfidence.MEDIUM,
        },
        L3_behaviour: {
          label:         'Mudança de Comportamento',
          idpActionsCompleted: completedActions,
          avgCompetencyLevel:  skillAvg._avg.currentLevel ? +skillAvg._avg.currentLevel.toFixed(2) : null,
          confidence: RoiConfidence.MEDIUM,
        },
        L4_results: {
          label:         'Resultados',
          avgPerfBefore: perfBefore > 0 ? +perfBefore.toFixed(2) : null,
          avgPerfAfter:  perfAfter  > 0 ? +perfAfter.toFixed(2)  : null,
          perfLift,
          retentionRate,
          confidence:    perfLift !== null ? RoiConfidence.HIGH : RoiConfidence.LOW,
        },
        L5_roi: {
          label:       'ROI Financeiro',
          estimatedCost:    costEst,
          estimatedBenefit: benefitEst,
          roi:              roiFormula(benefitEst, costEst),
          confidence:       RoiConfidence.MEDIUM,
          note:             'Baseado em estimativas padrão — configure valores reais para maior precisão',
        },
      },
      summary: {
        totalCompletions:  completions,
        totalHours:        Math.round((lessonHours * 15) / 60),
        highPotentials:    0,
        newHiresThisYear:  await this.prisma.user.count({ where: { createdAt: { gte: new Date(new Date().getFullYear(), 0, 1) }, active: true } }),
      },
    };
  }

  // ══════════════════════════════════════════════════════
  // RETENTION IMPACT
  // ══════════════════════════════════════════════════════

  async getRetentionImpact(filter: RoiFilterDto = {}) {
    const range = dateRange(filter);
    const uWhere = filter.departmentId ? { departmentId: filter.departmentId } : {};

    const [total, active, leftInPeriod, prevLeft] = await Promise.all([
      this.prisma.user.count({ where: uWhere }),
      this.prisma.user.count({ where: { ...uWhere, active: true } }),
      this.prisma.user.count({ where: { ...uWhere, active: false, updatedAt: { gte: range.gte, lte: range.lte } } }),
      this.prisma.user.count({ where: {
        ...uWhere, active: false,
        updatedAt: { gte: new Date(range.gte.getTime() - (range.lte.getTime() - range.gte.getTime())), lt: range.gte },
      }}),
    ]);

    const turnoverRate     = pct(leftInPeriod, total);
    const prevTurnoverRate = pct(prevLeft, total);
    const saved            = Math.max(0, prevLeft - leftInPeriod);
    const savedValue       = saved * DEFAULTS.turnoverCost;

    return {
      period:        { from: range.gte, to: range.lte },
      headcount:     { total, active },
      turnoverRate,  prevTurnoverRate,
      turnoverTrend: +(turnoverRate - prevTurnoverRate).toFixed(1),
      leftInPeriod,  prevLeft,
      retentionRate: pct(active, total),
      saved,         savedValue,
      insights: turnoverRate < prevTurnoverRate
        ? [`✅ Turnover reduziu ${(prevTurnoverRate - turnoverRate).toFixed(1)}% — economia estimada: $${savedValue.toLocaleString()}`]
        : turnoverRate > prevTurnoverRate
        ? [`⚠️ Turnover aumentou ${(turnoverRate - prevTurnoverRate).toFixed(1)}% face ao período anterior`]
        : ['Turnover estável'],
    };
  }

  // ══════════════════════════════════════════════════════
  // PERFORMANCE IMPACT
  // ══════════════════════════════════════════════════════

  async getPerformanceImpact(filter: RoiFilterDto = {}) {
    const range = dateRange(filter);
    const uWhere = filter.departmentId ? { user: { departmentId: filter.departmentId } } : {};

    const [before, after, highPerformers, atRisk] = await Promise.all([
      this.prisma.performanceReview.aggregate({
        where: { createdAt: { lt: range.gte }, ...uWhere }, _avg: { score: true },
      }).catch(() => ({ _avg: { score: null } })),
      this.prisma.performanceReview.aggregate({
        where: { createdAt: { gte: range.gte }, ...uWhere }, _avg: { score: true },
      }).catch(() => ({ _avg: { score: null } })),
      this.prisma.performanceReview.count({ where: { score: { gte: 4 }, ...uWhere } }),
      this.prisma.performanceReview.count({ where: { score: { lt: 2.5 }, ...uWhere } }),
    ]);

    const perfBefore = before._avg.score ?? 0;
    const perfAfter  = after._avg.score  ?? 0;
    const lift       = perfBefore > 0 ? +(perfAfter - perfBefore).toFixed(2) : null;
    const liftPct    = perfBefore > 0 && lift !== null ? pct(lift, perfBefore) : null;

    // Monetise lift: each 1pt lift ≈ 2% productivity gain × avg daily value × 250 workdays
    const totalUsers      = await this.prisma.user.count({ where: { active: true, ...(filter.departmentId ? { departmentId: filter.departmentId } : {}) } });
    const prodBenefit     = lift && lift > 0
      ? Math.round(totalUsers * (lift / 5) * 0.02 * DEFAULTS.avgWorkdayValue * 250)
      : 0;

    return {
      period: { from: range.gte, to: range.lte },
      before: perfBefore > 0 ? +perfBefore.toFixed(2) : null,
      after:  perfAfter  > 0 ? +perfAfter.toFixed(2)  : null,
      lift,   liftPct,
      highPerformers, atRisk,
      monetised: { productivityBenefit: prodBenefit },
      confidence: confidenceLevel(highPerformers + atRisk, lift !== null ? 2 : 0),
      insights: lift && lift > 0
        ? [`✅ Performance melhorou ${lift} pts (${liftPct}%) — benefício estimado: $${prodBenefit.toLocaleString()}`]
        : lift && lift < 0
        ? [`⚠️ Performance diminuiu ${Math.abs(lift)} pts face ao período anterior`]
        : ['Sem dados comparativos suficientes'],
    };
  }

  // ══════════════════════════════════════════════════════
  // LEARNING IMPACT
  // ══════════════════════════════════════════════════════

  async getLearningImpact(filter: RoiFilterDto = {}) {
    const range  = dateRange(filter);
    const uWhere = filter.departmentId ? { user: { departmentId: filter.departmentId } } : {};
    const where: any = { enrolledAt: { gte: range.gte, lte: range.lte }, ...uWhere };

    const [
      total, completed, inProgress, cancelled,
      topCourses, mandatoryRate,
      avgCompetencyBefore, avgCompetencyAfter,
    ] = await Promise.all([
      this.prisma.enrollment.count({ where }),
      this.prisma.enrollment.count({ where: { ...where, status: 'CONCLUIDO' } }),
      this.prisma.enrollment.count({ where: { ...where, status: 'EM_ANDAMENTO' } }),
      this.prisma.enrollment.count({ where: { ...where, status: 'CANCELADO' } }),
      // Top courses by completions
      this.prisma.enrollment.groupBy({
        by:      ['courseId'],
        where:   { ...where, status: 'CONCLUIDO' },
        _count:  { id: true },
        orderBy: { _count: { id: 'desc' } },
        take:    5,
      }).then(async rows => {
        const ids     = rows.map(r => r.courseId);
        const courses = await this.prisma.course.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, category: true } });
        const cMap    = new Map(courses.map(c => [c.id, c]));
        return rows.map(r => ({ course: cMap.get(r.courseId), completions: r._count.id }));
      }),
      this.prisma.enrollment.count({ where: { course: { mandatory: true } as any, status: 'CONCLUIDO', ...uWhere } })
        .then(async mandC => {
          const mandT = await this.prisma.enrollment.count({ where: { course: { mandatory: true } as any, ...uWhere } }).catch(() => 0);
          return pct(mandC, mandT);
        }).catch(() => 0),
      this.prisma.userCompetency.aggregate({ where: uWhere, _avg: { currentLevel: true } }).catch(() => ({ _avg: { currentLevel: null } })),
      this.prisma.userCompetency.aggregate({ where: uWhere, _avg: { targetLevel: true } }).catch(() => ({ _avg: { targetLevel: null } })),
    ]);

    const completionRate = pct(completed, total);
    const hoursEstimated = Math.round(completed * 2); // ~2h avg course
    const costEstimated  = total * DEFAULTS.costPerEnrollment;
    const benefitEst     = completed * DEFAULTS.benefitPerCompletion;

    return {
      period:    { from: range.gte, to: range.lte },
      volume:    { total, completed, inProgress, cancelled, completionRate },
      quality:   {
        mandatoryCompliance: mandatoryRate,
        avgCompetencyLevel:  avgCompetencyBefore._avg.currentLevel ? +avgCompetencyBefore._avg.currentLevel.toFixed(2) : null,
        targetCompetencyLevel: avgCompetencyAfter._avg.targetLevel ? +avgCompetencyAfter._avg.targetLevel.toFixed(2) : null,
      },
      financial: {
        costEstimated, benefitEstimated: benefitEst,
        roi:    roiFormula(benefitEst, costEstimated),
        hoursEstimated,
      },
      topCourses,
      insights: this.buildLearningInsights(completionRate, mandatoryRate),
    };
  }

  // ══════════════════════════════════════════════════════
  // WHAT-IF SIMULATOR
  // ══════════════════════════════════════════════════════

  async simulateWhatIf(dto: WhatIfDto) {
    const currentEnrollments = await this.prisma.enrollment.count();
    const currentCompleted   = await this.prisma.enrollment.count({ where: { status: 'CONCLUIDO' } });

    const targetEnrollments    = dto.targetEnrollments ?? currentEnrollments;
    const costPerEnroll        = dto.costPerEnrollment   ?? DEFAULTS.costPerEnrollment;
    const benefitPerC          = dto.benefitPerCompletion ?? DEFAULTS.benefitPerCompletion;

    const currentRate          = pct(currentCompleted, currentEnrollments);
    const targetCompletions    = Math.round(targetEnrollments * (dto.targetCompletionRate / 100));
    const currentCost          = currentEnrollments * costPerEnroll;
    const currentBenefit       = currentCompleted   * benefitPerC;
    const projectedCost        = targetEnrollments  * costPerEnroll;
    const projectedBenefit     = targetCompletions  * benefitPerC;

    const currentRoi   = roiFormula(currentBenefit, currentCost);
    const projectedRoi = roiFormula(projectedBenefit, projectedCost);
    const roiLift      = +(projectedRoi - currentRoi).toFixed(1);
    const benefitDelta = projectedBenefit - currentBenefit;

    return {
      current: {
        enrollments: currentEnrollments, completions: currentCompleted,
        completionRate: currentRate, cost: currentCost, benefit: currentBenefit, roi: currentRoi,
      },
      projected: {
        enrollments:    targetEnrollments,  completions:    targetCompletions,
        completionRate: dto.targetCompletionRate, cost:     projectedCost,
        benefit:        projectedBenefit,   roi:            projectedRoi,
      },
      delta: {
        completionRateDelta: +(dto.targetCompletionRate - currentRate).toFixed(1),
        roiLift,
        benefitDelta,
        costDelta:     +(projectedCost - currentCost).toFixed(0),
      },
      narrative: roiLift > 0
        ? `Aumentar a taxa de conclusão para ${dto.targetCompletionRate}% geraria um ROI de ${projectedRoi}% (+${roiLift}pts), com benefício adicional estimado de $${benefitDelta.toLocaleString()}.`
        : `A alteração projectada resultaria numa redução de ROI para ${projectedRoi}% (${roiLift}pts).`,
    };
  }

  // ══════════════════════════════════════════════════════
  // EXECUTIVE DASHBOARD
  // ══════════════════════════════════════════════════════

  async getExecutiveDashboard(filter: RoiFilterDto = {}) {
    const [roi, retention, performance, learning] = await Promise.all([
      this.calculateRoiFull(filter, {}),
      this.getRetentionImpact(filter),
      this.getPerformanceImpact(filter),
      this.getLearningImpact(filter),
    ]);

    const totalBenefit = (roi.financial.totalBenefit ?? 0)
      + (retention.savedValue ?? 0)
      + (performance.monetised?.productivityBenefit ?? 0);
    const totalCost    = roi.financial.totalCost ?? 0;
    const overallRoi   = roiFormula(totalBenefit, totalCost);

    const alerts = [];
    if (roi.financial.roi < 0) alerts.push({ severity: 'HIGH', message: 'ROI de formação negativo — rever investimento' });
    if (retention.turnoverRate > 15) alerts.push({ severity: 'HIGH', message: `Turnover elevado: ${retention.turnoverRate}%` });
    if (performance.lift !== null && performance.lift < 0) alerts.push({ severity: 'MEDIUM', message: 'Performance organizacional a deteriorar' });

    return {
      period:   filter.from && filter.to ? { from: filter.from, to: filter.to } : { label: 'Último ano' },
      headline: {
        overallRoi,
        totalBenefit,  totalCost,
        status: overallRoi >= 100 ? '🟢' : overallRoi >= 0 ? '🟡' : '🔴',
        narrative: buildNarrative(overallRoi, totalBenefit, totalCost, roi.volume.completed),
      },
      domains: {
        learning:   { roi: roi.financial.roi,        completions: roi.volume.completed,    cost: roi.financial.totalCost },
        retention:  { savedValue: retention.savedValue, turnoverRate: retention.turnoverRate },
        performance:{ lift: performance.lift,           benefit: performance.monetised?.productivityBenefit ?? 0 },
      },
      topInsights: [
        ...roi.narrative ? [roi.narrative] : [],
        ...(retention.insights ?? []),
        ...(performance.insights ?? []),
        ...(learning.insights ?? []),
      ].slice(0, 5),
      alerts,
      confidence: roi.confidence,
    };
  }

  // ══════════════════════════════════════════════════════
  // PROGRAM LIBRARY (ranked by ROI)
  // ══════════════════════════════════════════════════════

  async getProgramLibrary(filter: RoiFilterDto = {}) {
    const range = dateRange(filter);

    const courseStats = await this.prisma.enrollment.groupBy({
      by:      ['courseId'],
      where:   { enrolledAt: { gte: range.gte, lte: range.lte } },
      _count:  { id: true },
    });

    const completedStats = await this.prisma.enrollment.groupBy({
      by:      ['courseId'],
      where:   { status: 'CONCLUIDO', enrolledAt: { gte: range.gte, lte: range.lte } },
      _count:  { id: true },
    });

    const courseIds  = courseStats.map(c => c.courseId);
    const courses    = await this.prisma.course.findMany({
      where:  { id: { in: courseIds } },
      select: { id: true, title: true, category: true, workloadHours: true, mandatory: true },
    });

    const completedMap = new Map(completedStats.map(c => [c.courseId, c._count.id]));
    const cMap         = new Map(courses.map(c => [c.id, c]));

    const programs = courseStats.map(s => {
      const completions  = completedMap.get(s.courseId) ?? 0;
      const enrollments  = s._count.id;
      const completionRate = pct(completions, enrollments);
      const cost         = enrollments * DEFAULTS.costPerEnrollment;
      const benefit      = completions * DEFAULTS.benefitPerCompletion;
      const roi          = roiFormula(benefit, cost);
      return {
        course:      cMap.get(s.courseId),
        enrollments, completions, completionRate,
        cost,        benefit,      roi,
        bcr:         bcr(benefit, cost),
        rank:        roi,
      };
    }).sort((a, b) => b.roi - a.roi);

    return {
      programs,
      total:          programs.length,
      avgRoi:         programs.length ? +(programs.reduce((s, p) => s + p.roi, 0) / programs.length).toFixed(1) : 0,
      topByRoi:       programs.slice(0, 5),
      bottomByRoi:    [...programs].sort((a, b) => a.roi - b.roi).slice(0, 3),
    };
  }

  // ══════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════

  private buildLearningInsights(completionRate: number, mandatoryRate: number): string[] {
    const out = [];
    if (completionRate >= 80) out.push(`✅ Taxa de conclusão excelente: ${completionRate}%`);
    else if (completionRate >= 60) out.push(`Taxa de conclusão aceitável: ${completionRate}% — há margem de melhoria`);
    else out.push(`⚠️ Taxa de conclusão baixa: ${completionRate}% — rever conteúdo e metodologia`);
    if (mandatoryRate < 80) out.push(`⚠️ Conformidade de formações obrigatórias abaixo de 80%: ${mandatoryRate}%`);
    return out;
  }
}

















