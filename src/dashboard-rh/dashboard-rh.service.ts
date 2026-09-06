// src/dashboard-rh/dashboard-rh.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { EnrollmentStatus, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { DASHBOARD_CACHE_TTL } from '../cache/cache.constants';
import { MetricsAggregationService } from '../metrics-aggregation/metrics-aggregation.service';

// ─── Alertas: mapeamento p/ a forma histórica de GET /dashboard-rh/alerts ──
// A camada canónica (`metrics.alerts`) devolve TODAS as regras de organização;
// este ecrã só mostrava 4 (§4.3). O `type` histórico é reconstruído por `key`
// (o `SURVEY_PARTICIPATION_LOW` canónico tem `type: 'SURVEY'` — aqui volta a
// 'ENGAGEMENT' para preservar a forma do payload).
const RH_ALERT_KEYS = new Set([
  'PERFORMANCE_CRITICAL',
  'MANDATORY_TRAINING_PENDING',
  'PDI_ACTIONS_OVERDUE',
  'SURVEY_PARTICIPATION_LOW',
]);
const RH_ALERT_HIST_TYPE: Record<string, string> = {
  PERFORMANCE_CRITICAL: 'PERFORMANCE',
  MANDATORY_TRAINING_PENDING: 'COMPLIANCE',
  PDI_ACTIONS_OVERDUE: 'PDI',
  SURVEY_PARTICIPATION_LOW: 'ENGAGEMENT',
};

// ─── Helpers ─────────────────────────────────────────────────────

function monthStart(offset = 0): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - offset, 1);
}

function pct(num: number, den: number): number {
  return den > 0 ? +((num / den) * 100).toFixed(1) : 0;
}

function trend(curr: number, prev: number): number {
  return prev > 0 ? +(((curr - prev) / prev) * 100).toFixed(1) : 0;
}

function tenureMonths(createdAt: Date): number {
  return Math.floor((Date.now() - createdAt.getTime()) / (30 * 86400000));
}

