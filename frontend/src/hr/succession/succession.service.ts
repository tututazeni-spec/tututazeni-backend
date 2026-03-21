import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SuccessionService {
  constructor(private prisma: PrismaService) {}

  addCandidate(data: any) {
    return this.prisma.successionPlan.create({ data });
  }

  findByPosition(positionId: number) {
    return this.prisma.successionPlan.findMany({
      where: { positionId },
      include: { candidate: true },
    });
  }
}
