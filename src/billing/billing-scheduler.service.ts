import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import { swallow } from '../common/logging/swallow';
import { BillingInvoicesService } from './billing-invoices.service';
import { BillingLimitsService } from './billing-limits.service';
import { addInterval } from './billing.math';

const DAY = 864e5;
const RENEWAL_LEAD_DAYS = 7; // fatura de renovação emitida 7 dias antes do fim do período
const GRACE_DAYS = Number(process.env.BILLING_GRACE_DAYS) || 14; // dias em atraso até modo só de leitura
const REMINDER_AFTER_OVERDUE_DAYS = [1, 7, 12]; // lembretes de cobrança (dunning)

@Injectable()
export class BillingSchedulerService {
  private readonly log = new Logger(BillingSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: BillingInvoicesService,
    private readonly limits: BillingLimitsService,
    private readonly mail: MailService,
  ) {}

  // Corre uma vez por dia; o lock de cluster dos @Cron evita duplicados com várias réplicas.
  @Cron('0 6 * * *')
  async daily() {
    const steps: Array<[string, () => Promise<number>]> = [
      ['renovações', () => this.issueRenewals()],
      ['fim de teste', () => this.expireTrials()],
      ['atrasos', () => this.markOverdueAndDun()],
      ['cancelamentos', () => this.finishCancellations()],
    ];
    for (const [name, fn] of steps) {
      try {
        const n = await fn();
        if (n) this.log.log(`${name}: ${n}`);
      } catch (e) {
        this.log.error(`Falha em ${name}: ${(e as Error).message}`);
      }
    }
    this.limits.invalidate();
  }

  private async notify(subject: string, text: string) {
    const t = await this.prisma.tenantConfig.findFirst({ select: { contactEmail: true } });
    if (!t?.contactEmail) return;
    await this.mail
      .sendNotification(t.contactEmail, subject, text)
      .catch(swallow('billing-scheduler', 'falha a enviar e-mail de faturação', undefined, 'warn'));
  }

  private audit(action: string, entityId: string, extra: object) {
    return writeChainedAuditLog(this.prisma, {
      action,
      entity: 'BillingSubscription',
      // AuditLog.entityId é inteiro; os ids de faturação são cuid, vão em metadata.
      metadata: JSON.stringify({ id: entityId, ...extra }),
      severity: 'MEDIUM',
    }).catch(swallow('billing-scheduler', 'falha ao gravar auditoria', undefined, 'error'));
  }

  /** Emite a fatura do próximo período das subscrições activas perto do fim. */
  async issueRenewals(now = new Date()) {
    const subs = await this.prisma.billingSubscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'PAST_DUE'] },
        cancelAtPeriodEnd: false,
        currentPeriodEnd: { lte: new Date(now.getTime() + RENEWAL_LEAD_DAYS * DAY) },
      },
    });
    let issued = 0;
    for (const s of subs) {
      const already = await this.prisma.billingInvoice.findFirst({
        where: { subscriptionId: s.id, periodStart: s.currentPeriodEnd, status: { not: 'VOID' } },
      });
      if (already) continue;
      const inv = await this.invoices.issue({
        subscriptionId: s.id,
        periodStart: s.currentPeriodEnd,
        periodEnd: addInterval(s.currentPeriodEnd, s.interval),
        dueDate: s.currentPeriodEnd,
      });
      issued++;
      await this.notify(
        `Fatura ${inv.fullNumber} emitida`,
        `A fatura ${inv.fullNumber} (${inv.total} ${inv.currency}) da renovação da subscrição vence em ${inv.dueDate.toISOString().slice(0, 10)}.`,
      );
    }
    return issued;
  }

  /** Teste terminado sem contratação → expira (modo só de leitura); aviso 3 dias antes. */
  async expireTrials(now = new Date()) {
    const trials = await this.prisma.billingSubscription.findMany({
      where: { status: 'TRIALING', trialEndsAt: { not: null } },
    });
    let expired = 0;
    for (const s of trials) {
      const left = Math.ceil((s.trialEndsAt!.getTime() - now.getTime()) / DAY);
      if (left === 3) {
        await this.notify(
          'O período de teste termina em 3 dias',
          'Contrate um plano para manter o acesso total à plataforma.',
        );
      }
      if (s.trialEndsAt! <= now) {
        const unpaid = await this.prisma.billingInvoice.count({
          where: { subscriptionId: s.id, status: { in: ['ISSUED', 'OVERDUE'] } },
        });
        // Com fatura em aberto, a decisão passa para o dunning (prazo de graça).
        if (unpaid === 0) {
          await this.prisma.billingSubscription.update({
            where: { id: s.id },
            data: { status: 'EXPIRED' },
          });
          await this.audit('BILLING_TRIAL_EXPIRED', s.id, {});
          expired++;
        }
      }
    }
    return expired;
  }

  /** Faturas vencidas → OVERDUE, subscrição PAST_DUE, lembretes e, passada a graça, EXPIRED. */
  async markOverdueAndDun(now = new Date()) {
    const open = await this.prisma.billingInvoice.findMany({
      where: { status: { in: ['ISSUED', 'OVERDUE'] }, dueDate: { lt: now } },
    });
    for (const inv of open) {
      const daysOver = Math.floor((now.getTime() - inv.dueDate.getTime()) / DAY);
      if (inv.status === 'ISSUED') {
        await this.prisma.billingInvoice.update({
          where: { id: inv.id },
          data: { status: 'OVERDUE' },
        });
        await this.prisma.billingSubscription.updateMany({
          where: { id: inv.subscriptionId, status: 'ACTIVE' },
          data: { status: 'PAST_DUE' },
        });
      }
      const nextAt = REMINDER_AFTER_OVERDUE_DAYS[inv.reminderCount];
      if (nextAt !== undefined && daysOver >= nextAt) {
        await this.notify(
          `Fatura ${inv.fullNumber} em atraso`,
          `A fatura ${inv.fullNumber} (${inv.total} ${inv.currency}) está em atraso há ${daysOver} dia(s). Após ${GRACE_DAYS} dias a plataforma passa a modo só de leitura.`,
        );
        await this.prisma.billingInvoice.update({
          where: { id: inv.id },
          data: { reminderCount: { increment: 1 }, lastReminderAt: now },
        });
      }
      if (daysOver >= GRACE_DAYS) {
        const r = await this.prisma.billingSubscription.updateMany({
          where: {
            id: inv.subscriptionId,
            status: { in: ['PAST_DUE', 'PENDING', 'TRIALING', 'ACTIVE'] },
          },
          data: { status: 'EXPIRED', canceledAt: now },
        });
        if (r.count)
          await this.audit('BILLING_SUSPENDED_NONPAYMENT', inv.subscriptionId, {
            invoice: inv.fullNumber,
          });
      }
    }
    return open.length;
  }

  /** Cancelamento agendado para o fim do período. */
  async finishCancellations(now = new Date()) {
    const r = await this.prisma.billingSubscription.updateMany({
      where: {
        cancelAtPeriodEnd: true,
        currentPeriodEnd: { lte: now },
        status: { notIn: ['CANCELED', 'EXPIRED'] },
      },
      data: { status: 'CANCELED', canceledAt: now },
    });
    return r.count;
  }
}
