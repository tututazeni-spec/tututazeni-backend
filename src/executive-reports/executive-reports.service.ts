// ─── executive-reports.service.ts ────────────────────────────────────────────
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExecutiveReportDto, ReportFilterDto } from './executive-reports.dto';
 
@Injectable()
export class ExecutiveReportsService {
  constructor(private prisma: PrismaService) {}
 
  async findAll(filters: ReportFilterDto) {
    const { page = 1, limit = 20, departmentId } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (departmentId) where.departmentId = departmentId;
 
    const [data, total] = await Promise.all([
      this.prisma.executiveReport.findMany({
        where, skip, take: limit,
        include: {
          generatedBy: { select: { id: true, fullName: true } },
          department: true,
          metrics: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.executiveReport.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
 
  async findOne(id: number) {
    const r = await this.prisma.executiveReport.findUnique({
      where: { id },
      include: {
        generatedBy: { select: { id: true, fullName: true } },
        department: true,
        metrics: true,
      },
    });
    if (!r) throw new NotFoundException('Relatório não encontrado');
    return r;
  }
 
  async create(generatedById: number, dto: CreateExecutiveReportDto) {
    const filePath = `/reports/executive-${Date.now()}.pdf`;
    const report = await this.prisma.executiveReport.create({
      data: {
        title: dto.title,
        generatedById,
        departmentId: dto.departmentId,
        filePath,
        format: dto.format as any,
        metrics: {
          create: dto.metrics.map(m => ({ label: m.label, value: m.value })),
        },
      },
      include: { metrics: true, generatedBy: { select: { id: true, fullName: true } } },
    });
 
    await this.prisma.reportLog.create({
      data: { type: 'EXECUTIVE', generatedBy: generatedById, fileUrl: filePath },
    });
 
    return report;
  }
 
  async generateAutoReport(generatedById: number, departmentId?: number) {
    // Coleta métricas automaticamente
    const userWhere: any = {};
    if (departmentId) userWhere.departmentId = departmentId;
 
    const [totalUsers, activeUsers, completions, avgPerf, activePlans, totalPoints] = await Promise.all([
      this.prisma.user.count({ where: userWhere }),
      this.prisma.user.count({ where: { ...userWhere, active: true } }),
      this.prisma.enrollment.count({ where: { status: 'CONCLUIDO', user: userWhere } }),
      this.prisma.performanceReview.aggregate({ where: { user: userWhere }, _avg: { score: true } }),
      this.prisma.developmentPlan.count({ where: { status: 'ACTIVE', user: userWhere } }),
      this.prisma.userPoints.aggregate({ _sum: { points: true } }),
    ]);
 
    const totalEnrollments = await this.prisma.enrollment.count({ where: { user: userWhere } });
    const completionRate = totalEnrollments > 0
      ? Math.round((completions / totalEnrollments) * 100) : 0;
 
    return this.create(generatedById, {
      title: `Relatório Executivo - ${new Date().toLocaleDateString('pt-PT')}`,
      departmentId,
      format: 'PDF',
      metrics: [
        { label: 'Total de Colaboradores', value: totalUsers },
        { label: 'Colaboradores Ativos', value: activeUsers },
        { label: 'Cursos Concluídos', value: completions },
        { label: 'Taxa de Conclusão (%)', value: completionRate },
        { label: 'Score Médio de Desempenho', value: +(avgPerf._avg.score ?? 0).toFixed(2) },
        { label: 'Planos de Desenvolvimento Ativos', value: activePlans },
        { label: 'Total de Pontos (Gamificação)', value: totalPoints._sum.points ?? 0 },
      ],
    });
  }
 
  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.executiveReport.delete({ where: { id } });
    return { message: 'Relatório removido' };
  }
 
  async getExecutiveSnapshot(organizationId: number) {
    return this.prisma.executiveSnapshot.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
  }
}
 
