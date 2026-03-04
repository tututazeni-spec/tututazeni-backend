import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CareerPlansService {
  constructor(private prisma: PrismaService) {}

  // Todos os planos de carreira
  async getAllCareerPlans() {
    return this.prisma.careerPlan.findMany({
      include: { employee: true },
    });
  }

  // Planos de carreira por colaborador
  async getCareerPlansByEmployee(employeeId: string) {
    const employeeIdNum = Number(employeeId);
    return this.prisma.careerPlan.findMany({
      where: { employeeId: employeeIdNum },
      include: { employee: true },
    });
  }

  // Feedback 360 de um colaborador
  async getFeedback360ForEmployee(employeeId: string) {
    const employeeIdNum = Number(employeeId);
    return this.prisma.feedback360.findMany({
      where: { employeeId: employeeIdNum },
    });
  }

  // Relatório 360º resumido
  async getFeedback360Summary(employeeId: string) {
    const employeeIdNum = Number(employeeId);
    const feedbacks = await this.prisma.feedback360.findMany({
      where: { employeeId: employeeIdNum },
    });

    if (!feedbacks.length) return { averageScore: null, totalFeedbacks: 0 };

    const totalScore = feedbacks.reduce((sum, f) => sum + f.score, 0);
    return {
      averageScore: totalScore / feedbacks.length,
      totalFeedbacks: feedbacks.length,
    };
  }
}