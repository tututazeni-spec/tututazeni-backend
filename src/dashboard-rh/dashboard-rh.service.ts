// src/dashboard-rh/dashboard-rh.service.ts
// Schema corrections:
// - User has no 'hireDate' or 'dateOfBirth' → using 'createdAt' as proxy for hireDate
// - leaveRequest, payslip, workDeclaration models don't exist → using HistoryRecord/AuditLog counts
// - Position has 'name', not 'title'
// - Attendance belongs to Employee, not User (no userId on Attendance)

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardRhService {
  constructor(private prisma: PrismaService) {}

  async getFullRhDashboard() {
    const now            = new Date();
    const monthStart     = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      totalActive, totalInactive,
      newHiresThisMonth, newHiresPrevMonth,
      pendingLeaves, approvedLeavesThisMonth,
      pendingPayslips, pendingDeclarations,
      byDepartment, byPosition,
      avgTenureMonths,
    ] = await Promise.all([
      this.prisma.user.count({ where: { active: true } }),
      this.prisma.user.count({ where: { active: false } }),
      // createdAt used as proxy for hireDate (field doesn't exist on User)
      this.prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.user.count({ where: { createdAt: { gte: prevMonthStart, lt: monthStart } } }),
      // leaveRequest model doesn't exist → count HistoryRecord with action = 'LEAVE_REQUEST' + status PENDING
      this.prisma.historyRecord.count({
        where: { action: 'LEAVE_REQUEST', description: { contains: '"status":"PENDING"' } },
      }),
      this.prisma.historyRecord.count({
        where: {
          action: 'LEAVE_REQUEST',
          description: { contains: '"status":"APPROVED"' },
          createdAt: { gte: monthStart },
        },
      }),
      // payslip model doesn't exist → count HistoryRecord with action = 'PAYSLIP' + status DRAFT
      this.prisma.historyRecord.count({
        where: { action: 'PAYSLIP', description: { contains: '"status":"DRAFT"' } },
      }),
      // workDeclaration model doesn't exist → count HistoryRecord with action = 'WORK_DECLARATION' + status PENDING
      this.prisma.historyRecord.count({
        where: { action: 'WORK_DECLARATION', description: { contains: '"status":"PENDING"' } },
      }),
      this.prisma.user.groupBy({ by: ['departmentId'], where: { active: true }, _count: true }),
      this.prisma.user.groupBy({ by: ['positionId'],   where: { active: true }, _count: true }),
      // Tenure based on createdAt (proxy for hireDate)
      this.prisma.user
        .findMany({ where: { active: true }, select: { createdAt: true } })
        .then(users => {
          if (!users.length) return 0;
          const total = users.reduce((s, u) => {
            const ms = now.getTime() - new Date(u.createdAt).getTime();
            return s + Math.floor(ms / (30 * 24 * 60 * 60 * 1000));
          }, 0);
          return +(total / users.length).toFixed(1);
        }),
    ]);

    const turnoverRate = totalActive > 0
      ? +((totalInactive / (totalActive + totalInactive)) * 100).toFixed(1) : 0;
    const hiringTrend = newHiresPrevMonth > 0
      ? +(((newHiresThisMonth - newHiresPrevMonth) / newHiresPrevMonth) * 100).toFixed(1) : 0;

    return {
      headcount:      { totalActive, totalInactive, turnoverRate },
      recruitment:    { newHiresThisMonth, hiringTrend },
      pendingActions: { leaves: pendingLeaves, payslips: pendingPayslips, declarations: pendingDeclarations },
      retention:      { avgTenureMonths, approvedLeavesThisMonth },
      distribution:   { byDepartment, byPosition },
      generatedAt:    now,
    };
  }

  // dateOfBirth does not exist on User → returns empty array until field is added to schema
  async getBirthdaysThisMonth() {
    // To enable: add dateOfBirth DateTime? to User model in schema.prisma
    return [];
  }

  async getAnniversariesThisMonth() {
    const now   = new Date();
    const month = now.getMonth() + 1;
    // Using createdAt as proxy for hireDate
    const users = await this.prisma.user.findMany({
      where:  { active: true },
      select: { id: true, fullName: true, createdAt: true, department: { select: { name: true } } },
    });
    return users
      .filter(u => new Date(u.createdAt).getMonth() + 1 === month)
      .map(u => ({
        ...u,
        hireDate: u.createdAt,
        years: now.getFullYear() - new Date(u.createdAt).getFullYear(),
      }))
      .filter(u => u.years > 0)
      .sort((a, b) => b.years - a.years);
  }

  async getHeadcountTrend(months = 6) {
    const trend = [];
    for (let i = months - 1; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      // createdAt used as proxy for hireDate
      const count = await this.prisma.user.count({
        where: { createdAt: { lte: endOfMonth }, active: true },
      });
      const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      trend.push({ month: label, count });
    }
    return trend;
  }

  async getDashboardSummary() {
    return this.getFullRhDashboard();
  }
}