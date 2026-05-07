// src/dashboard-rh/dashboard-rh.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────────

function monthStart(offset = 0): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - offset, 1);
}

function monthEnd(offset = 0): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - offset + 1, 0, 23, 59, 59);
}

function pct(num: number, den: number): number {
  return den > 0 ? +(((num / den) * 100)).toFixed(1) : 0;
}

function trend(curr: number, prev: number): number {
  return prev > 0 ? +((((curr - prev) / prev) * 100)).toFixed(1) : 0;
}

function tenureMonths(createdAt: Date): number {
  return Math.floor((Date.now() - createdAt.getTime()) / (30 * 86400000));
}

function safeM(prisma: any, name: string) {
  return (prisma as any)[name] ?? {
    count: async () => 0, findMany: async () => [], findFirst: async () => null,
    aggregate: async () => ({ _avg: {}, _count: {} }), groupBy: async () => [],
  };
}

// Status health indicator
function healthStatus(value: number, goodAbove: number, warnAbove: number): '🟢' | '🟡' | '🔴' {
  if (value >= goodAbove) return '🟢';
  if (value >= warnAbove) return '🟡';
  return '🔴';
}
function healthStatusInverse(value: number, goodBelow: number, warnBelow: number): '🟢' | '🟡' | '🔴' {
  if (value <= goodBelow) return '🟢';
  if (value <= warnBelow) return '🟡';
  return '🔴';
}

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class DashboardRhService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // FULL DASHBOARD — aggregates all domains
  // ══════════════════════════════════════════════════════

  async getFullRhDashboard() {
    const now   = new Date();
    const mS    = monthStart();
    const mS1   = monthStart(1);
    const mEnd1 = monthEnd(1);

    const [
      totalActive, totalInactive,
      newHires,    prevHires,
      deptBreakdown, posBreakdown,
      avgPerfScore,
      activePlans,
      completionRate,
      mandatoryCompliance,
      surveyParticipation,
      avatarSessions,
      topBadgeAwardees,
      recentActivity,
    ] = await Promise.all([
      this.prisma.user.count({ where: { active: true } }),
      this.prisma.user.count({ where: { active: false } }),
      this.prisma.user.count({ where: { createdAt: { gte: mS } } }),
      this.prisma.user.count({ where: { createdAt: { gte: mS1, lt: mS } } }),
      this.prisma.user.groupBy({
        by: ['departmentId'], where: { active: true }, _count: { id: true },
      }),
      this.prisma.user.groupBy({
        by: ['positionId'], where: { active: true }, _count: { id: true },
      }),
      this.prisma.performanceReview.aggregate({
        where: { createdAt: { gte: mS1 } }, _avg: { score: true },
      }).catch(() => ({ _avg: { score: null } })),
      this.prisma.developmentPlan.count({ where: { status: 'ACTIVE', isTemplate: false } }),
      this.prisma.enrollment.count({ where: { status: 'CONCLUIDO', enrolledAt: { gte: mS } } }),
      this.prisma.enrollment.count({
        where: { course: { mandatory: true } as any, status: 'CONCLUIDO' },
      }).catch(() => 0),
      this.prisma.surveyResponse.count({ where: { createdAt: { gte: mS } } }),
      this.prisma.avatarSession.count({ where: { status: 'COMPLETED', startedAt: { gte: mS } } }),
      this.prisma.badgeAward.groupBy({
       by: ['userId'], _count: { id: true },
       orderBy: { _count: { id: 'desc' } },
       take: 5,
       }).catch(() => [] as any[]),
      this.prisma.auditLog.findMany({
        where: { timestamp: { gte: mS } },
        select: { id: true, action: true, entity: true, timestamp: true, userId: true },
        orderBy: { timestamp: 'desc' },
        take: 10,
      }).catch(() => [] as any[]),
    ]);

    const total        = totalActive + totalInactive;
    const turnoverRate = pct(totalInactive, total);
    const hiringTrend  = trend(newHires, prevHires);
    const pdpCoverage  = pct(activePlans, totalActive);

    // Enrich dept breakdown with names
    const deptIds    = deptBreakdown.map(d => d.departmentId).filter(Boolean) as number[];
    const departments= deptIds.length
      ? await this.prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } })
      : [];
    const deptMap    = new Map(departments.map(d => [d.id, d.name]));

    const posIds   = posBreakdown.map(p => p.positionId).filter(Boolean) as number[];
    const positions= posIds.length
      ? await this.prisma.position.findMany({ where: { id: { in: posIds } }, select: { id: true, name: true, level: true } })
      : [];
    const posMap   = new Map(positions.map(p => [p.id, p]));

    // Alerts
    const alerts = await this.getAlerts();

    return {
      generatedAt: now,
      kpis: {
        headcount:       { total: totalActive, status: '🟢' },
        turnover:        { rate: turnoverRate, status: healthStatusInverse(turnoverRate, 10, 20) },
        newHires:        { count: newHires, trend: hiringTrend },
        performance:     { avg: avgPerfScore._avg.score ? +avgPerfScore._avg.score.toFixed(2) : null },
        pdpCoverage:     { pct: pdpCoverage, status: healthStatus(pdpCoverage, 70, 40) },
        completions:     { count: completionRate },
        engagement:      { surveyResponses: surveyParticipation },
        avatarSessions,
        mandatoryCompliance,
      },
      distribution: {
        byDepartment: deptBreakdown
          .map(d => ({ id: d.departmentId, name: deptMap.get(d.departmentId!) ?? 'N/A', count: d._count.id }))
          .sort((a, b) => b.count - a.count),
        byPosition: posBreakdown
          .map(p => ({ ...posMap.get(p.positionId!), count: p._count.id }))
          .sort((a: any, b: any) => b.count - a.count),
      },
      alerts,
      topBadgeAwardees: (topBadgeAwardees as any[]).slice(0, 5),
      recentActivity,
    };
  }

  // ══════════════════════════════════════════════════════
  // HEADCOUNT & STRUCTURE
  // ══════════════════════════════════════════════════════

  async getHeadcountPanel(departmentId?: number) {
    const deptFilter = departmentId ? { departmentId } : {};

    const [total, active, byDept, byPos, byTenure] = await Promise.all([
      this.prisma.user.count({ where: deptFilter }),
      this.prisma.user.count({ where: { ...deptFilter, active: true } }),
      this.prisma.department.findMany({
        select: { id: true, name: true, _count: { select: { users: true } } },
      }),
      (this.prisma as any).position.findMany({
      select: { id: true, name: true, level: true, _count: { select: { users: true } } },
      orderBy: { _count: { users: 'desc' } }, take: 10,
      }),
      this.prisma.user.findMany({
        where:  { ...deptFilter, active: true },
        select: { createdAt: true },
      }).then(users => {
        const buckets = { '<1yr': 0, '1-2yr': 0, '2-5yr': 0, '5+yr': 0 };
        for (const u of users) {
          const months = tenureMonths(u.createdAt);
          if      (months < 12)  buckets['<1yr']++;
          else if (months < 24)  buckets['1-2yr']++;
          else if (months < 60)  buckets['2-5yr']++;
          else                   buckets['5+yr']++;
        }
        return buckets;
      }),
    ]);

    const avgTenure = await this.prisma.user
      .findMany({ where: { ...deptFilter, active: true }, select: { createdAt: true } })
      .then(us => us.length ? +(us.reduce((s, u) => s + tenureMonths(u.createdAt), 0) / us.length).toFixed(1) : 0);

    return {
      total, active, inactive: total - active,
      turnoverRate: pct(total - active, total),
      avgTenureMonths: avgTenure,
      byDepartment: byDept.map(d => ({ id: d.id, name: d.name, count: d._count.users })).sort((a, b) => b.count - a.count),
      byPosition:   byPos.map(p => ({ id: p.id, name: p.name, level: p.level, count: p._count.users })),
      byTenure,
    };
  }

  async getHeadcountTrend(months = 6) {
    const trend: { month: string; count: number; new: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const endDate = monthEnd(i);
      const start   = monthStart(i);
      const [count, newInMonth] = await Promise.all([
        this.prisma.user.count({ where: { createdAt: { lte: endDate }, active: true } }),
        this.prisma.user.count({ where: { createdAt: { gte: start, lte: endDate } } }),
      ]);
      const label = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`;
      trend.push({ month: label, count, new: newInMonth });
    }
    return trend;
  }

  // ══════════════════════════════════════════════════════
  // TURNOVER & RETENTION
  // ══════════════════════════════════════════════════════

  async getTurnoverPanel(months = 12) {
    const now    = new Date();
    const [total, inactive] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { active: false } }),
    ]);

    const recent3 = await this.prisma.user.count({
      where: { active: false, updatedAt: { gte: monthStart(3) } },
    });

    // Tenure distribution of active users
    const activeUsers = await this.prisma.user.findMany({
      where:  { active: true },
      select: { id: true, fullName: true, createdAt: true, managerId: true,
        department: { select: { name: true } },
        position:   { select: { name: true } } },
    });

    const tenures = activeUsers.map(u => tenureMonths(u.createdAt));
    const avgTenure = tenures.length ? +(tenures.reduce((a, b) => a + b, 0) / tenures.length).toFixed(1) : 0;

    // At-risk heuristic: active users + low performance
    const atRiskUsers = await this.prisma.performanceReview.findMany({
      where:   { score: { lt: 2.5 }, status: 'COMPLETED' },
      include: { user: { select: { id: true, fullName: true, department: { select: { name: true } }, position: { select: { name: true } } } } },
      orderBy: { score: 'asc' },
      take:    10,
    }).catch(() => [] as any[]);

    const turnoverRate = pct(inactive, total);

    return {
      turnoverRate,
      retentionRate: +(100 - turnoverRate).toFixed(1),
      totalLeft:     inactive,
      leftLast3Months: recent3,
      avgTenureMonths: avgTenure,
      avgTenureYears: +(avgTenure / 12).toFixed(1),
      atRiskUsers: (atRiskUsers as any[]).map((r: any) => ({
        user:  r.user,
        score: r.score,
        risk:  r.score < 2 ? 'HIGH' : 'MEDIUM',
      })),
      insights: this.buildTurnoverInsights(turnoverRate, recent3),
    };
  }

  // ══════════════════════════════════════════════════════
  // ENGAGEMENT & CLIMA
  // ══════════════════════════════════════════════════════

  async getEngagementPanel(departmentId?: number) {
    const mS     = monthStart();
    const uWhere = departmentId ? { departmentId } : {};

    const [
      totalUsers, surveyResponses,
      activeSurveys,
      avgSurveyScore, recognitions,
      avatarSessions, badgeAwards,
    ] = await Promise.all([
      this.prisma.user.count({ where: { active: true, ...uWhere } }),
      this.prisma.surveyResponse.count({ where: { createdAt: { gte: mS }, user: uWhere } }),
      this.prisma.engagementSurvey.count({ where: { status: 'ACTIVE' } }),
      this.prisma.surveyResponse.aggregate({
        where: { createdAt: { gte: mS }, user: uWhere }, _avg: { score: true },
      }).catch(() => ({ _avg: { score: null } })),
      safeM(this.prisma, 'recognition').count({ where: { createdAt: { gte: mS } } }),
      this.prisma.avatarSession.count({ where: { status: 'COMPLETED', startedAt: { gte: mS }, user: uWhere } }),
      this.prisma.badgeAward.count({ where: { awardedAt: { gte: mS }, user: uWhere } }),
    ]);

    const participationRate   = pct(surveyResponses, totalUsers);
    const engagementScore     = avgSurveyScore._avg.score
      ? +(((avgSurveyScore._avg.score / 5) * 100)).toFixed(1)
      : null;

    // Dept breakdown of survey participation
    const deptBreakdown = await this.prisma.surveyResponse.groupBy({
      by:    ['userId'],
      where: { createdAt: { gte: mS } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take:   200,
    }).then(async rows => {
      const uIds  = rows.map(r => r.userId);
      const users = await this.prisma.user.findMany({
        where: { id: { in: uIds } }, select: { id: true, departmentId: true },
      });
      const deptC: Record<number, number> = {};
      for (const r of rows) {
        const u   = users.find(u => u.id === r.userId);
        const dId = u?.departmentId ?? 0;
        deptC[dId] = (deptC[dId] ?? 0) + 1;
      }
      const depts = await this.prisma.department.findMany({
        where: { id: { in: Object.keys(deptC).map(Number) } }, select: { id: true, name: true },
      });
      return depts.map(d => ({ department: d.name, responses: deptC[d.id] ?? 0 }))
        .sort((a, b) => b.responses - a.responses);
    }).catch(() => [] as any[]);

    return {
      engagementScore,
      participationRate,
      status: healthStatus(participationRate, 70, 40),
      activeSurveys,
      recognitions: recognitions ?? 0,
      avatarSessions,
      badgeAwards,
      byDepartment: deptBreakdown,
      insights: engagementScore && engagementScore < 50
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
      this.prisma.performanceReview.findMany({
        where:   { user: uWhere },
        include: { user: { select: { id: true, fullName: true, avatarUrl: true,
          department: { select: { name: true } }, position: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where: { active: true, ...uWhere } }),
      this.prisma.userCompetency.groupBy({
        by:     ['userId'],
        where:  uWhere ? { user: uWhere } : {},
        _avg:   { currentLevel: true },
        having: { currentLevel: { _avg: { gte: 4 } } },
      }).then(r => r.length).catch(() => 0),
      this.prisma.developmentPlan.count({ where: { status: 'ACTIVE', isTemplate: false, user: uWhere } }),
    ]);

    const scores = reviews.map(r => r.score ?? 0).filter(s => s > 0);
    const avg    = scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 0;

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
      byDept[d].sum   += r.score ?? 0;
      byDept[d].count += 1;
    }

    return {
      avgScore:    avg,
      status:      healthStatus(avg, 3.5, 2.5),
      total:       reviews.length,
      distribution:dist,
      atRisk,
      hiPos,
      hiPoRatio:   pct(hiPos, userCount),
      pdpCoverage: pct(activePlans, userCount),
      byDepartment: Object.entries(byDept).map(([dept, d]) => ({
        department: dept,
        avgScore:   +(d.sum / d.count).toFixed(2),
        count:      d.count,
      })).sort((a, b) => b.avgScore - a.avgScore),
      topPerformers: reviews.filter(r => (r.score ?? 0) >= 4).slice(0, 8).map(r => ({
        user: r.user, score: r.score,
      })),
      insights: this.buildPerformanceInsights(avg, atRisk, reviews.length),
    };
  }

  // ══════════════════════════════════════════════════════
  // SKILLS & COMPETÊNCIAS
  // ══════════════════════════════════════════════════════

  async getSkillsPanel(departmentId?: number) {
    const uWhere = departmentId ? { user: { departmentId } } : {};

    const [competencies, legacySkills, totalUsers] = await Promise.all([
      (this.prisma as any).userCompetency.findMany({
      where: uWhere,
      include: { competency: { select: { id: true, name: true, type: true } } },
      }),
      this.prisma.legacyEmployeeSkill.findMany({
        where: uWhere,
        include: { skill: { select: { id: true, name: true, type: true } } },
      }).catch(() => [] as any[]),
      this.prisma.user.count({ where: { active: true, ...(departmentId ? { departmentId } : {}) } }),
    ]);

    const TARGET = 5;
    const byComp: Record<string, { comp: any; count: number; totalGap: number; avgLevel: number }> = {};
    for (const c of competencies) {
      const n = c.competency.name;
      if (!byComp[n]) byComp[n] = { comp: c.competency, count: 0, totalGap: 0, avgLevel: 0 };
      byComp[n].count++;
      byComp[n].avgLevel += c.currentLevel;
      const gap = TARGET - c.currentLevel;
      if (gap > 0) byComp[n].totalGap += gap;
    }
    const skillData = Object.values(byComp).map(c => ({
      competency: c.comp,
      count:      c.count,
      avgLevel:   +(c.avgLevel / c.count).toFixed(2),
      avgGap:     +(c.totalGap / c.count).toFixed(1),
    })).sort((a, b) => b.avgGap - a.avgGap);

    const assessed = new Set(competencies.map(c => c.userId)).size;

    return {
      totalUsers,
      assessed,
      assessmentRate:  pct(assessed, totalUsers),
      totalCompetencies: skillData.length,
      criticalGaps:    skillData.filter(s => s.avgGap >= 2).length,
      topGaps:         skillData.slice(0, 8),
      topStrengths:    [...skillData].sort((a, b) => b.avgLevel - a.avgLevel).slice(0, 5),
    };
  }

  // ══════════════════════════════════════════════════════
  // TRAINING & DESENVOLVIMENTO
  // ══════════════════════════════════════════════════════

  async getTrainingPanel(departmentId?: number) {
    const mS     = monthStart();
    const uWhere = departmentId ? { user: { departmentId } } : {};

    const [
      enrollments, completed, inProgress, cancelled,
      mandatory, mandatoryComplete,
      topCourses,
    ] = await Promise.all([
      this.prisma.enrollment.count({ where: { enrolledAt: { gte: mS }, ...uWhere } }),
      this.prisma.enrollment.count({ where: { status: 'CONCLUIDO', enrolledAt: { gte: mS }, ...uWhere } }),
      this.prisma.enrollment.count({ where: { status: 'EM_ANDAMENTO', ...uWhere } }),
      this.prisma.enrollment.count({ where: { status: 'CANCELADO', enrolledAt: { gte: mS }, ...uWhere } }),
      this.prisma.enrollment.count({ where: { course: { mandatory: true } as any, ...uWhere } }).catch(() => 0),
      this.prisma.enrollment.count({ where: { course: { mandatory: true } as any, status: 'CONCLUIDO', ...uWhere } }).catch(() => 0),
      this.prisma.enrollment.groupBy({
        by:      ['courseId'],
        where:   { ...uWhere },
        _count:  { id: true },
        orderBy: { _count: { id: 'desc' } },
        take:    5,
      }).then(async rows => {
        const ids    = rows.map(r => r.courseId);
        const courses= await this.prisma.course.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, category: true } });
        const cMap   = new Map(courses.map(c => [c.id, c]));
        return rows.map(r => ({ course: cMap.get(r.courseId), count: r._count.id }));
      }),
    ]);

    const totalUsers    = await this.prisma.user.count({ where: { active: true, ...(departmentId ? { departmentId } : {}) } });
    const completionRate= pct(completed, enrollments);
    const mandatoryRate = pct(mandatoryComplete, mandatory);

    return {
      enrollments, completed, inProgress, cancelled,
      completionRate, abandonment: pct(cancelled, enrollments),
      mandatory, mandatoryComplete, mandatoryRate,
      mandatoryStatus: healthStatus(mandatoryRate, 90, 70),
      topCourses,
      estimatedHours: completed * 2, // ~2h avg
      uniqueLearners:  await this.prisma.enrollment.findMany({
        where: { enrolledAt: { gte: mS }, ...uWhere }, select: { userId: true }, distinct: ['userId'],
      }).then(r => r.length),
      insights: this.buildTrainingInsights(completionRate, mandatoryRate),
    };
  }

  // ══════════════════════════════════════════════════════
  // COMPLIANCE
  // ══════════════════════════════════════════════════════

  async getCompliancePanel() {
    const [mandatory, mandatoryDone, auditLogs, certs] = await Promise.all([
      this.prisma.enrollment.count({ where: { course: { mandatory: true } as any } }).catch(() => 0),
      this.prisma.enrollment.count({ where: { course: { mandatory: true } as any, status: 'CONCLUIDO' } }).catch(() => 0),
      this.prisma.auditLog.count({ where: { timestamp: { gte: monthStart() } } }).catch(() => 0),
      this.prisma.certificate.findMany({
        where:   { issuedAt: { gte: monthStart(3) } },
        include: { user: { select: { id: true, fullName: true, department: { select: { name: true } } } } },
        orderBy: { issuedAt: 'desc' },
        take:    10,
      }).catch(() => [] as any[]),
    ]);

    const mandatoryRate = pct(mandatoryDone, mandatory);
    return {
      mandatory, mandatoryDone, mandatoryRate,
      riskLevel:    mandatoryRate < 70 ? 'HIGH' : mandatoryRate < 90 ? 'MEDIUM' : 'LOW',
      status:       healthStatus(mandatoryRate, 90, 70),
      auditEvents:  auditLogs,
      recentCerts:  certs,
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
    const now   = new Date();
    const month = now.getMonth() + 1;
    const users = await this.prisma.user.findMany({
      where:  { active: true },
      select: { id: true, fullName: true, avatarUrl: true, createdAt: true,
        department: { select: { name: true } }, position: { select: { name: true } } },
    });
    return users
      .filter(u => new Date(u.createdAt).getMonth() + 1 === month)
      .map(u => ({
        id:       u.id,
        fullName: u.fullName,
        avatarUrl:u.avatarUrl,
        position: u.position?.name,
        department:u.department?.name,
        hireDate: u.createdAt,
        years:    now.getFullYear() - new Date(u.createdAt).getFullYear(),
      }))
      .filter(u => u.years > 0)
      .sort((a, b) => b.years - a.years);
  }

  // ══════════════════════════════════════════════════════
  // ATTENDANCE (legacy-compatible)
  // ══════════════════════════════════════════════════════

  async getAttendancePanel(from?: string, to?: string) {
    const dateFrom = from ? new Date(from) : monthStart();
    const dateTo   = to   ? new Date(to)   : new Date();
    const records  = await this.prisma.attendance.findMany({
      where: { date: { gte: dateFrom, lte: dateTo } },
      include: { employee: { select: { id: true, name: true } } },
    });

    const summary = { present: 0, absent: 0, late: 0, remote: 0, justified: 0 };
    for (const r of records) {
      const s = (r.status?.toLowerCase() ?? 'absent') as keyof typeof summary;
      if (s in summary) summary[s]++;
    }
    const total   = records.length;
    const attended= summary.present + summary.remote + summary.late;
    return {
      period: { from: dateFrom, to: dateTo },
      total, ...summary,
      presenceRate:    pct(attended, total),
      absenteeismRate: pct(summary.absent + summary.justified, total),
      status:          healthStatusInverse(pct(summary.absent, total), 5, 10),
    };
  }

  // ══════════════════════════════════════════════════════
  // SUCCESSION & TALENT PIPELINE
  // ══════════════════════════════════════════════════════

  async getTalentPipeline() {
    const [positions, plans, hiPos] = await Promise.all([
      this.prisma.position.findMany({
        select: { id: true, name: true, level: true,
          _count: { select: { users: true, successionPlans: true } } },
        orderBy: { level: 'desc' },
        take:    20,
      }),
      this.prisma.successionPlan.findMany({
        include: {
          candidate: { select: { id: true, fullName: true, avatarUrl: true,
            position:  { select: { name: true } } } },
          position:  { select: { id: true, name: true, level: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.userCompetency.groupBy({
        by: ['userId'], _avg: { currentLevel: true },
        having: { currentLevel: { _avg: { gte: 4 } } },
        orderBy: { _avg: { currentLevel: 'desc' } },
        take: 20,
        }).then(async rows => {
        const ids   = rows.map(r => r.userId);
        const users = await this.prisma.user.findMany({
          where:  { id: { in: ids }, active: true },
          select: { id: true, fullName: true, avatarUrl: true,
            position:   { select: { name: true } },
            department: { select: { name: true } } },
        });
        return users;
      }).catch(() => [] as any[]),
    ]);

    const covered  = positions.filter(p => p._count.successionPlans > 0).length;
    const atRisk   = positions.filter(p => p._count.successionPlans === 0 && p._count.users > 0);

    return {
      totalPositions:     positions.length,
      covered,
      coverageRate:       pct(covered, positions.length),
      positionsAtRisk:    atRisk.slice(0, 5),
      successionPlans:    plans,
      highPotentials:     hiPos,
      hiPoCount:          (hiPos as any[]).length,
    };
  }

  // ══════════════════════════════════════════════════════
  // AI ALERTS & PREDICTIONS
  // ══════════════════════════════════════════════════════

  async getAlerts() {
    const alerts: { type: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; message: string; count?: number }[] = [];
    const mS = monthStart();

    const [
      overdueActions, mandatoryPending,
      atRiskPerf, lowEngagement,
    ] = await Promise.all([
      this.prisma.developmentPlanAction.count({
        where: { status: { notIn: ['COMPLETED', 'CANCELLED'] }, dueDate: { lt: new Date() } },
      }).catch(() => 0),
      this.prisma.enrollment.count({
        where: { course: { mandatory: true } as any, status: { not: 'CONCLUIDO' } },
      }).catch(() => 0),
      this.prisma.performanceReview.count({ where: { score: { lt: 2 }, status: 'COMPLETED' } }).catch(() => 0),
      this.prisma.surveyResponse.count({ where: { createdAt: { gte: mS } } })
        .then(async r => {
          const total = await this.prisma.user.count({ where: { active: true } });
          return total > 0 && (r / total) < 0.3; // <30% participation = low
        }).catch(() => false),
    ]);

    if (atRiskPerf > 0)       alerts.push({ type: 'PERFORMANCE', severity: 'HIGH',   message: `${atRiskPerf} colaborador(es) com performance crítica`, count: atRiskPerf });
    if (mandatoryPending > 0) alerts.push({ type: 'COMPLIANCE',  severity: 'HIGH',   message: `${mandatoryPending} formação(ões) obrigatória(s) por concluir`, count: mandatoryPending });
    if (overdueActions > 0)   alerts.push({ type: 'PDI',         severity: 'MEDIUM', message: `${overdueActions} acção(ões) de PDI em atraso`, count: overdueActions });
    if (lowEngagement)        alerts.push({ type: 'ENGAGEMENT',  severity: 'MEDIUM', message: 'Taxa de participação em surveys abaixo de 30%' });

    return alerts;
  }

  async getPredictions() {
    const [turnoverRisk, lowPerf, lowEngagement] = await Promise.all([
      // Users with low performance + long tenure = turnover risk
      this.prisma.performanceReview.findMany({
        where: { score: { lt: 2.5 }, status: 'COMPLETED' },
        include: { user: { select: { id: true, fullName: true, avatarUrl: true,
          department: { select: { name: true } }, createdAt: true } } },
        orderBy: { score: 'asc' },
        take: 10,
      }).then(rs => rs.map(r => ({
        user:      r.user,
        score:     r.score,
        tenureMonths: tenureMonths(r.user.createdAt),
        riskLevel: r.score! < 2 ? 'HIGH' : 'MEDIUM',
        reason:    'Baixa performance + histórico de avaliações',
      }))).catch(() => [] as any[]),
      this.prisma.performanceReview.count({ where: { score: { lt: 2 }, status: 'COMPLETED' } }).catch(() => 0),
      this.prisma.surveyResponse.count({ where: { createdAt: { gte: monthStart() } } }),
    ]);

    return {
      turnoverRisk,
      summary: {
        atRiskCount: (turnoverRisk as any[]).length,
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
    const users = await this.prisma.user.findMany({
      where:  { active: true },
      select: { id: true, createdAt: true },
      take:   500,
    });
    const userIds = users.map(u => u.id);

    const [perfReviews, enrollments, surveyResponses] = await Promise.all([
      this.prisma.performanceReview.findMany({
        where: { userId: { in: userIds } }, select: { userId: true, score: true },
      }),
      this.prisma.enrollment.findMany({
        where: { userId: { in: userIds }, status: 'CONCLUIDO' },
        select: { userId: true },
      }),
      this.prisma.surveyResponse.findMany({
        where: { userId: { in: userIds } }, select: { userId: true, score: true },
      }),
    ]);

    // Group by user
    const byUser = userIds.map(id => {
      const perf    = perfReviews.filter(r => r.userId === id);
      const courses = enrollments.filter(e => e.userId === id).length;
      const surveys = surveyResponses.filter(s => s.userId === id);
      const avgPerf = perf.length ? perf.reduce((a, r) => a + (r.score ?? 0), 0) / perf.length : 0;
      const avgEng  = surveys.length ? surveys.reduce((a, s) => a + (s.score ?? 0), 0) / surveys.length : 0;
      return { id, avgPerf, courses, avgEng, tenureMonths: tenureMonths(users.find(u => u.id === id)!.createdAt) };
    }).filter(u => u.avgPerf > 0);

    // Segment: high training (>3 courses) vs low training
    const highTraining = byUser.filter(u => u.courses >= 3);
    const lowTraining  = byUser.filter(u => u.courses < 3);
    const avgPerfHigh  = highTraining.length ? +(highTraining.reduce((a, u) => a + u.avgPerf, 0) / highTraining.length).toFixed(2) : 0;
    const avgPerfLow   = lowTraining.length  ? +(lowTraining.reduce((a, u) => a + u.avgPerf, 0) / lowTraining.length).toFixed(2) : 0;

    // Engagement vs performance
    const withBoth    = byUser.filter(u => u.avgEng > 0);
    const highEng     = withBoth.filter(u => u.avgEng >= 3.5);
    const lowEng      = withBoth.filter(u => u.avgEng < 2.5);
    const avgPerfHighE= highEng.length ? +(highEng.reduce((a, u) => a + u.avgPerf, 0) / highEng.length).toFixed(2) : 0;
    const avgPerfLowE = lowEng.length  ? +(lowEng.reduce((a, u) => a + u.avgPerf, 0) / lowEng.length).toFixed(2) : 0;

    return {
      trainingVsPerformance: {
        highTrainingAvgPerf: avgPerfHigh,
        lowTrainingAvgPerf:  avgPerfLow,
        lift:                +(avgPerfHigh - avgPerfLow).toFixed(2),
        insight: avgPerfHigh > avgPerfLow
          ? `Colaboradores com +3 cursos concluídos têm performance média ${((avgPerfHigh / Math.max(avgPerfLow, 0.01) - 1) * 100).toFixed(0)}% superior`
          : 'Dados insuficientes para correlação',
      },
      engagementVsPerformance: {
        highEngAvgPerf: avgPerfHighE,
        lowEngAvgPerf:  avgPerfLowE,
        lift:           +(avgPerfHighE - avgPerfLowE).toFixed(2),
        insight: avgPerfHighE > avgPerfLowE
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
    const records = await this.prisma.historyRecord.findMany({
      where:   { action: 'PAYSLIP', description: { contains: `"period":"${period}"` } },
      include: { user: { select: { id: true, fullName: true, department: true } } },
    });
    const payslips = records.map(r => { try { return { ...r, ...JSON.parse(r.description ?? '{}') }; } catch { return r as any; } });
    const totals   = payslips.reduce((acc: any, p: any) => ({
      gross:  acc.gross  + (p.grossSalary  ?? 0),
      net:    acc.net    + (p.netSalary    ?? 0),
      deduct: acc.deduct + (p.totalDeductions ?? 0),
    }), { gross: 0, net: 0, deduct: 0 });
    return {
      period,
      headcount: payslips.length,
      totalGross:      +totals.gross.toFixed(2),
      totalNet:        +totals.net.toFixed(2),
      totalDeductions: +totals.deduct.toFixed(2),
      avgGross:        payslips.length ? +(totals.gross / payslips.length).toFixed(2) : 0,
    };
  }

  // ══════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════

  private buildTurnoverInsights(rate: number, left3: number): string[] {
    const out = [];
    if (rate > 20)      out.push(`🚨 Turnover crítico: ${rate}% — investigar causas urgentemente`);
    else if (rate > 10) out.push(`⚠️ Turnover acima da média: ${rate}%`);
    else                out.push(`✅ Turnover saudável: ${rate}%`);
    if (left3 > 0)      out.push(`${left3} saída(s) nos últimos 3 meses`);
    return out;
  }

  private buildPerformanceInsights(avg: number, atRisk: number, total: number): string[] {
    const out = [];
    if (avg >= 4)       out.push(`✅ Performance excelente: score médio ${avg}/5`);
    else if (avg >= 3)  out.push(`Score médio na faixa aceitável: ${avg}/5`);
    else                out.push(`⚠️ Score médio abaixo do esperado: ${avg}/5`);
    if (atRisk > 0)     out.push(`${atRisk} colaborador(es) (${pct(atRisk, total)}%) com performance crítica`);
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

















