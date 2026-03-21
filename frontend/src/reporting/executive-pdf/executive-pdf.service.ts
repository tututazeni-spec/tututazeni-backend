import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ExecutivePdfService {
  constructor(private prisma: PrismaService) {}

  async generateDepartmentReport(
    departmentId: number,
    generatedById: number,
  ) {
    const users = await this.prisma.user.count({
      where: { departmentId },
    });

    const completedCourses = await this.prisma.enrollment.count({
  where: {
    user: { departmentId },
    status: 'CONCLUIDO',
  },
});

    const avgScore = await this.prisma.evaluationAttempt.aggregate({
      _avg: { scorePercent: true },
      where: {
        enrollment: {
          user: { departmentId },
        },
      },
    });

    const fileName = `executive-report-${Date.now()}.pdf`;
    const filePath = path.join('uploads/reports', fileName);

    fs.writeFileSync(filePath, 'PDF CONTENT HERE'); // placeholder

    return this.prisma.executiveReport.create({
      data: {
        title: `Relatório Executivo Departamento ${departmentId}`,
        generatedById,
        departmentId,
        filePath,
        format: 'PDF',
        metrics: {
          create: [
            { label: 'Total Colaboradores', value: users },
            { label: 'Cursos Concluídos', value: completedCourses },
            { label: 'Score Médio', value: avgScore._avg.scorePercent ?? 0 },
          ],
        },
      },
      include: { metrics: true },
    });
  }

  async listReports() {
    return this.prisma.executiveReport.findMany({
      include: {
        generatedBy: true,
        department: true,
        metrics: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}