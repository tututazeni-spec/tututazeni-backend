import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AcquisitionSpendDto } from './billing.dto';
import { computeMetrics, Interval, SubSnapshot } from './billing.math';

@Injectable()
export class BillingMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(days = 30) {
    const end = new Date();
    const start = new Date(end.getTime() - days * 864e5);
    const subs = await this.prisma.billingSubscription.findMany();
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
      revenueCollected: Number(revenue._sum.total ?? 0),
      outstanding: Number(outstanding._sum.total ?? 0),
      currency: 'AOA',
    };
  }

  addSpend(dto: AcquisitionSpendDto) {
    return this.prisma.acquisitionSpend.create({ data: dto });
  }

  listSpend() {
    return this.prisma.acquisitionSpend.findMany({ orderBy: { month: 'desc' }, take: 120 });
  }
}
