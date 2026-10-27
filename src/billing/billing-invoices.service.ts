import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import { swallow } from '../common/logging/swallow';
import { BillingLimitsService } from './billing-limits.service';
import { BillingNotifierService } from './billing-notifier.service';
import { computeTax, invoiceHash, invoiceSeries, vatRate } from './billing.math';
import { FiscalUpdateDto, PaymentFailedDto, RegisterPaymentDto } from './billing.dto';

const ADVISORY_LOCK_KEY = 727001; // serializa a emissão: numeração sem buracos e cadeia de hash íntegra

@Injectable()
export class BillingInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: BillingLimitsService,
    @Optional() private readonly notifier?: BillingNotifierService,
  ) {}

  private audit(action: string, entityId: string, actorId: number | undefined, extra: object) {
    return writeChainedAuditLog(this.prisma, {
      userId: actorId,
      action,
      entity: 'BillingInvoice',
      // AuditLog.entityId é inteiro; os ids de faturação são cuid, vão em metadata.
      metadata: JSON.stringify({ id: entityId, ...extra }),
      severity: 'HIGH',
    }).catch(swallow('billing-invoices.service', 'falha ao gravar auditoria', undefined, 'error'));
  }

  /** Emite uma fatura com numeração sequencial por série anual e hash encadeado. */
  async issue(p: {
    subscriptionId: string;
    periodStart: Date;
    periodEnd: Date;
    dueDate: Date;
    description?: string;
    actorId?: number;
  }) {
    const sub = await this.prisma.billingSubscription.findUniqueOrThrow({
      where: { id: p.subscriptionId },
      include: { plan: true, tenant: true },
    });
    const issueDate = new Date();
    const series = invoiceSeries(issueDate);
    const rate = vatRate();
    const { subtotal, taxAmount, total } = computeTax(Number(sub.priceAmount), rate);

    const invoice = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`;
      const seq = await tx.billingInvoiceSequence.upsert({
        where: { series },
        update: { last: { increment: 1 } },
        create: { series, last: 1 },
      });
      const previous = await tx.billingInvoice.findFirst({ orderBy: { createdAt: 'desc' } });
      const createdAt = new Date();
      const fullNumber = `${series}/${seq.last}`;
      return tx.billingInvoice.create({
        data: {
          subscriptionId: sub.id,
          series,
          number: seq.last,
          fullNumber,
          issueDate,
          dueDate: p.dueDate,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          currency: sub.currency,
          subtotal,
          taxRate: rate,
          taxAmount,
          total,
          customerName: sub.tenant.tenantName,
          customerNif: sub.tenant.nif,
          customerAddress: sub.tenant.address,
          customerCountry: sub.tenant.country,
          description:
            p.description ??
            `Subscrição ${sub.plan.name} (${sub.interval === 'YEARLY' ? 'anual' : 'mensal'}) ${p.periodStart.toISOString().slice(0, 10)} a ${p.periodEnd.toISOString().slice(0, 10)}`,
          previousHash: previous?.hash ?? null,
          hash: invoiceHash({
            issueDate,
            createdAt,
            fullNumber,
            total,
            previousHash: previous?.hash ?? null,
          }),
          createdAt,
        },
      });
    });
    await this.audit('BILLING_INVOICE_ISSUED', invoice.id, p.actorId, {
      fullNumber: invoice.fullNumber,
      total,
    });
    await this.notifier?.notify(`Fatura ${invoice.fullNumber} emitida`, [
      `A fatura ${invoice.fullNumber} (${invoice.total} ${invoice.currency}) foi emitida e vence em ${invoice.dueDate.toISOString().slice(0, 10)}.`,
      `Período: ${p.periodStart.toISOString().slice(0, 10)} a ${p.periodEnd.toISOString().slice(0, 10)}.`,
    ]);
    return invoice;
  }

  list(filter: { status?: string; subscriptionId?: string; take?: number } = {}) {
    return this.prisma.billingInvoice.findMany({
      where: {
        ...(filter.status
          ? { status: filter.status as Prisma.BillingInvoiceWhereInput['status'] }
          : {}),
        ...(filter.subscriptionId ? { subscriptionId: filter.subscriptionId } : {}),
      },
      orderBy: { issueDate: 'desc' },
      take: Math.min(filter.take ?? 50, 200),
    });
  }

  async get(id: string) {
    const inv = await this.prisma.billingInvoice.findUnique({
      where: { id },
      include: { payments: { orderBy: { createdAt: 'asc' } } },
    });
    if (!inv) throw new NotFoundException('Fatura não encontrada');
    return inv;
  }

  /** Pagamento confirmado (transferência/referência verificada pelo financeiro). */
  async registerPayment(id: string, dto: RegisterPaymentDto, actorId?: number) {
    const inv = await this.get(id);
    if (inv.status === 'VOID') throw new ConflictException('Fatura anulada não aceita pagamentos');
    if (inv.status === 'PAID') throw new ConflictException('Fatura já paga');

    const now = new Date();
    const paidBefore = inv.payments
      .filter(x => x.status === 'CONFIRMED')
      .reduce((a, x) => a + Number(x.amount), 0);
    const fullyPaid = paidBefore + dto.amount >= Number(inv.total) - 0.005;

    await this.prisma.$transaction(async tx => {
      await tx.billingPayment.create({
        data: {
          invoiceId: id,
          amount: dto.amount,
          method: dto.method,
          reference: dto.reference,
          status: 'CONFIRMED',
          confirmedAt: now,
        },
      });
      if (!fullyPaid) return;
      await tx.billingInvoice.update({ where: { id }, data: { status: 'PAID', paidAt: now } });
      const sub = await tx.billingSubscription.findUniqueOrThrow({
        where: { id: inv.subscriptionId },
      });
      // Só avança o período se a fatura é do período corrente ou posterior (não de um período já fechado).
      const advances = inv.periodEnd > sub.currentPeriodEnd || sub.status !== 'ACTIVE';
      await tx.billingSubscription.update({
        where: { id: sub.id },
        data: {
          status: 'ACTIVE',
          convertedAt: sub.convertedAt ?? now,
          ...(advances
            ? { currentPeriodStart: inv.periodStart, currentPeriodEnd: inv.periodEnd }
            : {}),
        },
      });
    });
    this.limits.invalidate();
    await this.audit('BILLING_PAYMENT_CONFIRMED', id, actorId, { amount: dto.amount, fullyPaid });
    await this.notifier?.notify(
      fullyPaid
        ? `Pagamento da fatura ${inv.fullNumber} confirmado`
        : `Pagamento parcial da fatura ${inv.fullNumber}`,
      [
        `Recebemos ${dto.amount} ${inv.currency} referentes à fatura ${inv.fullNumber}.`,
        fullyPaid
          ? 'A fatura está liquidada e a subscrição segue activa. Obrigado.'
          : 'Ainda falta liquidar o restante valor da fatura.',
      ],
    );
    return this.get(id);
  }

  /** Cobrança falhada (referência expirada, gateway, transferência recusada): entra em dunning. */
  async recordFailedPayment(id: string, dto: PaymentFailedDto, actorId?: number) {
    const inv = await this.get(id);
    if (inv.status === 'PAID' || inv.status === 'VOID') {
      throw new ConflictException('Só faturas em aberto podem ter cobrança falhada');
    }
    await this.prisma.$transaction([
      this.prisma.billingPayment.create({
        data: {
          invoiceId: id,
          amount: dto.amount ?? inv.total,
          method: 'GATEWAY',
          reference: dto.reference,
          status: 'FAILED',
          failureReason: dto.reason,
        },
      }),
      this.prisma.billingSubscription.updateMany({
        where: { id: inv.subscriptionId, status: 'ACTIVE' },
        data: { status: 'PAST_DUE' },
      }),
    ]);
    this.limits.invalidate();
    await this.audit('BILLING_PAYMENT_FAILED', id, actorId, { reason: dto.reason });
    await this.notifier?.notify(`Falha na cobrança da fatura ${inv.fullNumber}`, [
      `Não foi possível cobrar a fatura ${inv.fullNumber} (${inv.total} ${inv.currency}).`,
      ...(dto.reason ? [`Motivo: ${dto.reason}`] : []),
      'Regularize o pagamento para evitar a passagem da plataforma a modo só de leitura.',
    ]);
    return this.get(id);
  }

  /** Anulação só antes de qualquer pagamento e de submissão fiscal; depois exige nota de crédito (software certificado). */
  async voidInvoice(id: string, reason: string, actorId?: number) {
    const inv = await this.get(id);
    if (inv.status === 'PAID' || inv.payments.some(p => p.status === 'CONFIRMED')) {
      throw new ConflictException(
        'Fatura com pagamento: emitir nota de crédito no software fiscal',
      );
    }
    if (inv.fiscalStatus !== 'NOT_SUBMITTED') {
      throw new ConflictException(
        'Fatura já submetida à AGT: emitir nota de crédito no software fiscal',
      );
    }
    if (inv.status === 'VOID') throw new ConflictException('Fatura já anulada');
    await this.prisma.billingInvoice.update({
      where: { id },
      data: { status: 'VOID', voidedAt: new Date(), voidReason: reason },
    });
    await this.audit('BILLING_INVOICE_VOIDED', id, actorId, { reason });
    return this.get(id);
  }

  /** Regista a certificação feita no software certificado AGT (a plataforma não assina fiscalmente). */
  async setFiscal(id: string, dto: FiscalUpdateDto, actorId?: number) {
    await this.get(id);
    if (!dto.fiscalRef.trim()) throw new BadRequestException('Referência fiscal obrigatória');
    await this.prisma.billingInvoice.update({
      where: { id },
      data: { fiscalStatus: dto.status, fiscalRef: dto.fiscalRef },
    });
    await this.audit('BILLING_INVOICE_FISCAL', id, actorId, dto);
    return this.get(id);
  }

  /** Verifica a cadeia de hash; devolve a primeira fatura quebrada, se existir. */
  async verifyChain() {
    const all = await this.prisma.billingInvoice.findMany({ orderBy: { createdAt: 'asc' } });
    let prev: string | null = null;
    for (const inv of all) {
      const expected = invoiceHash({
        issueDate: inv.issueDate,
        createdAt: inv.createdAt,
        fullNumber: inv.fullNumber,
        total: Number(inv.total),
        previousHash: prev,
      });
      if (inv.previousHash !== prev || inv.hash !== expected) {
        return { valid: false, checked: all.length, brokenAt: inv.fullNumber };
      }
      prev = inv.hash;
    }
    return { valid: true, checked: all.length, brokenAt: null };
  }
}
