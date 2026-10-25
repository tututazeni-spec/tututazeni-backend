// ============================================================
// INNOVA PLATFORM — AUTOMAÇÃO — REGRAS BUILT-IN
// Executores das regras embutidas (aniversários, lembretes de licença/matrícula,
// recibos por emitir). Colaborador interno do AutomationService: recebe o mesmo
// prisma e logger — não é um provider Nest.
// ============================================================

import { EnrollmentStatus } from '@prisma/client';
import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

export class AutomationBuiltInRules {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  async processBirthdays(): Promise<Record<string, unknown>> {
    // dateOfBirth not in base schema — if added, filter here
    this.logger.warn(
      'processBirthdays: campo dateOfBirth não existe no modelo User — adiciona ao schema para activar',
    );
    return { birthdaysNotified: 0, message: 'Requer campo dateOfBirth no modelo User' };
  }

  async sendLeaveReminders(): Promise<Record<string, unknown>> {
    // Aprovações de licenças pendentes há 3+ dias (LeaveApproval é a fonte real;
    // a leitura anterior de HistoryRecord 'LEAVE_REQUEST' nunca encontrava nada).
    const cutoff = new Date(Date.now() - 3 * 86400000);
    const stale = await this.prisma.read.leaveApproval
      .findMany({
        where: { decidedAt: null, createdAt: { lte: cutoff }, request: { status: 'PENDING' } },
        select: { approverId: true, requestId: true },
        take: 500,
      })
      .catch(e => {
        this.logger.warn({
          action: 'SEND_LEAVE_REMINDERS_COUNT',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao contar pedidos de ausência pendentes',
        });
        return [] as Array<{ approverId: number; requestId: number }>;
      });

    const perApprover = new Map<number, number>();
    for (const a of stale) perApprover.set(a.approverId, (perApprover.get(a.approverId) ?? 0) + 1);
    let notified = 0;
    for (const [userId, n] of perApprover) {
      const ok = await this.prisma.notificationLog
        .create({
          data: {
            userId,
            type: 'LEAVE_PENDING_REMINDER',
            message: `Tem ${n} pedido(s) de licença à espera de decisão há mais de 3 dias`,
            metadata: JSON.stringify({ pending: n }),
          },
        })
        .then(() => true)
        .catch(() => false);
      if (ok) notified++;
    }
    return {
      pending: stale.length,
      notified,
      message: `${stale.length} pedido(s) de ausência pendentes há 3+ dias`,
    };
  }

  async sendEnrollmentReminders(): Promise<Record<string, unknown>> {
    const cutoff = new Date(Date.now() - 14 * 86400000);
    const enrollments = await this.prisma.read.enrollment.findMany({
      where: { status: EnrollmentStatus.IN_PROGRESS, enrolledAt: { lte: cutoff } },
      include: {
        user: { select: { id: true, fullName: true } },
        course: { select: { title: true } },
      },
      take: 100,
    });

    let notified = 0;
    for (const e of enrollments) {
      await this.prisma.notificationLog
        .create({
          data: {
            userId: e.userId,
            type: 'ENROLLMENT_REMINDER',
            message: `O curso "${e.course.title}" está pendente há mais de 14 dias`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(err => {
          this.logger.warn({
            userId: e.userId,
            enrollmentId: e.id,
            action: 'SEND_ENROLLMENT_REMINDER',
            err: { message: err instanceof Error ? err.message : String(err) },
            msg: 'Falha ao notificar lembrete de curso pendente',
          });
        });
      notified++;
    }
    return { notified };
  }

  async checkPayslipDue(): Promise<Record<string, unknown>> {
    const today = new Date();
    if (today.getDate() !== 25) return { message: 'Não é dia 25 — verificação ignorada' };
    const period = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const drafted = await this.prisma.payslip
      .count({ where: { period, status: 'DRAFT' } })
      .catch(e => {
        this.logger.warn({
          period,
          action: 'CHECK_PAYSLIP_DUE_COUNT',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao contar recibos de vencimento pendentes',
        });
        return 0;
      });
    if (drafted > 0) {
      const hrUsers = await this.prisma.read.user.findMany({
        where: { role: { code: 'RH' } },
        select: { id: true },
        take: 10,
      });
      for (const u of hrUsers) {
        await this.prisma.notificationLog
          .create({
            data: {
              userId: u.id,
              type: 'PAYSLIP_REMINDER',
              message: `${drafted} recibo(s) por emitir para o período ${period}`,
              metadata: JSON.stringify({}),
            },
          })
          .catch(e => {
            this.logger.warn({
              userId: u.id,
              period,
              action: 'NOTIFY_PAYSLIP_DUE',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao notificar RH sobre recibos de vencimento por emitir',
            });
          });
      }
    }
    return { period, drafted, message: `${drafted} recibos por emitir` };
  }
}
