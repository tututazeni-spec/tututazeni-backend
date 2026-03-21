import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RoiImpactService {
  constructor(private prisma: PrismaService) {}

  registerMetric(data: any) {
    return this.prisma.operationalMetric.create({ data });
  }

  getUnitMetrics(unitId: number) {
    return this.prisma.operationalMetric.findMany({
      where: { unitId },
    });
  }
}
