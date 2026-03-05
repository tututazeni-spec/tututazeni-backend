import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ScalabilityService {
  constructor(private prisma: PrismaService) {}

  // 📊 Total de usuários
  async totalUsers() {
    return this.prisma.user.count();
  }

  // 👥 Usuários ativos
  async activeUsers() {
    return this.prisma.user.count({
      where: { active: true },
    });
  }

  // 📚 Total de cursos
  async totalCourses() {
    return this.prisma.course.count();
  }

  // 📘 Total de trilhas
  async totalLearningPaths() {
    return this.prisma.learningPath.count();
  }

  // 🎯 Cursos com maior alcance
  async topCoursesByReach() {
    return this.prisma.enrollment.groupBy({
      by: ['courseId'],
      _count: { courseId: true },
      orderBy: {
        _count: {
          courseId: 'desc',
        },
      },
    });
  }

  // 📈 Snapshot da plataforma
  async createSnapshot() {
    const snapshot = await this.prisma.scalabilitySnapshot.create({
      data: {
        totalUsers: await this.totalUsers(),
        activeUsers: await this.activeUsers(),
        totalEnrollments: await this.prisma.enrollment.count(),
        totalCourses: await this.totalCourses(),
        totalLearningPaths: await this.totalLearningPaths(),
      },
    });

    return snapshot;
  }

  async getSnapshots() {
    return this.prisma.scalabilitySnapshot.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