// Status health indicator
function healthStatus(value: number, goodAbove: number, warnAbove: number): '🟢' | '🟡' | '🔴' {
  if (value >= goodAbove) return '🟢';
  if (value >= warnAbove) return '🟡';
  return '🔴';
}
function healthStatusInverse(
  value: number,
  goodBelow: number,
  warnBelow: number,
): '🟢' | '🟡' | '🔴' {
  if (value <= goodBelow) return '🟢';
  if (value <= warnBelow) return '🟡';
  return '🔴';
}

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class DashboardRhService {
  private readonly logger = new Logger(DashboardRhService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly metrics: MetricsAggregationService,
  ) {}

  // ══════════════════════════════════════════════════════
  // FULL DASHBOARD — aggregates all domains
  // ══════════════════════════════════════════════════════

  async getFullRhDashboard() {
    return this.cache.getOrSet('dashboard:rh:full', DASHBOARD_CACHE_TTL, async () => {
      const now = new Date();
      const mS = monthStart();
      const mS1 = monthStart(1);

      // Anotados explicitamente: `.catch()` a seguir a groupBy/findMany colapsa
      // o tipo inteiro para `any` sem isto (ver subproject3-any-cleanup.md).
      const topBadgeAwardeesPromise = this.prisma.badgeAward.groupBy({
        by: ['userId'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      });
      const recentActivityPromise = this.prisma.auditLog.findMany({
        where: { timestamp: { gte: mS } },
        select: { id: true, action: true, entity: true, timestamp: true, userId: true },
        orderBy: { timestamp: 'desc' },
        take: 10,
      });

      const [
        totalActive,
        totalInactive,
        newHires,
        prevHires,
        deptBreakdown,
        posBreakdown,
        avgPerfScore,
        activePlans,
        completionRate,
        mandatoryCompliance,
        surveyParticipation,
        avatarSessions,
        topBadgeAwardees,
        recentActivity,
      ] = await Promise.all([
        this.prisma.read.user.count({ where: { active: true } }),
        this.prisma.read.user.count({ where: { active: false } }),
        this.prisma.read.user.count({ where: { createdAt: { gte: mS } } }),
        this.prisma.read.user.count({ where: { createdAt: { gte: mS1, lt: mS } } }),
        this.prisma.read.user.groupBy({
          by: ['departmentId'],
          where: { active: true },
          _count: { id: true },
        }),
        this.prisma.read.user.groupBy({
          by: ['positionId'],
          where: { active: true },
          _count: { id: true },
        }),
        this.prisma.performanceReview
          .aggregate({
            where: { createdAt: { gte: mS1 } },
            _avg: { score: true },
          })
          .catch((e: unknown) => {
            this.logger.warn({
              action: 'DASHBOARD_RH_FULL_AVG_PERF',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao obter score médio de performance no dashboard RH completo',
            });
            return { _avg: { score: null } };
          }),
        this.prisma.read.developmentPlan.count({ where: { status: 'ACTIVE', isTemplate: false } }),
        this.prisma.read.enrollment.count({
          where: { status: EnrollmentStatus.COMPLETED, enrolledAt: { gte: mS } },
        }),
        this.prisma.enrollment
          .count({
            where: { course: { mandatory: true }, status: EnrollmentStatus.COMPLETED },
          })
          .catch((e: unknown) => {
            this.logger.warn({
              action: 'DASHBOARD_RH_FULL_MANDATORY_COMPLIANCE',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao obter total de formações obrigatórias concluídas no dashboard RH completo',
            });
            return 0;
          }),
        this.prisma.read.surveyResponse.count({ where: { createdAt: { gte: mS } } }),
        this.prisma.read.avatarSession.count({
          where: { status: 'COMPLETED', startedAt: { gte: mS } },
        }),
        topBadgeAwardeesPromise.catch((e: unknown) => {
          this.logger.warn({
            action: 'DASHBOARD_RH_FULL_TOP_BADGES',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter top de atribuições de badges no dashboard RH completo',
          });
          return [];
        }),
        recentActivityPromise.catch((e: unknown) => {
          this.logger.warn({
            action: 'DASHBOARD_RH_FULL_RECENT_ACTIVITY',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter actividade recente (audit log) no dashboard RH completo',
          });
          return [];
        }),
      ]);

      const total = totalActive + totalInactive;
      const turnoverRate = pct(totalInactive, total);
      const hiringTrend = trend(newHires, prevHires);
      const pdpCoverage = pct(activePlans, totalActive);

      // Enrich dept breakdown with names
      const deptIds = deptBreakdown.map(d => d.departmentId).filter(Boolean);
      const departments = deptIds.length
        ? await this.prisma.read.department.findMany({
            where: { id: { in: deptIds } },
            select: { id: true, name: true },
          })
        : [];
      const deptMap = new Map(departments.map(d => [d.id, d.name]));

      const posIds = posBreakdown.map(p => p.positionId).filter(Boolean);
      const positions = posIds.length
        ? await this.prisma.read.position.findMany({
            where: { id: { in: posIds } },
            select: { id: true, name: true, level: true },
          })
        : [];
      const posMap = new Map(positions.map(p => [p.id, p]));

      // Alerts
      const alerts = await this.getAlerts();

      return {
        generatedAt: now,
        kpis: {
          headcount: { total: totalActive, status: '🟢' },
          turnover: { rate: turnoverRate, status: healthStatusInverse(turnoverRate, 10, 20) },
          newHires: { count: newHires, trend: hiringTrend },
          performance: {
            avg: avgPerfScore._avg.score ? +avgPerfScore._avg.score.toFixed(2) : null,
          },
          pdpCoverage: { pct: pdpCoverage, status: healthStatus(pdpCoverage, 70, 40) },
          completions: { count: completionRate },
          engagement: { surveyResponses: surveyParticipation },
          avatarSessions,
          mandatoryCompliance,
        },
        distribution: {
          byDepartment: deptBreakdown
            .map(d => ({
              id: d.departmentId,
              name: deptMap.get(d.departmentId) ?? 'N/A',
              count: d._count.id,
            }))
            .sort((a, b) => b.count - a.count),
          byPosition: posBreakdown
            .map(p => ({
              ...(posMap.get(p.positionId) ?? {}),
              count: p._count.id,
            }))
            .sort((a, b) => b.count - a.count),
        },
        alerts,
        topBadgeAwardees: topBadgeAwardees.slice(0, 5),
        recentActivity,
      };
    });
  }

  // ══════════════════════════════════════════════════════
  // HEADCOUNT & STRUCTURE
  // ══════════════════════════════════════════════════════

  // Delega no `MetricsAggregationService` (Fase H). A forma do payload
  // (`turnoverRate` derivado de inactive/total, `byPosition.level` sempre
  // presente) é preservada; a *fonte* dos números passou a ser a canónica.
  async getHeadcountPanel(departmentId?: number) {
    const r = await this.metrics.headcount(departmentId != null ? { departmentId } : {});
    return {
      total: r.total,
      active: r.active,
      inactive: r.inactive,
      turnoverRate: pct(r.inactive, r.total),
      avgTenureMonths: r.avgTenureMonths,
      byDepartment: r.byDepartment,
      byPosition: r.byPosition.map(p => ({
        id: p.id,
        name: p.name,
        level: p.level ?? null,
        count: p.count,
      })),
      byTenure: r.byTenure,
    };
  }

  async getHeadcountTrend(months = 6) {
    const points = await this.metrics.headcountTrend({ months });
    return points.map(p => ({ month: p.month, count: p.headcount, new: p.new }));
  }

  // ══════════════════════════════════════════════════════
  // TURNOVER & RETENTION
  // ══════════════════════════════════════════════════════

  async getTurnoverPanel(months = 12) {
    // At-risk heuristic: active users + low performance — enriquecimento local
    // de entidades (NÃO é métrica canónica), mantido via prisma.read.
    const atRiskUsersQuery = this.prisma.performanceReview.findMany({
      where: { score: { lt: 2.5 }, status: ReviewStatus.PUBLISHED },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            department: { select: { name: true } },
            position: { select: { name: true } },
          },
        },
      },
      orderBy: { score: 'asc' },
      take: 10,
    });
    const atRiskUsers: Awaited<typeof atRiskUsersQuery> = await atRiskUsersQuery.catch(
      (e: unknown) => {
        this.logger.warn({
          months,
          action: 'DASHBOARD_RH_TURNOVER_AT_RISK',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter utilizadores em risco de saída no painel de turnover',
        });
        return [];
      },
    );

    // Números canónicos: janela default de 12 meses. 2ª chamada só para o
    // sub-total de 3 meses — `leftLast3Months` não existe no primitivo turnover
    // (ratificação no PR da Task 10).
    const [r, last3] = await Promise.all([
      this.metrics.turnover({}),
      this.metrics.turnover({ from: monthStart(3), to: new Date() }),
    ]);

    return {
      turnoverRate: r.turnoverRate,
      retentionRate: r.retentionRate,
      totalLeft: r.leavers,
      leftLast3Months: last3.leavers,
      avgTenureMonths: r.avgTenureMonths,
      avgTenureYears: +(r.avgTenureMonths / 12).toFixed(1),
      atRiskUsers: atRiskUsers.map(x => ({
        user: x.user,
        score: x.score,
        risk: (x.score ?? 0) < 2 ? 'HIGH' : 'MEDIUM',
      })),
      insights: r.insights,
    };
  }

  // ══════════════════════════════════════════════════════
  // ENGAGEMENT & CLIMA
  // ══════════════════════════════════════════════════════

  async getEngagementPanel(departmentId?: number) {
    const mS = monthStart();
    const uWhere = departmentId ? { departmentId } : {};

    const [
      totalUsers,
      surveyResponses,
      activeSurveys,
      avgSurveyScore,
      recognitions,
      avatarSessions,
      badgeAwards,
    ] = await Promise.all([
      this.prisma.read.user.count({ where: { active: true, ...uWhere } }),
      this.prisma.read.surveyResponse.count({ where: { createdAt: { gte: mS }, user: uWhere } }),
      this.prisma.read.engagementSurvey.count({ where: { status: 'ACTIVE' } }),
      this.prisma.surveyResponse
        .aggregate({
          where: { createdAt: { gte: mS }, user: uWhere },
          _avg: { score: true },
        })
        .catch((e: unknown) => {
          this.logger.warn({
            departmentId,
            action: 'DASHBOARD_RH_ENGAGEMENT_AVG_SCORE',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter score médio de surveys no painel de engagement',
          });
          return { _avg: { score: null } };
        }),
      // FIX: safeM() degradava para um modelo genuinamente inexistente noutros
      // ficheiros (ApiKey/Webhook) — Recognition é um modelo real, o wrapper
      // aqui nunca teve razão de ser (mesmo achado de reports.service.ts/
      // automation.service.ts).
      this.prisma.read.recognition.count({ where: { createdAt: { gte: mS } } }),
      this.prisma.read.avatarSession.count({
        where: { status: 'COMPLETED', startedAt: { gte: mS }, user: uWhere },
      }),
      this.prisma.read.badgeAward.count({ where: { awardedAt: { gte: mS }, user: uWhere } }),
    ]);

    const participationRate = pct(surveyResponses, totalUsers);
    const engagementScore = avgSurveyScore._avg.score
      ? +((avgSurveyScore._avg.score / 5) * 100).toFixed(1)
      : null;

    // Dept breakdown of survey participation
    const deptBreakdownQuery = this.prisma.surveyResponse
      .groupBy({
        by: ['userId'],
        where: { createdAt: { gte: mS } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 200,
      })
      .then(async rows => {
        const uIds = rows.map(r => r.userId);
        const users = await this.prisma.read.user.findMany({
          where: { id: { in: uIds } },
          select: { id: true, departmentId: true },
        });
        const deptC: Record<number, number> = {};
        for (const r of rows) {
          const u = users.find(u => u.id === r.userId);
          const dId = u?.departmentId ?? 0;
          deptC[dId] = (deptC[dId] ?? 0) + 1;
        }
        const depts = await this.prisma.read.department.findMany({
          where: { id: { in: Object.keys(deptC).map(Number) } },
          select: { id: true, name: true },
        });
        return depts
          .map(d => ({ department: d.name, responses: deptC[d.id] ?? 0 }))
          .sort((a, b) => b.responses - a.responses);
      });
    const deptBreakdown: Awaited<typeof deptBreakdownQuery> = await deptBreakdownQuery.catch(
      (e: unknown) => {
        this.logger.warn({
          departmentId,
          action: 'DASHBOARD_RH_ENGAGEMENT_DEPT_BREAKDOWN',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter distribuição de participação em surveys por departamento',
        });
        return [];
      },
    );

    return {
      engagementScore,
      participationRate,
      status: healthStatus(participationRate, 70, 40),
      activeSurveys,
      recognitions: recognitions ?? 0,
      avatarSessions,
      badgeAwards,
      byDepartment: deptBreakdown,
      insights:
        engagementScore && engagementScore < 50
          ? ['⚠️ Score de engajamento abaixo de 50% — acção urgente necessária']
          : participationRate < 40
            ? ['⚠️ Baixa taxa de participação nos surveys']
            : ['✅ Engagement dentro do esperado'],
    };
  }

  // ══════════════════════════════════════════════════════
  // PERFORMANCE & TALENTO
  // ══════════════════════════════════════════════════════

  async getPerformancePanel(departmentId?: number) {
    const uWhere = departmentId ? { departmentId } : {};

    const [reviews, userCount, hiPos, activePlans] = await Promise.all([
      this.prisma.read.performanceReview.findMany({
        where: { user: uWhere },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              department: { select: { name: true } },
              position: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.read.user.count({ where: { active: true, ...uWhere } }),
      this.prisma.userCompetency
        .groupBy({
          by: ['userId'],
          where: uWhere ? { user: uWhere } : {},
          _avg: { currentLevel: true },
          having: { currentLevel: { _avg: { gte: 4 } } },
        })
        .then(r => r.length)
        .catch((e: unknown) => {
          this.logger.warn({
            departmentId,
            action: 'DASHBOARD_RH_PERFORMANCE_HIPOS',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter contagem de HiPos (alto potencial) no painel de performance',
          });
          return 0;
        }),
      this.prisma.read.developmentPlan.count({
        where: { status: 'ACTIVE', isTemplate: false, user: uWhere },
      }),
    ]);

    const scores = reviews.map(r => r.score ?? 0).filter(s => s > 0);
    const avg = scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 0;

    const dist = { exceptional: 0, above: 0, expected: 0, below: 0, critical: 0 };
    for (const s of scores) {
      if (s >= 4.5) dist.exceptional++;
      else if (s >= 3.5) dist.above++;
      else if (s >= 2.5) dist.expected++;
      else if (s >= 1.5) dist.below++;
      else dist.critical++;
    }

    const atRisk = reviews.filter(r => (r.score ?? 0) < 2.5).length;

    const byDept: Record<string, { sum: number; count: number }> = {};
    for (const r of reviews) {
      const d = r.user?.department?.name ?? 'N/A';
      if (!byDept[d]) byDept[d] = { sum: 0, count: 0 };
      byDept[d].sum += r.score ?? 0;
      byDept[d].count += 1;
    }

    return {
      avgScore: avg,
      status: healthStatus(avg, 3.5, 2.5),
      total: reviews.length,
      distribution: dist,
      atRisk,
      hiPos,
      hiPoRatio: pct(hiPos, userCount),
      pdpCoverage: pct(activePlans, userCount),
      byDepartment: Object.entries(byDept)
        .map(([dept, d]) => ({
          department: dept,
          avgScore: +(d.sum / d.count).toFixed(2),
          count: d.count,
        }))
        .sort((a, b) => b.avgScore - a.avgScore),
      topPerformers: reviews
        .filter(r => (r.score ?? 0) >= 4)
        .slice(0, 8)
        .map(r => ({
          user: r.user,
          score: r.score,
        })),
      insights: this.buildPerformanceInsights(avg, atRisk, reviews.length),
    };
  }

  // ══════════════════════════════════════════════════════
  // SKILLS & COMPETÊNCIAS
  // ══════════════════════════════════════════════════════

  async getSkillsPanel(departmentId?: number) {
    const uWhere = departmentId ? { user: { departmentId } } : {};

    // FIX: legacyEmployeeSkill era pedido aqui mas nunca usado no resto da
    // função (achado ao tipar) — query removida, deixou de desperdiçar uma
    // consulta a cada carregamento do dashboard.
    const [competencies, totalUsers] = await Promise.all([
      this.prisma.userCompetency.findMany({
        where: uWhere,
        include: { competency: { select: { id: true, name: true, type: true } } },
      }),
      this.prisma.read.user.count({
        where: { active: true, ...(departmentId ? { departmentId } : {}) },
      }),
    ]);

    const TARGET = 5;
    type CompetencyRef = (typeof competencies)[number]['competency'];
    const byComp: Record<
      string,
      { comp: CompetencyRef; count: number; totalGap: number; avgLevel: number }
    > = {};
    for (const c of competencies) {
      const n = c.competency.name;
      if (!byComp[n]) byComp[n] = { comp: c.competency, count: 0, totalGap: 0, avgLevel: 0 };
      byComp[n].count++;
      byComp[n].avgLevel += c.currentLevel;
      const gap = TARGET - c.currentLevel;
      if (gap > 0) byComp[n].totalGap += gap;
    }
    const skillData = Object.values(byComp)
      .map(c => ({
        competency: c.comp,
        count: c.count,
        avgLevel: +(c.avgLevel / c.count).toFixed(2),
        avgGap: +(c.totalGap / c.count).toFixed(1),
      }))
      .sort((a, b) => b.avgGap - a.avgGap);

    const assessed = new Set(competencies.map(c => c.userId)).size;

    return {
      totalUsers,
      assessed,
      assessmentRate: pct(assessed, totalUsers),
      totalCompetencies: skillData.length,
      criticalGaps: skillData.filter(s => s.avgGap >= 2).length,
      topGaps: skillData.slice(0, 8),
      topStrengths: [...skillData].sort((a, b) => b.avgLevel - a.avgLevel).slice(0, 5),
    };
  }

  // ══════════════════════════════════════════════════════
  // TRAINING & DESENVOLVIMENTO
  // ══════════════════════════════════════════════════════

  async getTrainingPanel(departmentId?: number) {
    const mS = monthStart();
    const uWhere = departmentId ? { user: { departmentId } } : {};

    const [
      enrollments,
      completed,
      inProgress,
      cancelled,
      mandatory,
      mandatoryComplete,
      topCourses,
    ] = await Promise.all([
      this.prisma.read.enrollment.count({ where: { enrolledAt: { gte: mS }, ...uWhere } }),
      this.prisma.read.enrollment.count({
        where: { status: EnrollmentStatus.COMPLETED, enrolledAt: { gte: mS }, ...uWhere },
      }),
      this.prisma.read.enrollment.count({
        where: { status: EnrollmentStatus.IN_PROGRESS, ...uWhere },
      }),
      this.prisma.read.enrollment.count({
        where: { status: EnrollmentStatus.CANCELLED, enrolledAt: { gte: mS }, ...uWhere },
      }),
      this.prisma.enrollment
        .count({ where: { course: { mandatory: true }, ...uWhere } })
        .catch((e: unknown) => {
          this.logger.warn({
            departmentId,
            action: 'DASHBOARD_RH_TRAINING_MANDATORY',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter total de formações obrigatórias no painel de training',
          });
          return 0;
        }),
      this.prisma.enrollment
        .count({
          where: {
            course: { mandatory: true },
            status: EnrollmentStatus.COMPLETED,
            ...uWhere,
          },
        })
        .catch((e: unknown) => {
          this.logger.warn({
            departmentId,
            action: 'DASHBOARD_RH_TRAINING_MANDATORY_COMPLETE',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter total de formações obrigatórias concluídas no painel de training',
          });
          return 0;
        }),
      this.prisma.enrollment
        .groupBy({
          by: ['courseId'],
          where: { ...uWhere },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 5,
        })
        .then(async rows => {
          const ids = rows.map(r => r.courseId);
          const courses = await this.prisma.read.course.findMany({
            where: { id: { in: ids } },
            select: { id: true, title: true, category: true },
          });
          const cMap = new Map(courses.map(c => [c.id, c]));
          return rows.map(r => ({ course: cMap.get(r.courseId), count: r._count.id }));
        }),
    ]);

    const totalUsers = await this.prisma.read.user.count({
      where: { active: true, ...(departmentId ? { departmentId } : {}) },
    });
    const uniqueLearners = await this.prisma.enrollment
      .findMany({
        where: { enrolledAt: { gte: mS }, ...uWhere },
        select: { userId: true },
        distinct: ['userId'],
      })
      .then(r => r.length);
    const completionRate = pct(completed, enrollments);
    const mandatoryRate = pct(mandatoryComplete, mandatory);
    // FIX: `totalUsers` era calculado e nunca devolvido. É o denominador
    // natural de `uniqueLearners` — % de colaboradores activos que fizeram
    // pelo menos uma formação no período.
    const trainingCoverage = pct(uniqueLearners, totalUsers);

    return {
      enrollments,
      completed,
      inProgress,
      cancelled,
      completionRate,
      abandonment: pct(cancelled, enrollments),
      mandatory,
      mandatoryComplete,
      mandatoryRate,
      mandatoryStatus: healthStatus(mandatoryRate, 90, 70),
      topCourses,
      estimatedHours: completed * 2, // ~2h avg
      totalUsers,
      uniqueLearners,
      trainingCoverage,
      insights: this.buildTrainingInsights(completionRate, mandatoryRate),
    };
  }

  // ══════════════════════════════════════════════════════
  // COMPLIANCE
  // ══════════════════════════════════════════════════════

  async getCompliancePanel() {
    const certsQuery = this.prisma.certificate.findMany({
      where: { issuedAt: { gte: monthStart(3) } },
      include: {
        user: { select: { id: true, fullName: true, department: { select: { name: true } } } },
      },
      orderBy: { issuedAt: 'desc' },
      take: 10,
    });

    const [mandatory, mandatoryDone, auditLogs, certs] = await Promise.all([
      this.prisma.enrollment
        .count({ where: { course: { mandatory: true } } })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'DASHBOARD_RH_COMPLIANCE_MANDATORY',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter total de formações obrigatórias no painel de compliance',
          });
          return 0;
        }),
      this.prisma.enrollment
        .count({
          where: { course: { mandatory: true }, status: EnrollmentStatus.COMPLETED },
        })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'DASHBOARD_RH_COMPLIANCE_MANDATORY_DONE',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter total de formações obrigatórias concluídas no painel de compliance',
          });
          return 0;
        }),
      this.prisma.read.auditLog
        .count({ where: { timestamp: { gte: monthStart() } } })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'DASHBOARD_RH_COMPLIANCE_AUDIT_LOGS',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter contagem de eventos de audit log no painel de compliance',
          });
          return 0;
        }),
      certsQuery.catch((e: unknown): Awaited<typeof certsQuery> => {
        this.logger.warn({
          action: 'DASHBOARD_RH_COMPLIANCE_CERTS',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter certificados recentes no painel de compliance',
        });
        return [];
      }),
    ]);

    const mandatoryRate = pct(mandatoryDone, mandatory);
    return {
      mandatory,
      mandatoryDone,
      mandatoryRate,
      riskLevel: mandatoryRate < 70 ? 'HIGH' : mandatoryRate < 90 ? 'MEDIUM' : 'LOW',
      status: healthStatus(mandatoryRate, 90, 70),
      auditEvents: auditLogs,
      recentCerts: certs,
    };
  }

  // ══════════════════════════════════════════════════════
  // BIRTHDAYS & ANNIVERSARIES
  // ══════════════════════════════════════════════════════

  async getBirthdaysThisMonth() {
    // dateOfBirth not in base schema — returns [] until field is migrated
    // When field exists, filter by month of dateOfBirth
    return [];
  }

  async getAnniversariesThisMonth() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const users = await this.prisma.read.user.findMany({
      where: { active: true },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        createdAt: true,
        department: { select: { name: true } },
        position: { select: { name: true } },
      },
    });
    return users
      .filter(u => new Date(u.createdAt).getMonth() + 1 === month)
      .map(u => ({
        id: u.id,
        fullName: u.fullName,
        avatarUrl: u.avatarUrl,
        position: u.position?.name,
        department: u.department?.name,
        hireDate: u.createdAt,
        years: now.getFullYear() - new Date(u.createdAt).getFullYear(),
      }))
      .filter(u => u.years > 0)
      .sort((a, b) => b.years - a.years);
  }

  // ══════════════════════════════════════════════════════
  // ATTENDANCE (legacy-compatible)
  // ══════════════════════════════════════════════════════

  async getAttendancePanel(from?: string, to?: string) {
    const dateFrom = from ? new Date(from) : monthStart();
    const dateTo = to ? new Date(to) : new Date();
    const records = await this.prisma.read.attendance.findMany({
      where: { date: { gte: dateFrom, lte: dateTo } },
      include: { employee: { select: { id: true, name: true } } },
    });

    const summary = { present: 0, absent: 0, late: 0, remote: 0, justified: 0 };
    for (const r of records) {
      const s = (r.status?.toLowerCase() ?? 'absent') as keyof typeof summary;
      if (s in summary) summary[s]++;
    }
    const total = records.length;
    const attended = summary.present + summary.remote + summary.late;
    return {
      period: { from: dateFrom, to: dateTo },
      total,
      ...summary,
      presenceRate: pct(attended, total),
      absenteeismRate: pct(summary.absent + summary.justified, total),
      status: healthStatusInverse(pct(summary.absent, total), 5, 10),
    };
  }

  // ══════════════════════════════════════════════════════
  // SUCCESSION & TALENT PIPELINE
  // ══════════════════════════════════════════════════════

  async getTalentPipeline() {
    const hiPosQuery = this.prisma.userCompetency
      .groupBy({
        by: ['userId'],
        _avg: { currentLevel: true },
        having: { currentLevel: { _avg: { gte: 4 } } },
        orderBy: { _avg: { currentLevel: 'desc' } },
        take: 20,
      })
      .then(async rows => {
        const ids = rows.map(r => r.userId);
        const users = await this.prisma.read.user.findMany({
          where: { id: { in: ids }, active: true },
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            position: { select: { name: true } },
            department: { select: { name: true } },
          },
        });
        return users;
      });

    const [positions, plans, hiPos] = await Promise.all([
      this.prisma.read.position.findMany({
        select: {
          id: true,
          name: true,
          level: true,
          _count: { select: { users: true, successionPlans: true } },
        },
        orderBy: { level: 'desc' },
        take: 20,
      }),
      this.prisma.read.successionPlan.findMany({
        include: {
          candidate: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              position: { select: { name: true } },
            },
          },
          position: { select: { id: true, name: true, level: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      hiPosQuery.catch((e: unknown): Awaited<typeof hiPosQuery> => {
        this.logger.warn({
          action: 'DASHBOARD_RH_TALENT_HIPOS',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter colaboradores de alto potencial no pipeline de talento',
        });
        return [];
      }),
    ]);

    const covered = positions.filter(p => p._count.successionPlans > 0).length;
    const atRisk = positions.filter(p => p._count.successionPlans === 0 && p._count.users > 0);

    return {
      totalPositions: positions.length,
      covered,
      coverageRate: pct(covered, positions.length),
      positionsAtRisk: atRisk.slice(0, 5),
      successionPlans: plans,
      highPotentials: hiPos,
      hiPoCount: hiPos.length,
    };
  }

  // ══════════════════════════════════════════════════════
  // AI ALERTS & PREDICTIONS
  // ══════════════════════════════════════════════════════

  // Delega no catálogo canónico (`metrics.alerts`, §4.6) e filtra o
  // subconjunto de 4 regras de organização que este ecrã sempre mostrou
  // (§4.3). A ordem passa a ser a canónica (severidade, depois `key`) em vez
  // da antiga ordem de `push` — cosmético para um consumidor de lista.
  async getAlerts(): Promise<
    { type: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; message: string; count?: number }[]
  > {
    const canonical = await this.metrics.alerts({ scope: 'organization' });
    return canonical
      .filter(a => RH_ALERT_KEYS.has(a.key))
      .map(a => ({
        type: RH_ALERT_HIST_TYPE[a.key],
        severity: a.severity,
        message: a.message,
        ...(a.count != null ? { count: a.count } : {}),
      }));
  }

  async getPredictions() {
    const [turnoverRisk, lowPerf, lowEngagement] = await Promise.all([
      // Users with low performance + long tenure = turnover risk
      this.prisma.performanceReview
        .findMany({
          where: { score: { lt: 2.5 }, status: ReviewStatus.PUBLISHED },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true,
                department: { select: { name: true } },
                createdAt: true,
              },
            },
          },
          orderBy: { score: 'asc' },
          take: 10,
        })
        .then(rs =>
          rs.map(r => ({
            user: r.user,
            score: r.score,
            tenureMonths: tenureMonths(r.user.createdAt),
            riskLevel: (r.score ?? 0) < 2 ? 'HIGH' : 'MEDIUM',
            reason: 'Baixa performance + histórico de avaliações',
          })),
        )
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'DASHBOARD_RH_PREDICTIONS_TURNOVER_RISK',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao calcular previsão de risco de saída no dashboard RH',
          });
          return [];
        }),
      this.prisma.performanceReview
        .count({ where: { score: { lt: 2 }, status: ReviewStatus.PUBLISHED } })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'DASHBOARD_RH_PREDICTIONS_LOW_PERF',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter contagem de baixa performance nas previsões do dashboard RH',
          });
          return 0;
        }),
      this.prisma.read.surveyResponse.count({ where: { createdAt: { gte: monthStart() } } }),
    ]);

    return {
      turnoverRisk,
      summary: {
        atRiskCount: turnoverRisk.length,
        lowPerfCount: lowPerf,
        engagementResponses: lowEngagement,
      },
      generatedAt: new Date(),
    };
  }

  // ══════════════════════════════════════════════════════
  // PEOPLE ANALYTICS CORRELATIONS
  // ══════════════════════════════════════════════════════

  async getCorrelations() {
    const users = await this.prisma.read.user.findMany({
      where: { active: true },
      select: { id: true, createdAt: true },
      take: 500,
    });
    const userIds = users.map(u => u.id);

    const [perfReviews, enrollments, surveyResponses] = await Promise.all([
      this.prisma.read.performanceReview.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, score: true },
      }),
      this.prisma.read.enrollment.findMany({
        where: { userId: { in: userIds }, status: EnrollmentStatus.COMPLETED },
        select: { userId: true },
      }),
      this.prisma.read.surveyResponse.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, score: true },
      }),
    ]);

    // Group by user
    const byUser = userIds
      .map(id => {
        const perf = perfReviews.filter(r => r.userId === id);
        const courses = enrollments.filter(e => e.userId === id).length;
        const surveys = surveyResponses.filter(s => s.userId === id);
        const avgPerf = perf.length
          ? perf.reduce((a, r) => a + (r.score ?? 0), 0) / perf.length
          : 0;
        const avgEng = surveys.length
          ? surveys.reduce((a, s) => a + (s.score ?? 0), 0) / surveys.length
          : 0;
        return {
          id,
          avgPerf,
          courses,
          avgEng,
          tenureMonths: tenureMonths(users.find(u => u.id === id).createdAt),
        };
      })
      .filter(u => u.avgPerf > 0);

    // Segment: high training (>3 courses) vs low training
    const highTraining = byUser.filter(u => u.courses >= 3);
    const lowTraining = byUser.filter(u => u.courses < 3);
    const avgPerfHigh = highTraining.length
      ? +(highTraining.reduce((a, u) => a + u.avgPerf, 0) / highTraining.length).toFixed(2)
      : 0;
    const avgPerfLow = lowTraining.length
      ? +(lowTraining.reduce((a, u) => a + u.avgPerf, 0) / lowTraining.length).toFixed(2)
      : 0;

    // Engagement vs performance
    const withBoth = byUser.filter(u => u.avgEng > 0);
    const highEng = withBoth.filter(u => u.avgEng >= 3.5);
    const lowEng = withBoth.filter(u => u.avgEng < 2.5);
    const avgPerfHighE = highEng.length
      ? +(highEng.reduce((a, u) => a + u.avgPerf, 0) / highEng.length).toFixed(2)
      : 0;
    const avgPerfLowE = lowEng.length
      ? +(lowEng.reduce((a, u) => a + u.avgPerf, 0) / lowEng.length).toFixed(2)
      : 0;

    return {
      trainingVsPerformance: {
        highTrainingAvgPerf: avgPerfHigh,
        lowTrainingAvgPerf: avgPerfLow,
        lift: +(avgPerfHigh - avgPerfLow).toFixed(2),
        insight:
          avgPerfHigh > avgPerfLow
            ? `Colaboradores com +3 cursos concluídos têm performance média ${((avgPerfHigh / Math.max(avgPerfLow, 0.01) - 1) * 100).toFixed(0)}% superior`
            : 'Dados insuficientes para correlação',
      },
      engagementVsPerformance: {
        highEngAvgPerf: avgPerfHighE,
        lowEngAvgPerf: avgPerfLowE,
        lift: +(avgPerfHighE - avgPerfLowE).toFixed(2),
        insight:
          avgPerfHighE > avgPerfLowE
            ? `Colaboradores com alto engagement têm score de performance médio de ${avgPerfHighE}/5 vs ${avgPerfLowE}/5`
            : 'Dados insuficientes para correlação',
      },
      sampleSize: byUser.length,
    };
  }

  // ══════════════════════════════════════════════════════
  // PAYROLL SUMMARY (legacy-compatible)
  // ══════════════════════════════════════════════════════

  async getPayrollPanel(period: string) {
    const payslips = await this.prisma.read.payslip.findMany({
      where: { period },
      include: { user: { select: { id: true, fullName: true, department: true } } },
    });
    const totals = payslips.reduce(
      (acc, p) => ({
        gross: acc.gross + p.grossSalary,
        net: acc.net + p.netSalary,
        deduct: acc.deduct + p.totalDeductions,
      }),
      { gross: 0, net: 0, deduct: 0 },
    );
    return {
      period,
      headcount: payslips.length,
      totalGross: +totals.gross.toFixed(2),
      totalNet: +totals.net.toFixed(2),
      totalDeductions: +totals.deduct.toFixed(2),
      avgGross: payslips.length ? +(totals.gross / payslips.length).toFixed(2) : 0,
    };
  }

  // ══════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════

  private buildPerformanceInsights(avg: number, atRisk: number, total: number): string[] {
    const out = [];
    if (avg >= 4) out.push(`✅ Performance excelente: score médio ${avg}/5`);
    else if (avg >= 3) out.push(`Score médio na faixa aceitável: ${avg}/5`);
    else out.push(`⚠️ Pontuação Média abaixo do esperado: ${avg}/5`);
    if (atRisk > 0)
      out.push(`${atRisk} colaborador(es) (${pct(atRisk, total)}%) com performance crítica`);
    return out;
  }

  private buildTrainingInsights(completionRate: number, mandatoryRate: number): string[] {
    const out = [];
    if (mandatoryRate < 80) out.push(`⚠️ Taxa de formações obrigatórias baixa: ${mandatoryRate}%`);
    if (completionRate >= 80) out.push(`✅ Excelente taxa de conclusão: ${completionRate}%`);
    else out.push(`Taxa de conclusão: ${completionRate}%`);
    return out;
  }
}
