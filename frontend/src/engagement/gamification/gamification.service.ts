import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GamificationService {
  constructor(private prisma: PrismaService) {}

  addPoints(userId: number, points: number) {
    return this.prisma.userPoints.upsert({
      where: { userId },
      update: { points: { increment: points } },
      create: { userId, points },
    });
  }

  ranking() {
    return this.prisma.userPoints.findMany({
      orderBy: { points: 'desc' },
    });
  }
}

