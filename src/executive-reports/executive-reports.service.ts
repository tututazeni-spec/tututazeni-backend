// src/executive-reports/executive-reports.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateExecutiveReportDto,
  UpdateExecutiveReportDto,
  ExecutiveReportsReportFilterDto,
  ApproveReportDto,
  ReportType,
  KpiStatus,
} from './executive-reports.dto';

@Injectable()
export class ExecutiveReportsService {
  private readonly logger = new Logger(ExecutiveReportsService.name);

  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): any {
    return (this.prisma as any).db ?? this.prisma;
  }

  constructor(private prisma: PrismaService) {}

  // ─── LISTAGEM ─────────────────────────────────────────────────────────────

  async findAll(filters: ExecutiveReportsReportFilterDto) {
    const { page = 1, limit = 20, type, status, departmentId, period } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;
    if (period) where.period = period;

    const [data, total] = await Promise.all([
      this.prismaRead.executiveReport.findMany({
        where,
        skip,
        take: limit,
        include: {
          generatedBy: { select: { id: true, fullName: true, avatarUrl: true } },
          department: { select: { id: true, name: true } },
          metrics: { orderBy: { sortOrder: 'asc' } },
          approvals: { orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { accessLogs: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaRead.executiveReport.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number, userId?: number) {
    const r = await this.prismaRead.executiveReport.findUnique({
      where: { id },
      include: {
        generatedBy: { select: { id: true, fullName: true, avatarUrl: true } },
        department: { select: { id: true, name: true } },
        metrics: { orderBy: { sortOrder: 'asc' } },
        approvals: {
          include: { approver: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        accessLogs: { orderBy: { accessedAt: 'desc' }, take: 10 },
      },
    });
    if (!r) throw new NotFoundException('Relatório não encontrado');

    // Registar acesso
    if (userId) {
      await this.prisma.reportAccessLog
        .create({
          data: { reportId: id, userId },
        })
        .catch(() => {});
    }

    return r;
  }

  // ─── CRIAÇÃO ──────────────────────────────────────────────────────────────

  async create(generatedById: number, dto: CreateExecutiveReportDto) {
    const filePath = `/reports/executive-${Date.now()}.pdf`;

    // Narrativa automática se pedida
    let narrative = dto.narrative;
    if (dto.autoGenerateNarrative && !narrative) {
      narrative = this.generateNarrative(dto);
    }

    const report = await this.prisma.executiveReport.create({
      data: {
        title: dto.title,
        subtitle: dto.subtitle,
        type: dto.type ?? 'MONTHLY',
        status: 'DRAFT',
        confidentiality: dto.confidentiality ?? 'CONFIDENTIAL',
        generatedById,
        departmentId: dto.departmentId,
        period: dto.period,
        periodStart: dto.periodStart ? new Date(dto.periodStart) : null,
        periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : null,
        achievements: dto.achievements ?? [],
        risks: dto.risks ?? [],
        recommendations: dto.recommendations ?? [],
        nextSteps: dto.nextSteps ?? [],
        narrative,
        filePath,
        format: 'PDF',
        metrics: {
          create: dto.metrics.map((m, i) => ({
            label: m.label,
            value: m.value,
            unit: m.unit,
            previousValue: m.previousValue,
            target: m.target,
            status: m.status ?? this.calcKpiStatus(m.value, m.target),
            comment: m.comment,
            sortOrder: m.sortOrder ?? i,
          })),
        },
      },
      include: {
        metrics: { orderBy: { sortOrder: 'asc' } },
        generatedBy: { select: { id: true, fullName: true } },
      },
    });

    // Log de geração
    await this.prisma.reportLog
      .create({
        data: { type: 'EXECUTIVE', generatedBy: generatedById, fileUrl: filePath },
      })
      .catch(() => {});

    return report;
  }

  async update(id: number, dto: UpdateExecutiveReportDto) {
    const report = (await this.findOne(id)) as any;
    if (report.status === 'PUBLISHED' || report.status === 'APPROVED') {
      throw new BadRequestException('Relatório publicado não pode ser editado');
    }

    const { metrics, ...data } = dto;

    if (metrics) {
      await this.prisma.executiveMetric.deleteMany({ where: { reportId: id } });
      await this.prisma.executiveMetric.createMany({
        data: metrics.map((m, i) => ({
          reportId: id,
          label: m.label,
          value: m.value,
          unit: m.unit,
          previousValue: m.previousValue,
          target: m.target,
          status: m.status ?? this.calcKpiStatus(m.value, m.target),
          comment: m.comment,
          sortOrder: m.sortOrder ?? i,
        })),
      });
    }

    return this.prisma.executiveReport.update({
      where: { id },
      data: {
        ...data,
        periodStart: data.periodStart ? new Date(data.periodStart) : undefined,
        periodEnd: data.periodEnd ? new Date(data.periodEnd) : undefined,
      },
    });
  }

  // ─── WORKFLOW ─────────────────────────────────────────────────────────────

  async submitForReview(id: number) {
    const r = (await this.findOne(id)) as any;
    if (r.status !== 'DRAFT')
      throw new BadRequestException('Apenas relatórios DRAFT podem ser submetidos');
    return this.prisma.executiveReport.update({ where: { id }, data: { status: 'IN_REVIEW' } });
  }

  async approveReport(dto: ApproveReportDto, approverId: number) {
    const r = (await this.findOne(dto.reportId)) as any;
    if (r.status !== 'IN_REVIEW') throw new BadRequestException('Relatório não está em revisão');

    const newStatus = dto.decision === 'approve' ? 'APPROVED' : 'DRAFT';

    await this.prisma.reportApproval.create({
      data: {
        reportId: dto.reportId,
        approverId,
        decision: dto.decision.toUpperCase(),
        comment: dto.comment,
      },
    });

    return this.prisma.executiveReport.update({
      where: { id: dto.reportId },
      data: { status: newStatus, approvedAt: dto.decision === 'approve' ? new Date() : undefined },
    });
  }

  async publishReport(id: number) {
    const r = (await this.findOne(id)) as any;
    if (r.status !== 'APPROVED')
      throw new BadRequestException('Apenas relatórios aprovados podem ser publicados');
    return this.prisma.executiveReport.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  }

  async archiveReport(id: number) {
    await this.findOne(id);
    return this.prisma.executiveReport.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }

  async remove(id: number) {
    const r = (await this.findOne(id)) as any;
    if (r.status === 'PUBLISHED')
      throw new ForbiddenException('Relatório publicado não pode ser eliminado');
    await this.prisma.executiveReport.delete({ where: { id } });
    return { message: 'Relatório eliminado' };
  }

  // ─── AUTO-GENERATE ────────────────────────────────────────────────────────

  async generateAutoReport(
    generatedById: number,
    type: ReportType = ReportType.MONTHLY,
    departmentId?: number,
  ) {
    const userWhere: any = { active: true };
    if (departmentId) userWhere.departmentId = departmentId;

    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    const [
      totalUsers,
      hired,
      terminated,
      totalEnrollments,
      completed,
      completedMonth,
      avgPerf,
      activePDIs,
      completedPDIs,
      totalCerts,
      totalXp,
      overdueActions,
    ] = await Promise.all([
      this.prisma.user.count({ where: userWhere }),
      this.prisma.user.count({ where: { ...userWhere, hireDate: { gte: monthAgo } } }),
      this.prisma.user.count({ where: { active: false, exitDate: { gte: monthAgo } } }),
      this.prisma.enrollment.count({ where: { user: userWhere } }),
      this.prisma.enrollment.count({ where: { user: userWhere, status: 'COMPLETED' } }),
      this.prisma.enrollment.count({
        where: { user: userWhere, status: 'COMPLETED', completedAt: { gte: monthAgo } },
      }),
      this.prisma.performanceReview.aggregate({
        where: { user: userWhere },
        _avg: { score: true },
      }),
      this.prisma.developmentPlan.count({ where: { status: 'ACTIVE', user: userWhere } }),
      this.prisma.developmentPlan.count({
        where: { status: 'COMPLETED', user: userWhere, completedAt: { gte: monthAgo } },
      }),
      this.prisma.certificate.count({ where: { issuedAt: { gte: monthAgo } } }),
      this.prisma.userPoints.aggregate({ _sum: { points: true } }),
      this.prisma.developmentPlanAction.count({
        where: {
          plan: { user: userWhere, status: 'ACTIVE' },
          status: { not: 'COMPLETED' },
          dueDate: { lt: now },
        },
      }),
    ]);

    const completionRate =
      totalEnrollments > 0 ? Math.round((completed / totalEnrollments) * 100) : 0;
    const turnoverRate = totalUsers > 0 ? Math.round((terminated / totalUsers) * 100 * 10) / 10 : 0;
    const pdiAdoption = totalUsers > 0 ? Math.round((activePDIs / totalUsers) * 100) : 0;
    const avgScore = Math.round((avgPerf._avg.score ?? 0) * 10) / 10;

    // Montar KPIs com semáforo automático
    const metrics = [
      { label: 'Headcount activo', value: totalUsers, unit: 'pessoas', status: KpiStatus.GREEN },
      { label: 'Novos colaboradores', value: hired, unit: 'pessoas', status: KpiStatus.GREEN },
      {
        label: 'Saídas no período',
        value: terminated,
        unit: 'pessoas',
        status: terminated > 5 ? KpiStatus.RED : KpiStatus.GREEN,
        target: 3,
      },
      {
        label: 'Taxa de turnover',
        value: turnoverRate,
        unit: '%',
        status:
          turnoverRate > 10 ? KpiStatus.RED : turnoverRate > 5 ? KpiStatus.YELLOW : KpiStatus.GREEN,
        target: 5,
      },
      {
        label: 'Conclusão de cursos',
        value: completionRate,
        unit: '%',
        status:
          completionRate < 30
            ? KpiStatus.RED
            : completionRate < 60
              ? KpiStatus.YELLOW
              : KpiStatus.GREEN,
        target: 70,
      },
      { label: 'Conclusões este mês', value: completedMonth, unit: '', status: KpiStatus.GREEN },
      {
        label: 'Score médio perf.',
        value: avgScore,
        unit: '/5',
        status:
          avgScore < 2.5 ? KpiStatus.RED : avgScore < 3.5 ? KpiStatus.YELLOW : KpiStatus.GREEN,
        target: 4,
      },
      {
        label: 'Adopção de PDI',
        value: pdiAdoption,
        unit: '%',
        status:
          pdiAdoption < 30 ? KpiStatus.RED : pdiAdoption < 60 ? KpiStatus.YELLOW : KpiStatus.GREEN,
        target: 80,
      },
      { label: 'PDIs concluídos (mês)', value: completedPDIs, unit: '', status: KpiStatus.GREEN },
      { label: 'Certificados emitidos', value: totalCerts, unit: '', status: KpiStatus.GREEN },
      {
        label: 'Acções PDI atrasadas',
        value: overdueActions,
        unit: '',
        status:
          overdueActions > 20
            ? KpiStatus.RED
            : overdueActions > 5
              ? KpiStatus.YELLOW
              : KpiStatus.GREEN,
        target: 0,
      },
      {
        label: 'XP total da plataforma',
        value: totalXp._sum.points ?? 0,
        unit: 'xp',
        status: KpiStatus.GREEN,
      },
    ];

    // Riscos automáticos
    const risks: string[] = [];
    if (turnoverRate > 10) risks.push(`Taxa de turnover elevada: ${turnoverRate}% (target: ≤5%)`);
    if (completionRate < 30) risks.push(`Taxa de conclusão de cursos crítica: ${completionRate}%`);
    if (overdueActions > 10)
      risks.push(`${overdueActions} acções de PDI atrasadas — risco de abandono`);
    if (pdiAdoption < 30) risks.push(`Baixa adopção de PDI: ${pdiAdoption}% dos colaboradores`);

    const achievements: string[] = [];
    if (completedMonth > 10) achievements.push(`${completedMonth} cursos concluídos no período`);
    if (completedPDIs > 0)
      achievements.push(`${completedPDIs} Planos de Desenvolvimento concluídos`);
    if (totalCerts > 0) achievements.push(`${totalCerts} certificados emitidos`);

    const recommendations: string[] = [];
    if (completionRate < 50)
      recommendations.push('Lançar campanha de reactivação para matrículas inactivas');
    if (pdiAdoption < 60)
      recommendations.push('Tornar PDI obrigatório para todos os colaboradores activos');
    if (overdueActions > 0)
      recommendations.push('Enviar lembretes automáticos para gestores com acções atrasadas');

    const periodLabel = `${now.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}`;

    return this.create(generatedById, {
      title: `${ReportType[type]} Executive Report — ${periodLabel}`,
      subtitle: departmentId ? `Filtrado por departamento` : 'Visão global da organização',
      type,
      departmentId,
      period: periodLabel,
      periodStart: monthAgo.toISOString().split('T')[0],
      periodEnd: now.toISOString().split('T')[0],
      achievements,
      risks,
      recommendations,
      nextSteps: ['Reunião de review com equipa de RH', 'Partilhar com C-Level até final do mês'],
      metrics,
      autoGenerateNarrative: true,
    });
  }

  // ─── NARRATIVA ────────────────────────────────────────────────────────────

  private generateNarrative(dto: CreateExecutiveReportDto): string {
    const redKpis = dto.metrics.filter(m => m.status === 'RED');
    const greenKpis = dto.metrics.filter(m => m.status === 'GREEN');
    const total = dto.metrics.length;

    let text = `Este relatório cobre o período ${dto.period ?? 'indicado'} e consolida ${total} indicadores estratégicos de RH e Aprendizagem. `;

    if (greenKpis.length > 0) {
      text += `${greenKpis.length} KPIs encontram-se dentro do target, destacando-se uma evolução positiva nos indicadores de aprendizagem e desenvolvimento. `;
    }

    if (redKpis.length > 0) {
      text += `⚠️ ${redKpis.length} KPI(s) em estado crítico requerem atenção imediata: ${redKpis.map(k => k.label).join(', ')}. `;
    }

    if (dto.achievements && dto.achievements.length > 0) {
      text += `\n\nPrincipais conquistas do período: ${dto.achievements.join('; ')}. `;
    }

    if (dto.risks && dto.risks.length > 0) {
      text += `\n\nRiscos identificados: ${dto.risks.join('; ')}. `;
    }

    if (dto.recommendations && dto.recommendations.length > 0) {
      text += `\n\nRecomendações: ${dto.recommendations.join('; ')}.`;
    }

    return text;
  }

  private calcKpiStatus(value: number, target?: number): KpiStatus {
    if (!target) return KpiStatus.GREEN;
    const ratio = value / target;
    if (ratio >= 0.9) return KpiStatus.GREEN;
    if (ratio >= 0.7) return KpiStatus.YELLOW;
    return KpiStatus.RED;
  }

  // ─── TEMPLATES ────────────────────────────────────────────────────────────

  async getTemplates() {
    return [
      {
        id: 'flash',
        name: 'Flash Report (Semanal)',
        type: ReportType.FLASH,
        description: 'KPIs rápidos de monitorização semanal',
        sections: ['headcount', 'learning_week', 'alerts'],
      },
      {
        id: 'monthly',
        name: 'Status Report (Mensal)',
        type: ReportType.MONTHLY,
        description: 'Evolução mensal vs metas',
        sections: ['people', 'learning', 'pdi', 'performance'],
      },
      {
        id: 'quarterly',
        name: 'Executive Summary (Trimestral)',
        type: ReportType.QUARTERLY,
        description: 'Relatório estratégico completo para C-Level',
        sections: [
          'executive_summary',
          'people',
          'learning',
          'pdi',
          'performance',
          'roi',
          'succession',
        ],
      },
      {
        id: 'annual',
        name: 'Annual People Report',
        type: ReportType.ANNUAL,
        description: 'Consolidado anual com ROI e tendências',
        sections: [
          'executive_summary',
          'people',
          'learning',
          'roi',
          'succession',
          'diversity',
          'benchmark',
        ],
      },
    ];
  }

  // ─── SNAPSHOTS ────────────────────────────────────────────────────────────

  async getExecutiveSnapshot(organizationId: number) {
    return this.prismaRead.executiveSnapshot.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
  }

  // ─── STATS ────────────────────────────────────────────────────────────────

  async getReportStats() {
    const [total, byStatus, byType] = await Promise.all([
      this.prismaRead.executiveReport.count(),
      this.prismaRead.executiveReport.groupBy({ by: ['status'], _count: true }),
      this.prismaRead.executiveReport.groupBy({ by: ['type'], _count: true }),
    ]);

    const recentReports = await this.prismaRead.executiveReport.findMany({
      where: { status: 'PUBLISHED' },
      include: { generatedBy: { select: { fullName: true } }, metrics: { take: 3 } },
      orderBy: { publishedAt: 'desc' },
      take: 5,
    });

    return {
      total,
      byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count])),
      byType: Object.fromEntries(byType.map(t => [t.type, t._count])),
      recentReports,
    };
  }
}
