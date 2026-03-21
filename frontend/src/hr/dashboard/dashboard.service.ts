import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  // 📊 Dashboard Executivo (Global)
  async getExecutiveDashboard() {
    const totalUsers = await this.prisma.user.count();

    const totalCoursesCompleted = await this.prisma.enrollment.count({
      where: { status: 'CONCLUIDO' },
    });

    const avgScore = await this.prisma.evaluationAttempt.aggregate({
      _avg: { scorePercent: true },
    });

    const activePlans = await this.prisma.developmentPlan.count({
      where: { status: 'ACTIVE' },
    });

    return {
      totalUsers,
      totalCoursesCompleted,
      averageScore: avgScore._avg?.scorePercent ?? 0,
      activePlans,
    };
  }

  // 🏢 Dashboard por Departamento
  async getDepartmentDashboard(departmentId: number) {
    const totalUsers = await this.prisma.user.count({
      where: { departmentId },
    });

    const totalCoursesCompleted = await this.prisma.enrollment.count({
      where: {
        status: 'CONCLUIDO',
        user: { departmentId },
      },
    });

    const avgScore = await this.prisma.evaluationAttempt.aggregate({
      where: {
        enrollment: {
          user: { departmentId },
        },
      },
      _avg: { scorePercent: true },
    });

    const activePlans = await this.prisma.developmentPlan.count({
      where: {
        status: 'ACTIVE',
        user: { departmentId },
      },
    });

    return {
      departmentId,
      totalUsers,
      totalCoursesCompleted,
      averageScore: avgScore._avg?.scorePercent ?? 0,
      activePlans,
    };
  }

  // 📈 Gerar Snapshot Histórico
  async generateSnapshot(departmentId?: number) {
    const totalUsers = await this.prisma.user.count({
      where: departmentId ? { departmentId } : {},
    });

    const totalCoursesCompleted = await this.prisma.enrollment.count({
      where: {
        status: 'CONCLUIDO',
        ...(departmentId && {
          user: { departmentId },
        }),
      },
    });

    const avgScore = await this.prisma.evaluationAttempt.aggregate({
      _avg: { scorePercent: true },
      ...(departmentId && {
        where: {
          enrollment: {
            user: { departmentId },
          },
        },
      }),
    });

    const activePlans = await this.prisma.developmentPlan.count({
      where: {
        status: 'ACTIVE',
        ...(departmentId && {
          user: { departmentId },
        }),
      },
    });

    return this.prisma.dashboardSnapshot.create({
      data: {
        departmentId,
        totalUsers,
        totalCoursesCompleted,
        averageScore: avgScore._avg?.scorePercent ?? 0,
        activePlans,
      },
    });
  }

  // 📚 Listar Snapshots
  async listSnapshots() {
    return this.prisma.dashboardSnapshot.findMany({
      include: { department: true },
      orderBy: { generatedAt: 'desc' },
    });
  }
}