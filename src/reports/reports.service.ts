// src/reports/reports.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { EnrollmentStatus, ReportCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportFilterDto, SaveReportDto, CreateScheduleDto } from './reports.dto';
import { sanitizeForLog } from '../common/logging/sanitize';
import { assertCanAccess } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import type { CurrentUserData } from '../common/decorators';
import { buildXlsxBuffer } from '../common/utils/xlsx-export.util';

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
function userWhere(filter: ReportFilterDto): Prisma.UserWhereInput | undefined {
  const where: Prisma.UserWhereInput = {};
  if (filter.departmentId) where.departmentId = filter.departmentId;
  if (filter.managerId) where.managerId = filter.managerId;
  if (filter.positionId) where.positionId = filter.positionId;
  return Object.keys(where).length > 0 ? where : undefined;
}

const TARGET_SKILL_LEVEL = 5;

export interface SkillGapUser {
  id: number;
  fullName: string;
  dept?: string;
  level: number;
  gap: number;
}

export interface SkillGapEntry {
  competency?: { id: number; name: string; type: string };
  name?: string;
  count: number;
  totalGap: number;
  usersWithGap: number;
  users?: SkillGapUser[];
}

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // HR REPORTS
  // ══════════════════════════════════════════════════════

  async headcountReport(filter: ReportFilterDto) {
    const range = dateRange(filter);
    const uWhere = userWhere(filter);
    const baseWhere = uWhere ? { ...uWhere } : {};

    const [total, active, newHires, prevHires] = await Promise.all([
      this.prisma.read.user.count({ where: baseWhere }),
      this.prisma.read.user.count({ where: { ...baseWhere, active: true } }),
      this.prisma.read.user.count({
        where: { ...baseWhere, createdAt: { gte: range.gte, lte: range.lte } },
      }),
      this.prisma.read.user.count({
        where: {
          ...baseWhere,
          createdAt: {
            gte: new Date(range.gte.getTime() - (range.lte.getTime() - range.gte.getTime())),
            lt: range.gte,
          },
        },
      }),
    ]);

    const byDept = await this.prisma.read.department.findMany({
      select: { id: true, name: true, _count: { select: { users: true } } },
    });

    const byPosition = await this.prisma.read.position.findMany({
      select: { id: true, name: true, level: true, _count: { select: { users: true } } },
      // Ordenar um findMany por contagem de relação usa { relação: { _count } },
      // não { _count: { relação } } (essa forma é só válida em groupBy/aggregate)
      // — ver o padrão já correcto em analytics.service.ts. Isto rebentava
      // sempre com PrismaClientValidationError (500 incondicional).
      orderBy: { users: { _count: 'desc' } },
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
      this.prisma.read.user.count({ where: uWhere ?? {} }),
      this.prisma.read.user.count({ where: { ...uWhere, active: false } }),
      this.prisma.read.user.count({
        where: { ...uWhere, createdAt: { gte: range.gte, lte: range.lte } },
      }),
      this.prisma.read.user.count({
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
    const where: Prisma.EnrollmentWhereInput = { enrolledAt: { gte: range.gte, lte: range.lte } };
    if (uWhere) where.user = uWhere;

    const [enrollments, completed, inProgress, cancelled, byCourseFull, byDept, avgScore] =
      await Promise.all([
        this.prisma.read.enrollment.count({ where }),
        this.prisma.read.enrollment.count({
          where: { ...where, status: EnrollmentStatus.COMPLETED },
        }),
        this.prisma.read.enrollment.count({
          where: { ...where, status: EnrollmentStatus.IN_PROGRESS },
        }),
        this.prisma.read.enrollment.count({
          where: { ...where, status: EnrollmentStatus.CANCELLED },
        }),
        // Top courses
        this.prisma.read.enrollment
          .groupBy({
            by: ['courseId'],
            where,
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 10,
          })
          .then(async rows => {
            const ids = rows.map(r => r.courseId);
            const courses = await this.prisma.read.course.findMany({
              where: { id: { in: ids } },
              select: { id: true, title: true, category: true },
            });
            const cMap = new Map(courses.map(c => [c.id, c]));
            const compls = await this.prisma.read.enrollment.groupBy({
              by: ['courseId'],
              where: { ...where, status: EnrollmentStatus.COMPLETED },
              _count: { id: true },
            });
            const compMap = new Map<number, number>(compls.map(c => [c.courseId, c._count.id]));
            return rows.map(r => ({
              course: cMap.get(r.courseId),
              enrollments: r._count.id,
              completions: compMap.get(r.courseId) ?? 0,
              completionRate: pct(compMap.get(r.courseId) ?? 0, r._count.id),
            }));
          }),
        // By department
        this.prisma.read.enrollment
          .groupBy({
            by: ['userId'],
            where: { ...where, status: EnrollmentStatus.COMPLETED },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 200,
          })
          .then(async rows => {
            const users = await this.prisma.read.user.findMany({
              where: { id: { in: rows.map(r => r.userId) } },
              select: { id: true, departmentId: true },
            });
            const deptCount: Record<number, number> = {};
            for (const r of rows) {
              const u = users.find(u => u.id === r.userId);
              const dId = u?.departmentId ?? 0;
              deptCount[dId] = (deptCount[dId] ?? 0) + r._count.id;
            }
            const depts = await this.prisma.read.department.findMany({
              where: { id: { in: Object.keys(deptCount).map(Number) } },
              select: { id: true, name: true },
            });
            return depts
              .map(d => ({ department: d.name, completions: deptCount[d.id] ?? 0 }))
              .sort((a, b) => b.completions - a.completions);
          }),
        this.prisma.read.performanceReview
          .aggregate({
            where: {
              ...(uWhere ? { user: uWhere } : {}),
              createdAt: { gte: range.gte, lte: range.lte },
            },
            _avg: { score: true },
          })
          .catch(e => {
            this.logger.warn({
              filter,
              metric: 'avgPerformance',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao calcular performance média para relatório de formação',
            });
            return { _avg: { score: null } };
          }),
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
    const where: Prisma.UserCompetencyWhereInput = {};
    if (uWhere) where.user = uWhere;

    const records = await this.prisma.read.userCompetency.findMany({
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
    const bySkill: Record<string, SkillGapEntry> = {};

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
        bySkill[cName].users?.push({
          id: r.user.id,
          fullName: r.user.fullName,
          dept: r.user.department?.name,
          level: r.currentLevel,
          gap,
        });
      }
    }

    const skills = Object.values(bySkill)
      .map(c => ({ ...c, avgGap: c.count ? +(c.totalGap / c.count).toFixed(1) : 0 }))
      .sort((a, b) => b.avgGap - a.avgGap);

    return {
      report: 'SKILL_GAP',
      totalAssessed: records.length,
      criticalGaps: skills.filter(s => s.avgGap >= 2).length,
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
    const where: Prisma.PerformanceReviewWhereInput = {};
    // PerformanceReview não tem coluna `period` (usa `cycleId` → PerformanceCycle,
    // que também não tem `period`) — este filtro nunca teve um campo real para
    // mapear e rebentava sempre com PrismaClientValidationError quando ?period=
    // era passado (incluindo incondicionalmente no endpoint legacy
    // /reports/performance/by-period). Sem um schema/convenção real de "período"
    // para performance reviews, ignora-se o filtro em vez de adivinhar um mapeamento.
    if (filter.from)
      where.createdAt = {
        gte: new Date(filter.from),
        ...(filter.to && { lte: new Date(filter.to) }),
      };
    if (uWhere) where.user = uWhere;

    const reviews = await this.prisma.read.performanceReview.findMany({
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
        this.prisma.read.engagementSurvey.count({ where: { status: 'ACTIVE' } }),
        this.prisma.read.surveyResponse.count({
          where: {
            createdAt: { gte: range.gte, lte: range.lte },
            ...(uWhere ? { user: uWhere } : {}),
          },
        }),
        this.prisma.read.engagementSurvey.findMany({
          where: { status: { in: ['ACTIVE', 'COMPLETED'] } },
          include: {
            _count: { select: { responses: true } },
            responses: { select: { score: true }, take: 200 },
          },
          orderBy: { createdAt: 'desc' },
          take: 6,
        }),
        this.prisma.read.kudos.count({
          where: { createdAt: { gte: range.gte, lte: range.lte } },
        }),
        this.prisma.read.continuousFeedback.count({
          where: { createdAt: { gte: range.gte, lte: range.lte } },
        }),
        this.prisma.read.leadershipPulse.aggregate({
          _avg: { overallScore: true },
          where: { createdAt: { gte: range.gte } },
        }),
      ]);

    const totalUsers = await this.prisma.read.user.count({
      where: { active: true, ...(uWhere ?? {}) },
    });
    const participationRate = pct(totalResponses, totalUsers);

    const surveyData = surveys.map(s => {
      const responses = s.responses;
      const avgScore = responses.length
        ? +(responses.reduce((a, r) => a + (r.score ?? 0), 0) / responses.length).toFixed(2)
        : null;
      return {
        id: s.id,
        title: s.title,
        type: s.type,
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
      avgMood: avgMoodRecent?._avg?.overallScore
        ? +avgMoodRecent._avg.overallScore.toFixed(1)
        : null,
      surveys: surveyData,
      insights:
        participationRate < 50
          ? ['Taxa de participação abaixo de 50% — considerar incentivos']
          : ['Boa taxa de participação nos surveys'],
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
      this.prisma.read.user.count({ where: { active: true, ...(uWhere ?? {}) } }),
      this.prisma.read.userCompetency
        .groupBy({
          by: ['userId'],
          where: uWhere ? { user: uWhere } : {},
          _avg: { currentLevel: true },
          having: { currentLevel: { _avg: { gte: 4 } } },
          orderBy: { _avg: { currentLevel: 'desc' } },
          take: 100,
        })
        .then(r => r.length)
        .catch(e => {
          this.logger.warn({
            filter,
            metric: 'hiPos',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar High Potentials para relatório de talento',
          });
          return 0;
        }),
      this.prisma.read.successionPlan.findMany({
        include: {
          position: { select: { name: true, level: true } },
          candidate: { select: { id: true, fullName: true } },
        },
        take: 20,
      }),
      this.prisma.read.developmentPlan.count({
        where: { status: 'ACTIVE', isTemplate: false, ...(uWhere ? { user: uWhere } : {}) },
      }),
      this.prisma.read.developmentPlan.count({
        where: { status: 'COMPLETED', isTemplate: false, ...(uWhere ? { user: uWhere } : {}) },
      }),
      this.prisma.read.userCompetency.aggregate({
        _avg: { currentLevel: true },
        where: uWhere ? { user: uWhere } : {},
      }),
      this.prisma.read.performanceReview.aggregate({
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
        readiness: s.readinessLevel,
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
      this.prisma.read.enrollment
        .count({
          where: { course: { mandatory: true }, ...(uWhere ? { user: uWhere } : {}) },
        })
        .catch(e => {
          this.logger.warn({
            filter,
            metric: 'mandatoryTotal',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar matrículas obrigatórias para relatório de compliance',
          });
          return 0;
        }),
      this.prisma.read.enrollment
        .count({
          where: {
            course: { mandatory: true },
            status: EnrollmentStatus.COMPLETED,
            ...(uWhere ? { user: uWhere } : {}),
          },
        })
        .catch(e => {
          this.logger.warn({
            filter,
            metric: 'mandatoryCompleted',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar matrículas obrigatórias concluídas para relatório de compliance',
          });
          return 0;
        }),
      this.prisma.read.auditLog
        .count({
          where: { timestamp: { gte: range.gte, lte: range.lte } },
        })
        .catch(e => {
          this.logger.warn({
            filter,
            metric: 'auditLogs',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar eventos de auditoria para relatório de compliance',
          });
          return 0;
        }),
      this.prisma.read.certificate
        .findMany({
          where: { issuedAt: { gte: range.gte, lte: range.lte } },
          include: {
            user: { select: { id: true, fullName: true, department: { select: { name: true } } } },
          },
          orderBy: { issuedAt: 'desc' },
          take: 20,
        })
        .catch((e: unknown) => {
          this.logger.warn({
            filter,
            metric: 'certifications',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter certificações emitidas para relatório de compliance',
          });
          return [] as Prisma.CertificateGetPayload<{
            include: {
              user: {
                select: { id: true; fullName: true; department: { select: { name: true } } };
              };
            };
          }>[];
        }),
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
        certificationsIssued: certifications.length,
      },
      recentCertifications: certifications.slice(0, 10),
      riskLevel: mandatoryRate < 70 ? 'HIGH' : mandatoryRate < 90 ? 'MEDIUM' : 'LOW',
      insights:
        mandatoryRate < 80
          ? [
              `Taxa de conclusão de formações obrigatórias: ${mandatoryRate}% — abaixo do mínimo recomendado (80%)`,
            ]
          : [`Conformidade de formações obrigatórias: ${mandatoryRate}%`],
      generatedAt: new Date(),
    };
  }

  // ══════════════════════════════════════════════════════
  // ATTENDANCE REPORT (legacy-compatible)
  // ══════════════════════════════════════════════════════

  async attendanceReport(from: string, to: string, departmentId?: number) {
    const where: Prisma.AttendanceRecordWhereInput = {
      date: { gte: new Date(from), lte: new Date(to) },
    };
    const records = await this.prisma.read.attendanceRecord.findMany({
      where,
      include: { user: { select: { id: true, fullName: true, email: true } } },
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
    const records = await this.prisma.read.historyRecord.findMany({
      where: { action: 'PAYSLIP', description: { contains: `"period":"${period}"` } },
      include: { user: { select: { id: true, fullName: true, department: true } } },
    });
    // description é JSON livre (histórico legado) — os campos de payslip
    // (grossSalary/netSalary/totalDeductions) não têm garantia de shape em
    // tempo de compilação, só em runtime a partir do que foi lá escrito.
    interface PayslipFields {
      grossSalary?: number;
      netSalary?: number;
      totalDeductions?: number;
    }
    const payslips: (Prisma.HistoryRecordGetPayload<{
      include: { user: { select: { id: true; fullName: true; department: true } } };
    }> &
      PayslipFields)[] = records.map(r => {
      try {
        return { ...r, ...JSON.parse(r.description ?? '{}') };
      } catch (e: unknown) {
        this.logger.warn({
          historyRecordId: r.id,
          period,
          record: sanitizeForLog(r),
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao interpretar JSON de registo de folha de pagamento — a usar registo em bruto',
        });
        return r;
      }
    });
    const totals = payslips.reduce(
      (acc, p) => ({
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
    const where: Prisma.UserCompetencyWhereInput = {};
    if (departmentId) where.user = { departmentId };
    const records = await this.prisma.read.userCompetency.findMany({
      where,
      include: {
        competency: true,
        user: { select: { id: true, fullName: true, department: true } },
      },
    });
    const byComp: Record<string, SkillGapEntry> = {};
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
      .map(c => ({ ...c, avgGap: c.count ? +(c.totalGap / c.count).toFixed(1) : 0 }))
      .sort((a, b) => b.avgGap - a.avgGap);
  }

  // ══════════════════════════════════════════════════════
  // PLATFORM USAGE
  // ══════════════════════════════════════════════════════

  async platformUsageReport(filter: ReportFilterDto) {
    const range = dateRange(filter);

    const [contentViews, topContent, avatarSessions, surveySubmissions, auditActions, activeUsers] =
      await Promise.all([
        this.prisma.read.auditLog
          .count({
            where: {
              action: 'CONTENT_VIEW',
              entity: 'ContentAsset',
              timestamp: { gte: range.gte, lte: range.lte },
            },
          })
          .catch(e => {
            this.logger.warn({
              filter,
              metric: 'contentViews',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao contar visualizações de conteúdo para relatório de uso da plataforma',
            });
            return 0;
          }),
        this.prisma.read.auditLog
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
          .catch((e: unknown) => {
            this.logger.warn({
              filter,
              metric: 'topContent',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao obter conteúdo mais visto para relatório de uso da plataforma',
            });
            return [] as { entityId: number | null; _count: { id: number } }[];
          }),
        this.prisma.read.avatarSession.count({
          where: { startedAt: { gte: range.gte, lte: range.lte } },
        }),
        this.prisma.read.surveyResponse.count({
          where: { createdAt: { gte: range.gte, lte: range.lte } },
        }),
        this.prisma.read.auditLog
          .count({ where: { timestamp: { gte: range.gte, lte: range.lte } } })
          .catch(e => {
            this.logger.warn({
              filter,
              metric: 'auditActions',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao contar acções de auditoria para relatório de uso da plataforma',
            });
            return 0;
          }),
        this.prisma.read.auditLog
          .groupBy({
            by: ['userId'],
            where: { timestamp: { gte: range.gte, lte: range.lte } },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 5000,
          })
          .then(r => r.length)
          .catch(e => {
            this.logger.warn({
              filter,
              metric: 'activeUsers',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao contar utilizadores activos para relatório de uso da plataforma',
            });
            return 0;
          }),
      ]);

    // Enrich top content
    const contentIds = topContent.map(v => v.entityId).filter((id): id is number => id !== null);
    const contents = contentIds.length
      ? await this.prisma.read.contentAsset.findMany({
          where: { id: { in: contentIds } },
          select: { id: true, title: true, type: true },
        })
      : [];
    const cMap = new Map(contents.map(c => [c.id, c]));

    return {
      report: 'PLATFORM_USAGE',
      period: { from: range.gte, to: range.lte },
      summary: { contentViews, avatarSessions, surveySubmissions, auditActions, activeUsers },
      topContent: topContent
        .map(v => ({
          content: v.entityId !== null ? cMap.get(v.entityId) : undefined,
          views: v._count.id,
        }))
        .filter(v => v.content),
      generatedAt: new Date(),
    };
  }

  // ══════════════════════════════════════════════════════
  // SAVED REPORTS & LIBRARY
  // ══════════════════════════════════════════════════════

  async saveReport(userId: number, dto: SaveReportDto) {
    return this.prisma.savedReport.create({
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
    });
  }

  async listSavedReports(userId: number, category?: ReportCategory) {
    const where: Prisma.SavedReportWhereInput = {
      OR: [{ createdById: userId }, { isTemplate: true }],
    };
    if (category) where.category = category;
    return this.prisma.read.savedReport.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getTemplates() {
    const templates = await this.prisma.read.savedReport.findMany({
      where: { isTemplate: true },
      orderBy: { category: 'asc' },
    });

    if (templates.length) return templates;

    // Built-in templates quando ainda não há nenhum guardado (regra de negócio)
    return this.getBuiltInTemplates();
  }

  async deleteReport(reportId: number, user: CurrentUserData) {
    // Sem isto, qualquer utilizador do tier ALL_MGMT (RH/GESTOR/LIDER/DIRECTOR)
    // podia apagar o relatório guardado de OUTRO utilizador só por adivinhar o
    // ID — listSavedReports() já restringe a leitura ao próprio (+ templates),
    // mas a remoção não tinha nenhuma verificação equivalente.
    const report = await this.prisma.savedReport.findUnique({ where: { id: reportId } });
    if (report) {
      assertCanAccess(report, report.createdById, user, [Role.ADMIN, Role.RH]);
    }
    // deleteMany é idempotente: não lança P2025 se o id não existir,
    // preservando o "sempre devolve mensagem" do comportamento anterior.
    await this.prisma.savedReport.deleteMany({ where: { id: reportId } });
    return { message: 'Relatório removido' };
  }

  // ══════════════════════════════════════════════════════
  // SCHEDULES
  // ══════════════════════════════════════════════════════

  async createSchedule(userId: number, dto: CreateScheduleDto) {
    return this.prisma.reportSchedule.create({
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
    });
  }

  async listSchedules(userId: number) {
    return this.prisma.read.reportSchedule.findMany({
      where: { createdById: userId, active: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteSchedule(scheduleId: number, user: CurrentUserData) {
    // Mesma lacuna de ownership que deleteReport() — sem isto, qualquer
    // utilizador do tier ALL_MGMT podia cancelar o agendamento de outro.
    const schedule = await this.prisma.reportSchedule.findUnique({ where: { id: scheduleId } });
    if (schedule) {
      assertCanAccess(schedule, schedule.createdById, user, [Role.ADMIN, Role.RH]);
    }
    // updateMany é idempotente: não lança P2025 se o id não existir.
    await this.prisma.reportSchedule.updateMany({
      where: { id: scheduleId },
      data: { active: false },
    });
    return { message: 'Agendamento cancelado' };
  }

  // ══════════════════════════════════════════════════════
  // CSV / XLSX EXPORT HELPERS
  // ══════════════════════════════════════════════════════

  async exportToCsv<T extends Record<string, unknown>>(
    data: T[],
    headers: (keyof T & string)[],
  ): Promise<string> {
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

  async exportToXlsx<T extends Record<string, unknown>>(
    data: T[],
    headers: (keyof T & string)[],
    sheetName = 'Relatório',
  ): Promise<Buffer> {
    return buildXlsxBuffer(data, headers, sheetName);
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
      out.push(`Taxa de turnover crítica: ${rate}% — investigar causas urgentemente`);
    else if (rate > 10) out.push(`Turnover acima da média de mercado: ${rate}%`);
    else out.push(`Turnover dentro do esperado: ${rate}%`);
    if (left > 0) out.push(`${left} colaborador(es) saíram no período`);
    return out;
  }

  private buildTrainingInsights(completionRate: number, abandonment: number): string[] {
    const out = [];
    if (completionRate >= 80) out.push(`Taxa de conclusão excelente: ${completionRate}%`);
    else if (completionRate >= 60)
      out.push(`Taxa de conclusão aceitável: ${completionRate}% — há margem de melhoria`);
    else out.push(`Taxa de conclusão baixa: ${completionRate}% — rever conteúdo e metodologia`);
    if (abandonment > 25)
      out.push(`Alta taxa de abandono (${abandonment}%) — considerar microlearning`);
    return out;
  }

  private buildPerformanceInsights(avg: number, atRisk: number, total: number): string[] {
    const out = [];
    if (avg >= 4) out.push(`Excelente performance média da organização: ${avg}/5`);
    else if (avg >= 3) out.push(`Score médio na faixa aceitável: ${avg}/5`);
    else out.push(`Score médio abaixo do esperado: ${avg}/5 — acção necessária`);
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
      out.push(`Alto índice de High Potentials: ${hiPoRatio}% da força de trabalho`);
    else if (hiPoRatio > 0) out.push(`${hiPos} High Potential(s) identificados (${hiPoRatio}%)`);
    if (pdpCoverage < 40) out.push(`Baixa cobertura de PDI: ${pdpCoverage}%`);
    if (succession < 3) out.push(`Pipeline de sucessão insuficiente: ${succession} plano(s)`);
    return out;
  }

  private getBuiltInTemplates() {
    return [
      {
        id: 'TPL_HEADCOUNT',
        name: 'Relatório de Colaboradores',
        category: 'HR',
        reportKey: 'headcount',
      },
      {
        id: 'TPL_TURNOVER',
        name: 'Análise da Rotatividade',
        category: 'HR',
        reportKey: 'turnover',
      },
      {
        id: 'TPL_TRAINING',
        name: 'Relatório de Formação',
        category: 'LEARNING',
        reportKey: 'training',
      },
      {
        id: 'TPL_SKILL_GAP',
        name: 'Lacunas de Competências',
        category: 'LEARNING',
        reportKey: 'skill-gap',
      },
      {
        id: 'TPL_PERFORMANCE',
        name: 'Relatório de Desempenho',
        category: 'PERFORMANCE',
        reportKey: 'performance',
      },
      {
        id: 'TPL_TALENT',
        name: 'Inteligência de Talentos',
        category: 'TALENT',
        reportKey: 'talent',
      },
      {
        id: 'TPL_ENGAGEMENT',
        name: 'Relatórios de Envolvimento dos Colaboradores',
        category: 'ENGAGEMENT',
        reportKey: 'engagement',
      },
      {
        id: 'TPL_COMPLIANCE',
        name: 'Relatório de Compliance',
        category: 'COMPLIANCE',
        reportKey: 'compliance',
      },
      {
        id: 'TPL_USAGE',
        name: 'Utilização da Plataforma',
        category: 'OPERATIONAL',
        reportKey: 'usage',
        description: 'Conteúdos mais vistos e sessões activas',
      },
    ];
  }
}
