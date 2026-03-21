import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PerformanceService {
  constructor(private prisma: PrismaService) {}

  create(data: any) {
    return this.prisma.performanceReview.create({ data });
  }

  findByUser(userId: number) {
    return this.prisma.performanceReview.findMany({
      where: { userId },
    });
  }
}
