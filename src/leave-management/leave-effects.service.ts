// ─── src/leave-management/leave-effects.service.ts ───────────────────────────
// Integrações do módulo Leave com o resto da INNOVA (docs/Modulo_Leave.md §11):
// Attendance (sem duplicar registos), Automation (eventos), RH (notificações)
// e Payroll (só dados validados — nunca calcula descontos).
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AttendanceContext, AttendanceStatus, CheckInMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { AutomationService } from '../automation/automation.service';
import { TriggerType } from '../automation/automation.dto';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { holidayName, isWorkWeekday } from './leave-calendar.helper';
import { LeaveSettingsService } from './leave-settings.service';

const HALF_DAY = 12 * 3_600_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

type RequestRef = Pick<
  Prisma.LeaveRequestGetPayload<object>,
  'id' | 'userId' | 'leaveTypeCode' | 'startDate' | 'endDate' | 'workDays'
>;

/** Dias úteis (semana de trabalho − feriados) de um pedido, como chaves YYYY-MM-DD (UTC). */
export function leaveWorkingDays(start: Date, end: Date, location?: string | null): Date[] {
  const out: Date[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  while (cur.getTime() <= last) {
    // isWorkWeekday/holidayName leem o dia local — passamos um Date com o mesmo dia civil.
    const local = new Date(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate());
    if (isWorkWeekday(local) && !holidayName(local, location)) out.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

@Injectable()
export class LeaveEffectsService {
  private readonly logger = new Logger(LeaveEffectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly automation: AutomationService,
    private readonly settings: LeaveSettingsService,
  ) {}

  // ── Attendance ────────────────────────────────────────────────────

  /**
   * Marca ON_LEAVE em cada dia útil do pedido aprovado. Se já existe um registo
   * de assiduidade desse dia (o colaborador marcou presença, ou a ausência
   * foi sincronizada) NÃO cria outro: a chave (userId, date, context) é única
   * e as datas de AttendanceRecord podem estar à meia-noite local ou UTC.
   */
  async syncAttendanceOnApproval(request: RequestRef): Promise<{ created: number }> {
    const cfg = await this.settings.current();
    if (!cfg.syncAttendance) return { created: 0 };
    try {
      const user = await this.prisma.read.user.findUnique({
        where: { id: request.userId },
        select: { workLocation: true },
      });
      const days = leaveWorkingDays(request.startDate, request.endDate, user?.workLocation);
      if (days.length === 0) return { created: 0 };

      const existing = await this.prisma.attendanceRecord.findMany({
        where: {
          userId: request.userId,
          context: AttendanceContext.WORK,
          date: {
            gte: new Date(days[0].getTime() - HALF_DAY),
            lte: new Date(days[days.length - 1].getTime() + HALF_DAY * 3),
          },
        },
        select: { date: true },
      });
      const taken = new Set(existing.map(e => dayKey(new Date(e.date.getTime() + HALF_DAY))));
      const missing = days.filter(d => !taken.has(dayKey(d)));
      if (missing.length === 0) return { created: 0 };

      const res = await this.prisma.attendanceRecord.createMany({
        data: missing.map(d => ({
          userId: request.userId,
          date: d,
          status: AttendanceStatus.ON_LEAVE,
          context: AttendanceContext.WORK,
          method: CheckInMethod.MANUAL,
          workMinutes: 0,
          hoursWorked: 0,
          notes: `Licença aprovada (${request.leaveTypeCode})`,
          leaveRequestId: request.id,
        })),
        skipDuplicates: true,
      });
      return { created: res.count };
    } catch (e) {
      this.logger.warn({
        requestId: request.id,
        action: 'LEAVE_ATTENDANCE_SYNC',
        err: { message: errMsg(e) },
        msg: 'Falha ao sincronizar a licença aprovada com a assiduidade',
      });
      return { created: 0 };
    }
  }

  /** Remove só os registos ON_LEAVE criados por este pedido (nunca presenças reais). */
  async removeAttendanceOnCancel(requestId: number): Promise<{ removed: number }> {
    try {
      const res = await this.prisma.attendanceRecord.deleteMany({
        where: { leaveRequestId: requestId, status: AttendanceStatus.ON_LEAVE },
      });
      return { removed: res.count };
    } catch (e) {
      this.logger.warn({
        requestId,
        action: 'LEAVE_ATTENDANCE_UNSYNC',
        err: { message: errMsg(e) },
        msg: 'Falha ao remover registos de assiduidade de uma licença cancelada',
      });
      return { removed: 0 };
    }
  }

  // ── Automation / RH ───────────────────────────────────────────────

  async emitApproved(request: RequestRef & { requestNumber?: string | null }): Promise<void> {
    await this.automation
      .triggerEvent({
        event: TriggerType.LEAVE_APPROVED,
        userId: request.userId,
        module: 'LEAVE',
        recordType: 'LeaveRequest',
        recordId: String(request.id),
        eventId: `leave.approved:${request.id}`,
        payload: {
          requestId: request.id,
          requestNumber: request.requestNumber ?? null,
          leaveTypeCode: request.leaveTypeCode,
          startDate: request.startDate.toISOString(),
          endDate: request.endDate.toISOString(),
          workDays: request.workDays,
        },
      })
      .catch((e: unknown) =>
        this.logger.warn({
          requestId: request.id,
          action: 'LEAVE_AUTOMATION_EVENT',
          err: { message: errMsg(e) },
          msg: 'Falha ao emitir leave.approved para Automations',
        }),
      );

    const cfg = await this.settings.current();
    if (!cfg.notifyHrOnApproval) return;
    const hr = await this.prisma.read.user.findMany({
      where: { role: { code: 'RH' }, id: { not: request.userId } },
      select: { id: true },
      take: 50,
    });
    for (const u of hr) {
      await createNotificationSafe(this.prisma, this.logger, {
        userId: u.id,
        type: 'LEAVE_APPROVED_HR',
        message: `Licença aprovada (${request.requestNumber ?? `#${request.id}`}) — ${request.workDays} dia(s)`,
      });
    }
  }

  // ── Payroll (só dados validados) ──────────────────────────────────

  /**
   * Ausências validadas do mês para análise do processamento salarial.
   * Não calcula descontos nem direitos; não expõe motivos nem tipos
   * sensíveis (saúde) — só a categoria genérica e as quantidades.
   */
  async payrollFeed(period: string, actorId: number) {
    const cfg = await this.settings.current();
    if (!cfg.payrollFeedEnabled) {
      throw new ForbiddenException('A integração com o processamento salarial está desactivada');
    }
    const [y, m] = period.split('-').map(Number);
    const monthStart = new Date(Date.UTC(y, m - 1, 1));
    const monthEnd = new Date(Date.UTC(y, m, 0));

    const [leaves, absences, types] = await Promise.all([
      this.prisma.read.leaveRequest.findMany({
        where: { status: 'APPROVED', startDate: { lte: monthEnd }, endDate: { gte: monthStart } },
        select: {
          id: true,
          requestNumber: true,
          userId: true,
          leaveTypeCode: true,
          startDate: true,
          endDate: true,
          user: { select: { fullName: true, employeeNumber: true, workLocation: true } },
        },
        orderBy: [{ userId: 'asc' }, { startDate: 'asc' }],
      }),
      this.prisma.read.absenceRecord.findMany({
        where: {
          date: { gte: monthStart, lte: monthEnd },
          justificationStatus: { in: ['VALIDATED', 'REJECTED'] },
        },
        select: {
          id: true,
          userId: true,
          date: true,
          durationDays: true,
          durationHours: true,
          occurrenceType: true,
          justificationStatus: true,
          user: { select: { fullName: true, employeeNumber: true } },
        },
        orderBy: [{ userId: 'asc' }, { date: 'asc' }],
      }),
      this.prisma.read.leaveTypeConfig.findMany({
        select: { code: true, name: true, isPaid: true, isSensitive: true, requiresPayrollValidation: true },
      }),
    ]);
    const typeOf = new Map(types.map(t => [t.code, t]));

    const leaveRows = leaves.map(l => {
      const t = typeOf.get(l.leaveTypeCode);
      const from = l.startDate > monthStart ? l.startDate : monthStart;
      const to = l.endDate < monthEnd ? l.endDate : monthEnd;
      return {
        source: 'LEAVE' as const,
        requestId: l.id,
        requestNumber: l.requestNumber,
        userId: l.userId,
        employeeNumber: l.user.employeeNumber ?? null,
        fullName: l.user.fullName,
        typeCode: t?.isSensitive ? 'SENSITIVE' : l.leaveTypeCode,
        typeName: t?.isSensitive ? 'Licença (dados reservados)' : (t?.name ?? l.leaveTypeCode),
        isPaid: t?.isPaid ?? true,
        requiresPayrollValidation: t?.requiresPayrollValidation ?? false,
        from: dayKey(from),
        to: dayKey(to),
        workDaysInPeriod: leaveWorkingDays(from, to, l.user.workLocation).length,
      };
    });
    const absenceRows = absences.map(a => ({
      source: 'ABSENCE' as const,
      absenceId: a.id,
      userId: a.userId,
      employeeNumber: a.user.employeeNumber ?? null,
      fullName: a.user.fullName,
      date: dayKey(a.date),
      justified: a.justificationStatus === 'VALIDATED',
      // Saúde é dado sensível: sai genérico.
      occurrence: a.occurrenceType === 'HEALTH_ABSENCE' ? 'ABSENCE' : a.occurrenceType,
      durationDays: a.durationDays,
      durationHours: a.durationHours,
    }));

    await this.audit.log({
      action: 'LEAVE_PAYROLL_FEED_READ',
      entityType: 'LeaveRequest',
      entityId: 0,
      userId: actorId,
      metadata: { period, leaves: leaveRows.length, absences: absenceRows.length },
    });
    return { period, generatedAt: new Date().toISOString(), leaves: leaveRows, absences: absenceRows };
  }
}
