import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async trainingReport(from: string, to: string, departmentId?: number) {
    const where: any = { enrolledAt: { gte: new Date(from), lte: new Date(to) } };
    if (departmentId) where.user = { departmentId };
    const [enrollments, completed, byUser, byCourse] = await Promise.all([
      this.prisma.enrollment.count({ where }),
      // EnrollmentStatus enum: EM_ANDAMENTO | CONCLUIDO | CANCELADO
      this.prisma.enrollment.count({ where: { ...where, status: 'CONCLUIDO' } }),
      this.prisma.enrollment.groupBy({ by: ['userId'], where, _count: true }),
      this.prisma.enrollment.groupBy({
        by: ['courseId'], where, _count: true,
        orderBy: { _count: { courseId: 'desc' } },
      }),
    ]);
    const completionRate = enrollments > 0
      ? Math.round((completed / enrollments) * 100) : 0;
    return {
      period: { from, to },
      enrollments,
      completed,
      completionRate,
      uniqueLearners: byUser.length,
      byCourse,
    };
  }

  async performanceReport(period: string, departmentId?: number) {
    const where: any = { period: { contains: period } };
    if (departmentId) where.user = { departmentId };
    const reviews = await this.prisma.performanceReview.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, department: true, position: true } },
      },
    });
    // Schema field is 'score', not 'overallScore'
    const scores = reviews.map(r => r.score ?? 0).filter(s => s > 0);
    const avg = scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;
    const distribution = { excellent: 0, good: 0, average: 0, belowAverage: 0 };
    for (const s of scores) {
      if (s >= 4.5)      distribution.excellent++;
      else if (s >= 3.5) distribution.good++;
      else if (s >= 2.5) distribution.average++;
      else               distribution.belowAverage++;
    }
    return {
      period, totalReviews: reviews.length,
      avgScore: +avg.toFixed(2), distribution, reviews,
    };
  }

  async attendanceReport(from: string, to: string, departmentId?: number) {
    // Schema: Attendance belongs to Employee, not User — no 'user' relation exists.
    // Filter by departmentId is not possible via Attendance directly.
    const where: any = { date: { gte: new Date(from), lte: new Date(to) } };
    const records = await this.prisma.attendance.findMany({
      where,
      include: { employee: { select: { id: true, name: true, email: true } } },
    });

    // Optional in-memory departmentId filter is not applicable (Employee has no departmentId)
    const summary = { present: 0, absent: 0, late: 0, remote: 0, justified: 0 };
    for (const r of records) {
      const s = r.status?.toLowerCase() ?? 'absent';
      if (s in summary) (summary as any)[s]++;
    }
    const total = records.length;
    const attended = summary.present + summary.remote + summary.late;
    const presenceRate = total > 0 ? Math.round((attended / total) * 100) : 0;
    return { period: { from, to }, total, ...summary, presenceRate };
  }

  async payrollSummary(period: string) {
    // NOTE: Payslip model does not exist in schema.
    // Reading from HistoryRecord where action = 'PAYSLIP' (see payslips.service.ts).
    const records = await this.prisma.historyRecord.findMany({
      where: {
        action: 'PAYSLIP',
        description: { contains: `"period":"${period}"` },
      },
      include: { user: { select: { id: true, fullName: true, department: true } } },
    });

    const payslips = records.map(r => {
      try { return { ...r, ...JSON.parse(r.description ?? '{}') }; }
      catch { return r as any; }
    });

    const totals = payslips.reduce(
      (acc: any, p: any) => ({
        grossSalary:     acc.grossSalary     + (p.grossSalary     ?? 0),
        netSalary:       acc.netSalary       + (p.netSalary       ?? 0),
        incomeTax:       acc.incomeTax       + (p.incomeTax       ?? 0),
        socialSecurity:  acc.socialSecurity  + (p.socialSecurity  ?? 0),
        totalDeductions: acc.totalDeductions + (p.totalDeductions ?? 0),
      }),
      { grossSalary: 0, netSalary: 0, incomeTax: 0, socialSecurity: 0, totalDeductions: 0 },
    );
    return {
      period,
      headcount: payslips.length,
      totals: Object.fromEntries(
        Object.entries(totals).map(([k, v]) => [k, +(v as number).toFixed(2)]),
      ),
    };
  }

  async competencyGapReport(departmentId?: number) {
    const where: any = {};
    if (departmentId) where.user = { departmentId };
    const userCompetencies = await this.prisma.userCompetency.findMany({
      where,
      include: {
        competency: true,
        user: { select: { id: true, fullName: true, department: true } },
      },
    });

    // Schema: UserCompetency has only 'level' (Int).
    // There is no targetLevel/currentLevel — gap is computed against a fixed target of 5.
    const TARGET_LEVEL = 5;
    const byCompetency: Record<string, any> = {};
    for (const g of userCompetencies) {
      const cname = g.competency.name;
      if (!byCompetency[cname]) {
        byCompetency[cname] = { name: cname, count: 0, totalGap: 0, usersWithGap: 0 };
      }
      byCompetency[cname].count++;
      const gap = TARGET_LEVEL - g.level;
      if (gap > 0) {
        byCompetency[cname].totalGap += gap;
        byCompetency[cname].usersWithGap++;
      }
    }
    return Object.values(byCompetency)
      .map((c: any) => ({
        ...c,
        avgGap: c.count ? +(c.totalGap / c.count).toFixed(1) : 0,
      }))
      .sort((a: any, b: any) => b.avgGap - a.avgGap);
  }
}