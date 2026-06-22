// src/reports/reports.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportFilterDto, SaveReportDto, CreateScheduleDto, ReportCategory } from './reports.dto';

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

function dateRange(filter: ReportFilterDto): { gte: Date; lte: Date } {
  const to = filter.to ? new Date(filter.to) : new Date();
  const from = filter.from
    ? new Date(filter.from)
    : new Date(to.getFullYear(), to.getMonth() - 1, 1);
  return { gte: from, lte: to };
}

function pct(num: number, den: number): number {
  return den > 0 ? +((num / den) * 100).toFixed(1) : 0;
}

function trend(curr: number, prev: number): number {
  return prev > 0 ? +(((curr - prev) / prev) * 100).toFixed(1) : 0;
}

/** Build user filter from department/manager */
function userWhere(filter: ReportFilterDto): any {
  const where: any = {};
  if (filter.departmentId) where.departmentId = filter.departmentId;
  if (filter.managerId) where.managerId = filter.managerId;
  if (filter.positionId) where.positionId = filter.positionId;
  return Object.keys(where).length > 0 ? where : undefined;
}

const TARGET_SKILL_LEVEL = 5;

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): any {
    return (this.prisma as any).db ?? this.prisma;
  }

  // ══════════════════════════════════════════════════════
  // HR REPORTS
  // ══════════════════════════════════════════════════════

  async headcountReport(filter: ReportFilterDto) {
    const range = dateRange(filter);
    const uWhere = userWhere(filter);
    const baseWhere = uWhere ? { ...uWhere } : {};

    const [total, active, newHires, prevHires] = await Promise.all([
      this.prismaRead.user.count({ where: baseWhere }),
      this.prismaRead.user.count({ where: { ...baseWhere, active: true } }),
      this.prismaRead.user.count({
        where: { ...baseWhere, createdAt: { gte: range.gte, lte: range.lte } },
      }),
      this.prismaRead.user.count({
        where: {
          ...baseWhere,
          createdAt: {
            gte: new Date(range.gte.getTime() - (range.lte.getTime() - range.gte.getTime())),
            lt: range.gte,
          },
        },
      }),
    ]);

    const byDept = await this.prismaRead.department.findMany({
      select: { id: true, name: true, _count: { select: { users: true } } },
    });

    const byPosition = await this.prismaRead.position.findMany({
      select: { id: true, name: true, level: true, _count: { select: { users: true } } },
      orderBy: { _count: { users: 'desc' } },
      take: 10,
    });

    return {
      report: 'HEADCOUNT',
      period: { from: range.gte, to: range.lte },
      summary: {
        total,
        active,
        inactive: total - active,
        newHires,
        newHiresTrend: trend(newHires, prevHires),
        turnoverRate: total > 0 ? pct(total - active, total) : 0,
      },
      byDepartment: byDept.map(d => ({ id: d.id, name: d.name, count: d._count.users })),
      byPosition: byPosition.map(p => ({
        id: p.id,
        name: p.name,
        level: p.level,
        count: p._count.users,
      })),
      generatedAt: new Date(),
    };
  }

  async turnoverReport(filter: ReportFilterDto) {
    const range = dateRange(filter);
    const uWhere = userWhere(filter);

    const [total, inactive, newInPeriod, leftInPeriod] = await Promise.all([
      this.prismaRead.user.count({ where: uWhere ?? {} }),
      this.prismaRead.user.count({ where: { ...uWhere, active: false } }),
      this.prismaRead.user.count({
        where: { ...uWhere, createdAt: { gte: range.gte, lte: range.lte } },
      }),
      this.prismaRead.user.count({
        where: { ...uWhere, active: false, updatedAt: { gte: range.gte, lte: range.lte } },
      }),
    ]);

    const turnoverRate = total > 0 ? pct(leftInPeriod, total) : 0;
    const retentionRate = 100 - turnoverRate;

    return {
      report: 'TURNOVER',
      period: { from: range.gte, to: range.lte },
      summary: { total, inactive, newInPeriod, leftInPeriod, turnoverRate, retentionRate },
      insights: this.buildTurnoverInsights(turnoverRate, leftInPeriod),
      generatedAt: new Date(),
    };
  }

  // ══════════════════════════════════════════════════════
  // LEARNING REPORTS
  // ══════════════════════════════════════════════════════

  async trainingReport(from: string, to: string, departmentId?: number) {
    const filter: ReportFilterDto = { from, to, departmentId };
    return this.trainingReportFull(filter);
  }

  async trainingReportFull(filter: ReportFilterDto) {
    const range = dateRange(filter);
    const uWhere = userWhere(filter);
    const where: any = { enrolledAt: { gte: range.gte, lte: range.lte } };
    if (uWhere) where.user = uWhere;

    const [enrollments, completed, inProgress, cancelled, byCourseFull, byDept, avgScore] =
      await Promise.all([
        this.prismaRead.enrollment.count({ where }),
        this.prismaRead.enrollment.count({ where: { ...where, status: 'CONCLUIDO' } }),
        this.prismaRead.enrollment.count({ where: { ...where, status: 'EM_ANDAMENTO' } }),
        this.prismaRead.enrollment.count({ where: { ...where, status: 'CANCELADO' } }),
        // Top courses
        this.prismaRead.enrollment
          .groupBy({
            by: ['courseId'],
            where,
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 10,
          })
          .then(async rows => {
            const ids = rows.map(r => r.courseId);
            const courses = await this.prismaRead.course.findMany({
              where: { id: { in: ids } },
              select: { id: true, title: true, category: true },
            });
            const cMap = new Map(courses.map(c => [c.id, c]));
            const compls = await this.prismaRead.enrollment.groupBy({
              by: ['courseId'],
              where: { ...where, status: 'CONCLUIDO' },
              _count: { id: true },
            });
            const compMap = new Map<any, number>(compls.map((c: any) => [c.courseId, c._count.id]));
            return rows.map(r => ({
              course: cMap.get(r.courseId),
              enrollments: r._count.id,
              completions: compMap.get(r.courseId) ?? 0,
              completionRate: pct(compMap.get(r.courseId) ?? 0, r._count.id),
            }));
          }),
        // By department
        this.prismaRead.enrollment
          .groupBy({
            by: ['userId'],
            where: { ...where, status: 'CONCLUIDO' },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 200,
          })
          .then(async rows => {
            const users = await this.prismaRead.user.findMany({
              where: { id: { in: rows.map(r => r.userId) } },
              select: { id: true, departmentId: true },
            });
            const deptCount: Record<number, number> = {};
            for (const r of rows) {
              const u = users.find(u => u.id === r.userId);
              const dId = u?.departmentId ?? 0;
              deptCount[dId] = (deptCount[dId] ?? 0) + r._count.id;
            }
            const depts = await this.prismaRead.department.findMany({
              where: { id: { in: Object.keys(deptCount).map(Number) } },
              select: { id: true, name: true },
            });
            return depts
              .map(d => ({ department: d.name, completions: deptCount[d.id] ?? 0 }))
              .sort((a, b) => b.completions - a.completions);
          }),
        this.prismaRead.performanceReview
          .aggregate({
            where: {
              ...(uWhere ? { user: uWhere } : {}),
              createdAt: { gte: range.gte, lte: range.lte },
            },
            _avg: { score: true },
          })
          .catch(() => ({ _avg: { score: null } })),
      ]);

    const completionRate = pct(completed, enrollments);
    const abandonment = pct(cancelled, enrollments);

    return {
      report: 'TRAINING',
      period: { from: range.gte, to: range.lte },
      summary: {
        enrollments,
        completed,
        inProgress,
        cancelled,
        completionRate,
        abandonment,
        uniqueLearners: 0,
      },
      topCourses: byCourseFull,
      byDepartment: byDept,
      avgPerformance: avgScore._avg.score ? +avgScore._avg.score.toFixed(2) : null,
      insights: this.buildTrainingInsights(completionRate, abandonment),
      generatedAt: new Date(),
    };
  }

  async skillGapReport(filter: ReportFilterDto) {
    const uWhere = userWhere(filter);
    const where: any = {};
    if (uWhere) where.user = uWhere;

    const records = await this.prismaRead.userCompetency.findMany({
      where,
      include: {
        competency: { select: { id: true, name: true, type: true } },
        user: {
          select: {
            id: true,
            fullName: true,
            department: { select: { name: true } },
            position: { select: { name: true } },
          },
        },
      },
    });

    const TARGET = TARGET_SKILL_LEVEL;
    const bySkill: Record<string, any> = {};

    for (const r of records) {
      const cName = r.competency.name;
      const gap = TARGET - r.currentLevel;
      if (!bySkill[cName])
        bySkill[cName] = {
          competency: r.competency,
          count: 0,
          totalGap: 0,
          usersWithGap: 0,
          users: [],
        };
      bySkill[cName].count++;
      if (gap > 0) {
        bySkill[cName].totalGap += gap;
        bySkill[cName].usersWithGap++;
        bySkill[cName].users.push({
          id: r.user.id,
          fullName: r.user.fullName,
          dept: r.user.department?.name,
          level: r.currentLevel,
          gap,
        });
      }
    }

    const skills = Object.values(bySkill)
      .map((c: any) => ({ ...c, avgGap: c.count ? +(c.totalGap / c.count).toFixed(1) : 0 }))
      .sort((a: any, b: any) => b.avgGap - a.avgGap);

    return {
      report: 'SKILL_GAP',
      totalAssessed: records.length,
      criticalGaps: skills.filter((s: any) => s.avgGap >= 2).length,
      skills,
      generatedAt: new Date(),
    };
  }

  // ══════════════════════════════════════════════════════
  // PERFORMANCE REPORTS
  // ══════════════════════════════════════════════════════

  async performanceReport(period: string, departmentId?: number) {
    const filter: ReportFilterDto = { period, departmentId };
    return this.performanceReportFull(filter);
  }

  async performanceReportFull(filter: ReportFilterDto) {
    const uWhere = userWhere(filter);
    const where: any = {};
    if (filter.period) where.period = { contains: filter.period };
    if (filter.from)
      where.createdAt = {
        gte: new Date(filter.from),
        ...(filter.to && { lte: new Date(filter.to) }),
      };
    if (uWhere) where.user = uWhere;

    const reviews = await this.prismaRead.performanceReview.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            department: { select: { name: true } },
            position: { select: { name: true, level: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const scores = reviews.map(r => r.score ?? 0).filter(s => s > 0);
    const avg = scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 0;

    const dist = { exceptional: 0, aboveExpected: 0, expected: 0, belowExpected: 0, critical: 0 };
    for (const s of scores) {
      if (s >= 4.5) dist.exceptional++;
      else if (s >= 3.5) dist.aboveExpected++;
      else if (s >= 2.5) dist.expected++;
      else if (s >= 1.5) dist.belowExpected++;
      else dist.critical++;
    }

    const byDept: Record<string, { count: number; sum: number }> = {};
    for (const r of reviews) {
      const d = r.user?.department?.name ?? 'N/A';
      if (!byDept[d]) byDept[d] = { count: 0, sum: 0 };
      byDept[d].count++;
      byDept[d].sum += r.score ?? 0;
    }

    const topPerformers = [...reviews]
      .filter(r => r.score !== null)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 10)
      .map(r => ({ user: r.user, score: r.score, type: r.type }));

    const atRisk = reviews
      .filter(r => (r.score ?? 0) < 2.5)
      .map(r => ({ user: r.user, score: r.score }));

    return {
      report: 'PERFORMANCE',
      period: filter.period,
      summary: { totalReviews: reviews.length, avgScore: avg, distribution: dist },
      byDepartment: Object.entries(byDept)
        .map(([dept, d]) => ({
          department: dept,
          count: d.count,
          avgScore: +(d.sum / d.count).toFixed(2),
        }))
        .sort((a, b) => b.avgScore - a.avgScore),
      topPerformers,
      atRisk,
      insights: this.buildPerformanceInsights(avg, atRisk.length, reviews.length),
      generatedAt: new Date(),
    };
  }

  // ══════════════════════════════════════════════════════
  // ENGAGEMENT REPORT
  // ══════════════════════════════════════════════════════

  async engagementReport(filter: ReportFilterDto) {
    const range = dateRange(filter);
    const uWhere = userWhere(filter);

    const [activeSurveys, totalResponses, surveys, recognitions, feedbackCount, avgMoodRecent] =
      await Promise.all([
        this.prismaRead.engagementSurvey.count({ where: { status: 'ACTIVE' } }),
        this.prismaRead.surveyResponse.count({
          where: {
            createdAt: { gte: range.gte, lte: range.lte },
            ...(uWhere ? { user: uWhere } : {}),
          },
        }),
        this.prismaRead.engagementSurvey.findMany({
          where: { status: { in: ['ACTIVE', 'COMPLETED'] } },
          include: {
            _count: { select: { responses: true } },
            responses: { select: { score: true }, take: 200 },
          },
          orderBy: { createdAt: 'desc' },
          take: 6,
        }),
        this.prismaRead.recognition
          ?.count({ where: { createdAt: { gte: range.gte, lte: range.lte } } })
          .catch(() => 0),
        this.prismaRead.feedback
          ?.count({ where: { createdAt: { gte: range.gte, lte: range.lte } } })
          .catch(() => 0),
        this.prismaRead.moodCheckin
          ?.aggregate({ _avg: { mood: true }, where: { createdAt: { gte: range.gte } } })
          .catch(() => null),
      ]);

    const totalUsers = await this.prismaRead.user.count({
      where: { active: true, ...(uWhere ?? {}) },
    });
    const participationRate = pct(totalResponses, totalUsers);

    const surveyData = surveys.map(s => {
      const responses = s.responses as any[];
      const avgScore = responses.length
        ? +(responses.reduce((a, r) => a + (r.score ?? 0), 0) / responses.length).toFixed(2)
        : null;
      return {
        id: s.id,
        title: (s as any).title,
        type: (s as any).type,
        responses: s._count.responses,
        avgScore,
      };
    });

    return {
      report: 'ENGAGEMENT',
      period: { from: range.gte, to: range.lte },
      summary: {
        activeSurveys,
        totalResponses,
        participationRate,
        totalUsers,
        recognitions,
        feedbackCount,
      },
      avgMood: avgMoodRecent?._avg?.mood ? +avgMoodRecent._avg.mood.toFixed(1) : null,
      surveys: surveyData,
      insights:
        participationRate < 50
          ? ['⚠️ Taxa de participação abaixo de 50% — considerar incentivos']
          : ['✅ Boa taxa de participação nos surveys'],
      generatedAt: new Date(),
    };
  }

  // ══════════════════════════════════════════════════════
  // TALENT REPORT
  // ══════════════════════════════════════════════════════

  async talentReport(filter: ReportFilterDto) {
    const uWhere = userWhere(filter);

    const [
      totalUsers,
      hiPos,
      successionPlans,
      activePlans,
      completedPlans,
      avgCompetency,
      avgPerf,
    ] = await Promise.all([
      this.prismaRead.user.count({ where: { active: true, ...(uWhere ?? {}) } }),
      this.prismaRead.userCompetency
        .groupBy({
          by: ['userId'],
          where: uWhere ? { user: uWhere } : {},
          _avg: { currentLevel: true },
          having: { currentLevel: { _avg: { gte: 4 } } },
          orderBy: { _avg: { currentLevel: 'desc' } },
          take: 100,
        })
        .then(r => r.length)
        .catch(() => 0),
      this.prismaRead.successionPlan.findMany({
        include: {
          position: { select: { name: true, level: true } },
          candidate: { select: { id: true, fullName: true } },
        },
        take: 20,
      }),
      this.prismaRead.developmentPlan.count({
        where: { status: 'ACTIVE', isTemplate: false, ...(uWhere ? { user: uWhere } : {}) },
      }),
      this.prismaRead.developmentPlan.count({
        where: { status: 'COMPLETED', isTemplate: false, ...(uWhere ? { user: uWhere } : {}) },
      }),
      this.prismaRead.userCompetency.aggregate({
        _avg: { currentLevel: true },
        where: uWhere ? { user: uWhere } : {},
      }),
      this.prismaRead.performanceReview.aggregate({
        _avg: { score: true },
        where: uWhere ? { user: uWhere } : {},
      }),
    ]);

    const pdpCoverage = pct(activePlans, totalUsers);
    const succession = successionPlans.length;

    return {
      report: 'TALENT',
      summary: {
        totalUsers,
        hiPos,
        hiPoRatio: pct(hiPos, totalUsers),
        activePlans,
        completedPlans,
        pdpCoverage,
        succession,
        avgCompetency: avgCompetency._avg.currentLevel
          ? +avgCompetency._avg.currentLevel.toFixed(2)
          : null,
        avgPerformance: avgPerf._avg.score ? +avgPerf._avg.score.toFixed(2) : null,
      },
      successionPlans: successionPlans.map(s => ({
        position: s.position,
        candidate: s.candidate,
        readiness: (s as any).readiness,
      })),
      insights: this.buildTalentInsights(hiPos, totalUsers, pdpCoverage, succession),
      generatedAt: new Date(),
    };
  }

  // ══════════════════════════════════════════════════════
  // COMPLIANCE REPORT
  // ══════════════════════════════════════════════════════

  async complianceReport(filter: ReportFilterDto) {
    const uWhere = userWhere(filter);
    const range = dateRange(filter);

    const [mandatoryTotal, mandatoryCompleted, auditLogs, certifications] = await Promise.all([
      this.prismaRead.enrollment
        .count({
          where: { course: { mandatory: true } as any, ...(uWhere ? { user: uWhere } : {}) },
        })
        .catch(() => 0),
      this.prismaRead.enrollment
        .count({
          where: {
            course: { mandatory: true } as any,
            status: 'CONCLUIDO',
            ...(uWhere ? { user: uWhere } : {}),
          },
        })
        .catch(() => 0),
      this.prismaRead.auditLog
        .count({
          where: { timestamp: { gte: range.gte, lte: range.lte } },
        })
        .catch(() => 0),
      this.prismaRead.certificate
        .findMany({
          where: { issuedAt: { gte: range.gte, lte: range.lte } },
          include: {
            user: { select: { id: true, fullName: true, department: { select: { name: true } } } },
          },
          orderBy: { issuedAt: 'desc' },
          take: 20,
        })
        .catch(() => [] as any[]),
    ]);

    const mandatoryRate = pct(mandatoryCompleted, mandatoryTotal);

    return {
      report: 'COMPLIANCE',
      period: { from: range.gte, to: range.lte },
      summary: {
        mandatoryTotal,
        mandatoryCompleted,
        mandatoryRate,
        auditEvents: auditLogs,
        certificationsIssued: (certifications as any[]).length,
      },
      recentCertifications: (certifications as any[]).slice(0, 10),
      riskLevel: mandatoryRate < 70 ? 'HIGH' : mandatoryRate < 90 ? 'MEDIUM' : 'LOW',
      insights:
        mandatoryRate < 80
          ? [
              `⚠️ Taxa de conclusão de formações obrigatórias: ${mandatoryRate}% — abaixo do mínimo recomendado (80%)`,
            ]
          : [`✅ Conformidade de formações obrigatórias: ${mandatoryRate}%`],
      generatedAt: new Date(),
    };
  }

  // ══════════════════════════════════════════════════════
  // ATTENDANCE REPORT (legacy-compatible)
  // ══════════════════════════════════════════════════════

  async attendanceReport(from: string, to: string, departmentId?: number) {
    const where: any = { date: { gte: new Date(from), lte: new Date(to) } };
    const records = await this.prismaRead.attendanceRecord.findMany({
      where,
      include: { employee: { select: { id: true, fullName: true, email: true } } },
    });

    const summary = { present: 0, absent: 0, late: 0, remote: 0, justified: 0 };
    for (const r of records) {
      const s = (r.status?.toLowerCase() ?? 'absent') as keyof typeof summary;
      if (s in summary) summary[s]++;
    }
    const total = records.length;
    const attended = summary.present + summary.remote + summary.late;
    return {
      report: 'ATTENDANCE',
      period: { from, to },
      total,
      ...summary,
      presenceRate: pct(attended, total),
      generatedAt: new Date(),
    };
  }

  // ══════════════════════════════════════════════════════
  // PAYROLL SUMMARY (legacy-compatible)
  // ══════════════════════════════════════════════════════

  async payrollSummary(period: string) {
    const records = await this.prismaRead.historyRecord.findMany({
      where: { action: 'PAYSLIP', description: { contains: `"period":"${period}"` } },
      include: { user: { select: { id: true, fullName: true, department: true } } },
    });
    const payslips = records.map(r => {
      try {
        return { ...r, ...JSON.parse(r.description ?? '{}') };
      } catch {
        return r as any;
      }
    });
    const totals = payslips.reduce(
      (acc: any, p: any) => ({
        grossSalary: acc.grossSalary + (p.grossSalary ?? 0),
        netSalary: acc.netSalary + (p.netSalary ?? 0),
        totalDeductions: acc.totalDeductions + (p.totalDeductions ?? 0),
      }),
      { grossSalary: 0, netSalary: 0, totalDeductions: 0 },
    );
    return {
      report: 'PAYROLL',
      period,
      headcount: payslips.length,
      totals: Object.fromEntries(
        Object.entries(totals).map(([k, v]) => [k, +(v as number).toFixed(2)]),
      ),
      generatedAt: new Date(),
    };
  }

  // ══════════════════════════════════════════════════════
  // COMPETENCY GAP (legacy-compatible)
  // ══════════════════════════════════════════════════════

  async competencyGapReport(departmentId?: number) {
    const where: any = {};
    if (departmentId) where.user = { departmentId };
    const records = await this.prismaRead.userCompetency.findMany({
      where,
      include: {
        competency: true,
        user: { select: { id: true, fullName: true, department: true } },
      },
    });
    const byComp: Record<string, any> = {};
    for (const g of records) {
      const n = g.competency.name;
      if (!byComp[n]) byComp[n] = { name: n, count: 0, totalGap: 0, usersWithGap: 0 };
      byComp[n].count++;
      const gap = TARGET_SKILL_LEVEL - g.currentLevel;
      if (gap > 0) {
        byComp[n].totalGap += gap;
        byComp[n].usersWithGap++;
      }
    }
    return Object.values(byComp)
      .map((c: any) => ({ ...c, avgGap: c.count ? +(c.totalGap / c.count).toFixed(1) : 0 }))
      .sort((a: any, b: any) => b.avgGap - a.avgGap);
  }

  // ══════════════════════════════════════════════════════
  // PLATFORM USAGE
  // ══════════════════════════════════════════════════════

  async platformUsageReport(filter: ReportFilterDto) {
    const range = dateRange(filter);

    const [contentViews, topContent, avatarSessions, surveySubmissions, auditActions, activeUsers] =
      await Promise.all([
        this.prismaRead.auditLog
          .count({
            where: {
              action: 'CONTENT_VIEW',
              entity: 'ContentAsset',
              timestamp: { gte: range.gte, lte: range.lte },
            },
          })
          .catch(() => 0),
        this.prismaRead.auditLog
          .groupBy({
            by: ['entityId'],
            where: {
              action: 'CONTENT_VIEW',
              entity: 'ContentAsset',
              timestamp: { gte: range.gte, lte: range.lte },
            },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 10,
          })
          .catch(() => [] as any[]),
        this.prismaRead.avatarSession.count({
          where: { startedAt: { gte: range.gte, lte: range.lte } },
        }),
        this.prismaRead.surveyResponse.count({
          where: { createdAt: { gte: range.gte, lte: range.lte } },
        }),
        this.prismaRead.auditLog
          .count({ where: { timestamp: { gte: range.gte, lte: range.lte } } })
          .catch(() => 0),
        this.prismaRead.auditLog
          .groupBy({
            by: ['userId'],
            where: { timestamp: { gte: range.gte, lte: range.lte } },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 5000,
          })
          .then(r => r.length)
          .catch(() => 0),
      ]);

    // Enrich top content
    const contentIds = (topContent as any[]).map((v: any) => v.entityId).filter(Boolean);
    const contents = contentIds.length
      ? await this.prismaRead.contentAsset.findMany({
          where: { id: { in: contentIds } },
          select: { id: true, title: true, type: true },
        })
      : [];
    const cMap = new Map(contents.map(c => [c.id, c]));

    return {
      report: 'PLATFORM_USAGE',
      period: { from: range.gte, to: range.lte },
      summary: { contentViews, avatarSessions, surveySubmissions, auditActions, activeUsers },
      topContent: (topContent as any[])
        .map((v: any) => ({
          content: cMap.get(v.entityId),
          views: v._count.id,
        }))
        .filter((v: any) => v.content),
      generatedAt: new Date(),
    };
  }

  // ══════════════════════════════════════════════════════
  // SAVED REPORTS & LIBRARY
  // ══════════════════════════════════════════════════════

  async saveReport(userId: number, dto: SaveReportDto) {
    return (this.prisma as any).savedReport
      ?.create({
        data: {
          name: dto.name,
          description: dto.description,
          category: dto.category,
          reportKey: dto.reportKey,
          params: dto.params,
          isTemplate: dto.isTemplate ?? false,
          favourite: dto.favourite ?? false,
          createdById: userId,
        },
      })
      .catch(async () => {
        // Fallback: log to AuditLog
        await this.prisma.auditLog
          .create({
            data: { userId, action: 'REPORT_SAVED', entity: 'SavedReport', entityId: null },
          })
          .catch(() => {});
        return {
          id: null,
          message: 'Relatório guardado (modelo savedReport ausente — execute migration)',
          ...dto,
        };
      });
  }

  async listSavedReports(userId: number, category?: ReportCategory) {
    const where: any = { OR: [{ createdById: userId }, { isTemplate: true }] };
    if (category) where.category = category;
    return this.prismaRead.savedReport
      ?.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
      })
      .catch(() => []);
  }

  async getTemplates() {
    const templates = await this.prismaRead.savedReport
      ?.findMany({
        where: { isTemplate: true },
        orderBy: { category: 'asc' },
      })
      .catch(() => [] as any[]);

    if ((templates as any[]).length) return templates;

    // Built-in templates
    return this.getBuiltInTemplates();
  }

  async deleteReport(reportId: number) {
    await (this.prisma as any).savedReport?.delete({ where: { id: reportId } }).catch(() => null);
    return { message: 'Relatório removido' };
  }

  // ══════════════════════════════════════════════════════
  // SCHEDULES
  // ══════════════════════════════════════════════════════

  async createSchedule(userId: number, dto: CreateScheduleDto) {
    return (this.prisma as any).reportSchedule
      ?.create({
        data: {
          savedReportId: dto.savedReportId,
          frequency: dto.frequency,
          startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
          endDate: dto.endDate ? new Date(dto.endDate) : null,
          recipients: dto.recipients ?? [],
          formats: dto.formats ?? ['PDF'],
          createdById: userId,
          active: true,
        },
      })
      .catch(() => ({
        message: 'Agendamento registado (modelo reportSchedule ausente — execute migration)',
        ...dto,
      }));
  }

  async listSchedules(userId: number) {
    return this.prismaRead.reportSchedule
      ?.findMany({
        where: { createdById: userId, active: true },
        orderBy: { createdAt: 'desc' },
      })
      .catch(() => []);
  }

  async deleteSchedule(scheduleId: number) {
    await (this.prisma as any).reportSchedule
      ?.update({ where: { id: scheduleId }, data: { active: false } })
      .catch(() => null);
    return { message: 'Agendamento cancelado' };
  }

  // ══════════════════════════════════════════════════════
  // CSV / XLSX EXPORT HELPERS
  // ══════════════════════════════════════════════════════

  async exportToCsv(data: any[], headers: string[]): Promise<string> {
    const rows = data.map(row =>
      headers
        .map(h => {
          const v = row[h];
          if (typeof v === 'string' && v.includes(',')) return `"${v}"`;
          return v ?? '';
        })
        .join(','),
    );
    return [headers.join(','), ...rows].join('\n');
  }

  // ══════════════════════════════════════════════════════
  // AI INSIGHTS
  // ══════════════════════════════════════════════════════

  async getInsights(filter: ReportFilterDto) {
    const [training, performance, talent, engagement] = await Promise.all([
      this.trainingReportFull(filter),
      this.performanceReportFull(filter),
      this.talentReport(filter),
      this.engagementReport(filter),
    ]);

    const insights: { type: string; message: string; severity: string; recommendation: string }[] =
      [];

    // Training insights
    if (training.summary.completionRate < 60)
      insights.push({
        type: 'LEARNING',
        severity: 'HIGH',
        message: `Taxa de conclusão de cursos baixa: ${training.summary.completionRate}%`,
        recommendation: 'Identificar cursos com alta taxa de abandono e reavaliar o conteúdo',
      });

    if (training.summary.abandonment > 25)
      insights.push({
        type: 'LEARNING',
        severity: 'MEDIUM',
        message: `Taxa de abandono elevada: ${training.summary.abandonment}%`,
        recommendation: 'Considerar cursos mais curtos (microlearning) para aumentar conclusão',
      });

    // Performance insights
    const atRiskCount = performance.atRisk.length;
    if (atRiskCount > 0)
      insights.push({
        type: 'PERFORMANCE',
        severity: 'HIGH',
        message: `${atRiskCount} colaborador(es) com performance abaixo de 2.5`,
        recommendation: 'Agendar 1:1 e criar PDI de melhoria urgente',
      });

    if ((performance.summary.avgScore ?? 0) < 3)
      insights.push({
        type: 'PERFORMANCE',
        severity: 'MEDIUM',
        message: `Score médio organizacional abaixo de 3.0: ${performance.summary.avgScore}`,
        recommendation: 'Rever programas de desenvolvimento e metas',
      });

    // Talent insights
    if (talent.summary.pdpCoverage < 40)
      insights.push({
        type: 'TALENT',
        severity: 'HIGH',
        message: `Apenas ${talent.summary.pdpCoverage}% dos colaboradores têm PDI activo`,
        recommendation: 'Lançar campanha de criação de PDIs com apoio dos gestores',
      });

    if (talent.summary.succession < 5)
      insights.push({
        type: 'TALENT',
        severity: 'MEDIUM',
        message: 'Pipeline de sucessão insuficiente',
        recommendation: 'Identificar e preparar sucessores para posições críticas',
      });

    // Engagement insights
    if (engagement.summary.participationRate < 50)
      insights.push({
        type: 'ENGAGEMENT',
        severity: 'MEDIUM',
        message: `Taxa de participação em surveys abaixo de 50%: ${engagement.summary.participationRate}%`,
        recommendation: 'Simplificar surveys e comunicar importância da participação',
      });

    return { insights, generatedAt: new Date(), count: insights.length };
  }

  // ══════════════════════════════════════════════════════
  // HELPERS — insight builders
  // ══════════════════════════════════════════════════════

  private buildTurnoverInsights(rate: number, left: number): string[] {
    const out = [];
    if (rate > 20)
      out.push(`🚨 Taxa de turnover crítica: ${rate}% — investigar causas urgentemente`);
    else if (rate > 10) out.push(`⚠️ Turnover acima da média de mercado: ${rate}%`);
    else out.push(`✅ Turnover dentro do esperado: ${rate}%`);
    if (left > 0) out.push(`${left} colaborador(es) saíram no período`);
    return out;
  }

  private buildTrainingInsights(completionRate: number, abandonment: number): string[] {
    const out = [];
    if (completionRate >= 80) out.push(`✅ Taxa de conclusão excelente: ${completionRate}%`);
    else if (completionRate >= 60)
      out.push(`⚠️ Taxa de conclusão aceitável: ${completionRate}% — há margem de melhoria`);
    else out.push(`🚨 Taxa de conclusão baixa: ${completionRate}% — rever conteúdo e metodologia`);
    if (abandonment > 25)
      out.push(`⚠️ Alta taxa de abandono (${abandonment}%) — considerar microlearning`);
    return out;
  }

  private buildPerformanceInsights(avg: number, atRisk: number, total: number): string[] {
    const out = [];
    if (avg >= 4) out.push(`✅ Excelente performance média da organização: ${avg}/5`);
    else if (avg >= 3) out.push(`Score médio na faixa aceitável: ${avg}/5`);
    else out.push(`⚠️ Score médio abaixo do esperado: ${avg}/5 — acção necessária`);
    if (atRisk > 0)
      out.push(`${atRisk} colaborador(es) (${pct(atRisk, total)}%) com performance crítica`);
    return out;
  }

  private buildTalentInsights(
    hiPos: number,
    total: number,
    pdpCoverage: number,
    succession: number,
  ): string[] {
    const out = [];
    const hiPoRatio = pct(hiPos, total);
    if (hiPoRatio >= 15)
      out.push(`🌟 Alto índice de High Potentials: ${hiPoRatio}% da força de trabalho`);
    else if (hiPoRatio > 0) out.push(`${hiPos} High Potential(s) identificados (${hiPoRatio}%)`);
    if (pdpCoverage < 40) out.push(`⚠️ Baixa cobertura de PDI: ${pdpCoverage}%`);
    if (succession < 3) out.push(`⚠️ Pipeline de sucessão insuficiente: ${succession} plano(s)`);
    return out;
  }

  private getBuiltInTemplates() {
    return [
      {
        id: 'TPL_HEADCOUNT',
        name: 'Headcount Report',
        category: 'HR',
        reportKey: 'headcount',
        description: 'Total de colaboradores por departamento e cargo',
      },
      {
        id: 'TPL_TURNOVER',
        name: 'Turnover Analysis',
        category: 'HR',
        reportKey: 'turnover',
        description: 'Taxa de saída e retenção por período',
      },
      {
        id: 'TPL_TRAINING',
        name: 'Relatório de Formação',
        category: 'LEARNING',
        reportKey: 'training',
        description: 'Conclusões, abandono e horas de treino',
      },
      {
        id: 'TPL_SKILL_GAP',
        name: 'Gaps de Competências',
        category: 'LEARNING',
        reportKey: 'skill-gap',
        description: 'Lacunas de skills por departamento',
      },
      {
        id: 'TPL_PERFORMANCE',
        name: 'Performance Report',
        category: 'PERFORMANCE',
        reportKey: 'performance',
        description: 'Avaliações, distribuição e top performers',
      },
      {
        id: 'TPL_TALENT',
        name: 'Talent Intelligence',
        category: 'TALENT',
        reportKey: 'talent',
        description: 'HiPos, PDI, sucessão e competências',
      },
      {
        id: 'TPL_ENGAGEMENT',
        name: 'Engagement Report',
        category: 'ENGAGEMENT',
        reportKey: 'engagement',
        description: 'Surveys, eNPS e participação',
      },
      {
        id: 'TPL_COMPLIANCE',
        name: 'Compliance Report',
        category: 'COMPLIANCE',
        reportKey: 'compliance',
        description: 'Formações obrigatórias e certificações',
      },
      {
        id: 'TPL_USAGE',
        name: 'Platform Usage',
        category: 'OPERATIONAL',
        reportKey: 'usage',
        description: 'Conteúdos mais vistos e sessões activas',
      },
    ];
  }
}
