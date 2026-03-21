import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TalentDevelopmentService {
  constructor(private prisma: PrismaService) {}

  createCompetency(data: any) {
    return this.prisma.competency.create({ data });
  }

  getCompetencies() {
    return this.prisma.competency.findMany();
  }

  assignCompetencyToUser(data: any) {
    return this.prisma.userCompetency.upsert({
      where: {
        userId_competencyId: {
          userId: data.userId,
          competencyId: data.competencyId,
        },
      },
      update: { level: data.level },
      create: data,
    });
  }

  getUserCompetencies(userId: number) {
    return this.prisma.userCompetency.findMany({
      where: { userId },
      include: { competency: true },
    });
  }

  createDevelopmentPlan(data: any) {
    return this.prisma.developmentPlan.create({ data });
  }

  getDevelopmentPlans(userId: number) {
    return this.prisma.developmentPlan.findMany({
      where: { userId },
    });
  }
}