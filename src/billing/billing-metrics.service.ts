import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AcquisitionSpendDto } from './billing.dto';
import { computeCollections, computeMetrics, Interval, SubSnapshot } from './billing.math';

@Injectable()
export class BillingMetricsService {
  private readonly log = new Logger(BillingMetricsService.name);
  constructor(private readonly prisma: PrismaService) {}

  async summary(days = 30) {
    const end = new Date();
    const start = new Date(end.getTime() - days * 864e5);
    const [subs, invoices] = await Promise.all([
      this.prisma.billingSubscription.findMany(),
      this.prisma.billingInvoice.findMany({
        select: { status: true, total: true, issueDate: true, dueDate: true, paidAt: true },
      }),
    ]);
    const snapshots: SubSnapshot[] = subs.map(s => ({
      status: s.status,
      interval: s.interval as Interval,
      price: Number(s.priceAmount),
      createdAt: s.createdAt,
      canceledAt: s.canceledAt,
      convertedAt: s.convertedAt,
      hadTrial: !!s.trialEndsAt,
    }));

    // Gasto de aquisição dos meses que tocam a janela (aproximação mensal).
    const months = new Set<string>();
    for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 864e5)) {
      months.add(d.toISOString().slice(0, 7));
    }
    const spend = await this.prisma.acquisitionSpend.aggregate({
      where: { month: { in: [...months] } },
      _sum: { amount: true },
    });
    const metrics = computeMetrics(snapshots, start, end, Number(spend._sum.amount ?? 0));
    const collections = computeCollections(
      invoices.map(i => ({ ...i, total: Number(i.total) })),
      start,
      end,
    );

    const [revenue, outstanding] = await Promise.all([
      this.prisma.billingInvoice.aggregate({
        where: { status: 'PAID', paidAt: { gte: start, lte: end } },
        _sum: { total: true },
      }),
      this.prisma.billingInvoice.aggregate({
        where: { status: { in: ['ISSUED', 'OVERDUE'] } },
        _sum: { total: true },
      }),
    ]);
    return {
      windowDays: days,
      ...metrics,
      collections,
      revenueCollected: Number(revenue._sum.total ?? 0),
      outstanding: Number(outstanding._sum.total ?? 0),
      currency: 'AOA',
    };
  }

  /** Série mensal (MRR, clientes, receita…) gravada pelo cron diário. */
  history(months = 12) {
    return this.prisma.billingMetricSnapshot.findMany({
      orderBy: { month: 'desc' },
      take: Math.min(Math.max(months, 1), 60),
    });
  }

  /**
   * Foto diária do mês corrente (upsert): o último dia de cada mês fica como valor final.
   * Sem isto não há histórico de MRR — as subscrições só guardam o estado actual.
   */
  @Cron('30 6 * * *')
  async snapshotCurrentMonth() {
    try {
      const s = await this.summary(30);
      const month = new Date().toISOString().slice(0, 7);
      const data = {
        mrr: s.mrr,
        arr: s.arr,
        payingCustomers: s.payingCustomers,
        trialing: s.trialing,
        newCustomers: s.newCustomers,
        churnRatePct: s.churnRatePct,
        revenueCollected: s.revenueCollected,
        outstanding: s.outstanding,
      };
      await this.prisma.billingMetricSnapshot.upsert({
        where: { month },
        update: data,
        create: { month, ...data },
      });
    } catch (e) {
      this.log.error(`Falha a gravar snapshot de métricas: ${(e as Error).message}`);
    }
  }

  addSpend(dto: AcquisitionSpendDto) {
    return this.prisma.acquisitionSpend.create({ data: dto });
  }

  listSpend() {
    return this.prisma.acquisitionSpend.findMany({ orderBy: { month: 'desc' }, take: 120 });
  }
}
