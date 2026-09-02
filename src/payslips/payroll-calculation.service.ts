// src/payslips/payroll-calculation.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollEngineService } from './payroll-engine.service';
import { money } from './money.util';

export interface PayrollInputs {
  absenceDays: number;
  overtimeHours: number;
  workingDaysInMonth: number;
}

@Injectable()
export class PayrollCalculationService {
  private readonly logger = new Logger(PayrollCalculationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: PayrollEngineService,
  ) {}

  /** Limites [início, fimExclusivo) do mês de "YYYY-MM". */
  private monthRange(period: string): { start: Date; end: Date } {
    const [y, m] = period.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    return { start, end };
  }

  workingDaysInMonth(period: string): number {
    const [y, m] = period.split('-').map(Number);
    if (!y || !m || m < 1 || m > 12) return 22;
    let count = 0;
    const d = new Date(Date.UTC(y, m - 1, 1));
    while (d.getUTCMonth() === m - 1) {
      const day = d.getUTCDay();
      if (day !== 0 && day !== 6) count++;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return count || 22;
  }

  /** Expande [startDate, endDate] em dias úteis (chaves "YYYY-MM-DD") dentro do mês. */
  private weekdayKeysInRange(start: Date, end: Date, monthStart: Date, monthEnd: Date): string[] {
    const from = start < monthStart ? monthStart : start;
    const to = end < monthEnd ? end : new Date(monthEnd.getTime() - 1);
    const keys: string[] = [];
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    while (d <= to) {
      const day = d.getUTCDay();
      if (day !== 0 && day !== 6) keys.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return keys;
  }

  async gatherInputs(userId: number, period: string): Promise<PayrollInputs> {
    const { start, end } = this.monthRange(period);
    const workingDaysInMonth = this.workingDaysInMonth(period);

    const unpaidTypes = await this.prisma.read.leaveTypeConfig.findMany({
      where: { isPaid: false },
      select: { code: true },
    });
    const unpaidCodes = unpaidTypes.map(t => t.code);

    const absentDayKeys = new Set<string>();

    if (unpaidCodes.length > 0) {
      const leaves = await this.prisma.read.leaveRequest.findMany({
        where: {
          userId,
          status: 'APPROVED',
          leaveTypeCode: { in: unpaidCodes },
          startDate: { lt: end },
          endDate: { gte: start },
        },
        select: { startDate: true, endDate: true },
      });
      for (const lv of leaves) {
        for (const k of this.weekdayKeysInRange(lv.startDate, lv.endDate, start, end)) {
          absentDayKeys.add(k);
        }
      }
    }

    const attendance = await this.prisma.read.userAttendance.findMany({
      where: { userId, status: 'ABSENT', date: { gte: start, lt: end } },
      select: { date: true },
    });
    for (const a of attendance) absentDayKeys.add(a.date.toISOString().slice(0, 10));

    const overtime = await this.prisma.read.overtimeRecord.findMany({
      where: { userId, status: { in: ['APPROVED', 'PAID'] }, date: { gte: start, lt: end } },
      select: { overtimeMinutes: true },
    });
    const overtimeHours = money(
      overtime.reduce((sum, o) => sum + (o.overtimeMinutes ?? 0), 0) / 60,
    );

    return {
      absenceDays: absentDayKeys.size,
      overtimeHours,
      workingDaysInMonth,
    };
  }
}
