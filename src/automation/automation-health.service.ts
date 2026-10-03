// src/automation/automation-health.service.ts
// §13 — monitorização em produção: estado do motor (execuções presas, retries
// pendentes, agendamentos em atraso, dead letters abertas, taxa de falha recente).
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AutomationHealthStatus = 'OK' | 'DEGRADED' | 'DOWN';

const STUCK_RUNNING_MINUTES = 30;
const OVERDUE_SCHEDULE_MINUTES = 5;
const FAILURE_RATE_DEGRADED = 0.2;
const WINDOW_HOURS = 24;

@Injectable()
export class AutomationHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth() {
    const now = new Date();
    const since = new Date(now.getTime() - WINDOW_HOURS * 3_600_000);
    const stuckBefore = new Date(now.getTime() - STUCK_RUNNING_MINUTES * 60_000);
    const overdueBefore = new Date(now.getTime() - OVERDUE_SCHEDULE_MINUTES * 60_000);

    try {
      const [
        stuckRunning,
        pendingRetries,
        overdueSchedules,
        erroredSchedules,
        openDeadLetters,
        waitingApproval,
        overdueTasks,
        recentTotal,
        recentFailed,
        lastExecution,
        activeRules,
      ] = await Promise.all([
        this.prisma.automationExecution.count({
          where: { status: 'RUNNING', startedAt: { lt: stuckBefore } },
        }),
        this.prisma.automationExecution.count({
          where: { status: 'FAILED', nextRetryAt: { not: null } },
        }),
        this.prisma.automationSchedule.count({
          where: { status: 'ACTIVE', nextRunAt: { lt: overdueBefore } },
        }),
        this.prisma.automationSchedule.count({ where: { status: 'ERROR' } }),
        this.prisma.automationDeadLetter.count({ where: { status: 'OPEN' } }),
        this.prisma.automationExecution.count({ where: { status: 'WAITING_APPROVAL' } }),
        this.prisma.automationTask.count({ where: { status: 'PENDING', dueAt: { lt: now } } }),
        this.prisma.automationExecution.count({ where: { startedAt: { gte: since } } }),
        this.prisma.automationExecution.count({
          where: { startedAt: { gte: since }, status: 'FAILED' },
        }),
        this.prisma.automationExecution.findFirst({
          orderBy: { startedAt: 'desc' },
          select: { startedAt: true, status: true },
        }),
        this.prisma.automationRule.count({ where: { active: true } }),
      ]);

      const failureRate = recentTotal > 0 ? +(recentFailed / recentTotal).toFixed(3) : 0;
      const issues: string[] = [];
      if (stuckRunning > 0) issues.push(`${stuckRunning} execução(ões) presa(s) em RUNNING`);
      if (overdueSchedules > 0) issues.push(`${overdueSchedules} agendamento(s) em atraso`);
      if (erroredSchedules > 0) issues.push(`${erroredSchedules} agendamento(s) em erro`);
      if (openDeadLetters > 0) issues.push(`${openDeadLetters} dead letter(s) por tratar`);
      if (failureRate >= FAILURE_RATE_DEGRADED && recentTotal >= 5) {
        issues.push(
          `Taxa de falha de ${(failureRate * 100).toFixed(1)}% nas últimas ${WINDOW_HOURS}h`,
        );
      }

      const status: AutomationHealthStatus = issues.length ? 'DEGRADED' : 'OK';
      return {
        status,
        issues,
        checkedAt: now,
        windowHours: WINDOW_HOURS,
        database: 'UP',
        rules: { active: activeRules },
        executions: {
          last24h: recentTotal,
          failedLast24h: recentFailed,
          failureRate,
          stuckRunning,
          pendingRetries,
          waitingApproval,
          lastExecutionAt: lastExecution?.startedAt ?? null,
          lastExecutionStatus: lastExecution?.status ?? null,
        },
        schedules: { overdue: overdueSchedules, errored: erroredSchedules },
        tasks: { overdue: overdueTasks },
        deadLetters: { open: openDeadLetters },
      };
    } catch (e) {
      return {
        status: 'DOWN' as AutomationHealthStatus,
        issues: ['Base de dados indisponível ou consulta falhou'],
        checkedAt: now,
        database: 'DOWN',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
