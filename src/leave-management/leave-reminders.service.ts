// ─── src/leave-management/leave-reminders.service.ts ─────────────────────────
// Prazos e escalonamento das aprovações (docs/Modulo_Leave.md §10/§11): todos
// os dias lembra os aprovadores com decisões em atraso e, se as Configurações
// definirem um limite, escala a etapa para o RH — uma única vez por etapa.
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { LeaveSettingsService } from './leave-settings.service';

const DAY_MS = 86_400_000;

@Injectable()
export class LeaveRemindersService {
  private readonly logger = new Logger(LeaveRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: LeaveSettingsService,
  ) {}

  @Cron('0 8 * * *')
  async runDaily(): Promise<void> {
    try {
      const r = await this.remindOverdueApprovals();
      this.logger.log({ action: 'LEAVE_APPROVAL_REMINDERS', ...r });
    } catch (e) {
      this.logger.error({
        action: 'LEAVE_APPROVAL_REMINDERS',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao processar lembretes de aprovações em atraso',
      });
    }
  }

  async remindOverdueApprovals(now = new Date()): Promise<{ reminded: number; escalated: number }> {
    const cfg = await this.settings.current();
    const overdue = await this.prisma.leaveApproval.findMany({
      where: {
        decidedAt: null,
        dueAt: { lt: now },
        request: { status: 'PENDING' },
        reassignments: { none: { kind: 'ESCALATE' } },
      },
      select: {
        id: true,
        requestId: true,
        approverId: true,
        level: true,
        dueAt: true,
        request: { select: { userId: true, requestNumber: true } },
      },
      orderBy: { dueAt: 'asc' },
      take: 500,
    });

    let reminded = 0;
    let escalated = 0;
    for (const a of overdue) {
      // Só etapas accionáveis (a anterior já decidiu).
      const earlier = await this.prisma.leaveApproval.count({
        where: { requestId: a.requestId, level: { lt: a.level }, decidedAt: null },
      });
      if (earlier > 0 || !a.dueAt) continue;

      const lateDays = Math.floor((now.getTime() - a.dueAt.getTime()) / DAY_MS);
      const label = a.request.requestNumber ?? `#${a.requestId}`;

      if (cfg.escalationAfterDays && lateDays >= cfg.escalationAfterDays) {
        const hr = await this.prisma.read.user.findFirst({
          where: {
            role: { code: 'RH' },
            id: { notIn: [a.request.userId, a.approverId] },
          },
          select: { id: true },
        });
        if (hr) {
          await this.prisma.$transaction([
            this.prisma.leaveApprovalReassignment.create({
              data: {
                approvalId: a.id,
                fromApproverId: a.approverId,
                toApproverId: hr.id,
                byUserId: a.approverId,
                kind: 'ESCALATE',
                reason: `Sem decisão há ${lateDays} dia(s) após o prazo`,
              },
            }),
            this.prisma.leaveApproval.update({ where: { id: a.id }, data: { approverId: hr.id } }),
          ]);
          await createNotificationSafe(this.prisma, this.logger, {
            userId: hr.id,
            type: 'LEAVE_APPROVAL_ESCALATED',
            message: `Pedido ${label} escalado para si: sem decisão há ${lateDays} dia(s)`,
          });
          await createNotificationSafe(this.prisma, this.logger, {
            userId: a.approverId,
            type: 'LEAVE_APPROVAL_ESCALATED',
            message: `O pedido ${label} foi escalado para o RH por falta de decisão`,
          });
          await this.audit.log({
            action: 'LEAVE_APPROVAL_ESCALATED',
            entityType: 'LeaveApproval',
            entityId: a.id,
            userId: a.approverId,
            metadata: { requestId: a.requestId, lateDays, toApproverId: hr.id },
          });
          escalated++;
          continue;
        }
      }

      await createNotificationSafe(this.prisma, this.logger, {
        userId: a.approverId,
        type: 'LEAVE_APPROVAL_OVERDUE',
        message: `O pedido ${label} aguarda a sua decisão há ${lateDays} dia(s) além do prazo`,
      });
      reminded++;
    }
    return { reminded, escalated };
  }
}
