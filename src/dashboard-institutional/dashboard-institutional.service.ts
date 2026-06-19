import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSnapshotDto, CreateWidgetDto, UpdateWidgetDto, FilterSnapshotDto } from './dto';

@Injectable()
export class DashboardInstitutionalService {
  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): any {
    return (this.prisma as any).db ?? this.prisma;
  }

  constructor(private prisma: PrismaService) {}

  // ─── RESUMO EXECUTIVO ────────────────────────────────

  async getExecutiveSummary() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [
      users,
      newUsersMonth,
      courses,
      activeEnrollments,
      completedThisYear,
      beneficiaries,
      partners,
      funders,
      totalFundingAgg,
      libraryItems,
      certificates,
      badgesIssued,
    ] = await this.prisma.$transaction([
      this.prismaRead.user.count({ where: { active: true } }),
      this.prismaRead.user.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prismaRead.course.count({ where: { status: 'PUBLISHED' } }),
      this.prismaRead.enrollment.count({ where: { status: 'IN_PROGRESS' } }),
      this.prismaRead.enrollment.count({
        where: { status: 'COMPLETED', completedAt: { gte: startOfYear } },
      }),
      this.prismaRead.beneficiary.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prismaRead.partner.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prismaRead.funder.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prismaRead.fundingGrant.aggregate({
        _sum: { amount: true },
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prismaRead.libraryItem.count({ where: { deletedAt: null } }),
      this.prismaRead.issuedCertificate.count({ where: { deletedAt: null } }),
      this.prismaRead.badgeIssuance.count({
        where: { deletedAt: null, isRevoked: false },
      }),
    ]);

    const totalFunding = (totalFundingAgg as any)?._sum?.amount || 0;
    const completionRate = users > 0 ? (completedThisYear / users) * 100 : 0;

    return {
      people: { total: users, newThisMonth: newUsersMonth },
      learning: {
        courses,
        activeEnrollments,
        completedThisYear,
        completionRate: Math.round(completionRate * 10) / 10,
      },
      crm: {
        beneficiaries,
        partners,
        funders,
        totalFunding,
      },
      knowledge: { libraryItems, certificates, badgesIssued },
    };
  }

  // ─── TENDÊNCIA DE CRESCIMENTO ────────────────────────

  async getGrowthTrend(months = 12) {
    const data: Array<{
      month: string;
      users: number;
      enrollments: number;
      completions: number;
    }> = [];
    for (let i = Number(months) - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const range = { gte: start, lte: end };

      const [users, enrollments, completions] = await this.prisma.$transaction([
        this.prismaRead.user.count({ where: { createdAt: range } }),
        this.prismaRead.enrollment.count({ where: { enrolledAt: range } }),
        this.prismaRead.enrollment.count({
          where: { status: 'COMPLETED', completedAt: range },
        }),
      ]);

      data.push({
        month: start.toLocaleDateString('pt-AO', {
          month: 'short',
          year: 'numeric',
        }),
        users,
        enrollments,
        completions,
      });
    }
    return data;
  }

  // ─── DISTRIBUIÇÃO GEOGRÁFICA ─────────────────────────

  async getGeographicDistribution() {
    const beneficiariesByProvince = await (this.prismaRead.beneficiary.groupBy as any)({
      by: ['province'],
      where: { deletedAt: null, province: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
    return { beneficiariesByProvince: beneficiariesByProvince || [] };
  }

  // ─── ALERTAS INSTITUCIONAIS ──────────────────────────

  async getAlerts() {
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 86400000);
    const in30Days = new Date(now.getTime() + 30 * 86400000);

    const [
      expiredCerts,
      overdueReports,
      followUps,
      expiringContracts,
      overdueMilestones,
      pendingApprovals,
    ] = await this.prisma.$transaction([
      this.prismaRead.issuedCertificate.count({
        where: { expiresAt: { lt: now }, isRevoked: false, deletedAt: null },
      }),
      this.prismaRead.funderReport.count({
        where: { dueDate: { lt: now }, status: { in: ['PENDING', 'REJECTED'] } },
      }),
      this.prismaRead.beneficiary.count({
        where: {
          nextFollowUpAt: { lte: in7Days },
          status: 'ACTIVE',
          deletedAt: null,
        },
      }),
      this.prismaRead.partner.count({
        where: {
          contractEnd: { lte: in30Days, gte: now },
          status: 'ACTIVE',
          deletedAt: null,
        },
      }),
      this.prismaRead.partnerMilestone.count({
        where: {
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          dueDate: { lt: now },
          deletedAt: null,
        },
      }),
      this.prismaRead.libraryItem.count({
        where: { isApproved: false, deletedAt: null },
      }),
    ]);

    return {
      critical: expiredCerts + overdueReports + overdueMilestones,
      warnings: expiringContracts + pendingApprovals,
      reminders: followUps,
      details: {
        expiredCerts,
        overdueReports,
        followUps,
        expiringContracts,
        overdueMilestones,
        pendingApprovals,
      },
    };
  }

  // ─── SNAPSHOTS (HISTÓRICO DE KPIs) ───────────────────

  async createSnapshot(dto: CreateSnapshotDto, userId: number) {
    // Guard de unicidade antes da escrita: força primary.
    const existing = await this.prisma.institutionalSnapshot.findUnique({
      where: { period_type: { period: dto.period, type: dto.type || 'MONTHLY' } },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException(`Snapshot para ${dto.period} já existe`);
    }

    const summary = await this.getExecutiveSummary();

    const snapshot = await this.prisma.institutionalSnapshot.create({
      data: {
        period: dto.period,
        type: dto.type || 'MONTHLY',
        notes: dto.notes,
        metrics: JSON.stringify(summary),
        totalUsers: summary.people.total,
        totalEnrollments: summary.learning.activeEnrollments,
        totalBeneficiaries: summary.crm.beneficiaries,
        totalFunding: summary.crm.totalFunding,
        totalCertificates: summary.knowledge.certificates,
        completionRate: summary.learning.completionRate,
        createdById: userId,
      },
    });
    await this.audit(userId, 'CREATE', 'InstitutionalSnapshot', snapshot.id, {
      period: dto.period,
    });
    return snapshot;
  }

  async findAllSnapshots(filters: FilterSnapshotDto) {
    const { type, page = 1, limit = 12 } = filters;
    const where = { deletedAt: null, ...(type && { type }) };
    const [data, total] = await this.prisma.$transaction([
      this.prismaRead.institutionalSnapshot.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { period: 'desc' },
        include: { createdBy: { select: { fullName: true } } },
      }),
      this.prismaRead.institutionalSnapshot.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async compareSnapshots(period1: string, period2: string, type = 'MONTHLY') {
    const [s1, s2] = await this.prisma.$transaction([
      this.prismaRead.institutionalSnapshot.findUnique({
        where: { period_type: { period: period1, type: type as any } },
      }),
      this.prismaRead.institutionalSnapshot.findUnique({
        where: { period_type: { period: period2, type: type as any } },
      }),
    ]);
    if (!s1 || !s2) throw new NotFoundException('Um dos snapshots não existe');

    const delta = (a: number, b: number) => ({
      from: a,
      to: b,
      change: b - a,
      changePct: a > 0 ? Math.round(((b - a) / a) * 1000) / 10 : 0,
    });

    return {
      period1,
      period2,
      comparison: {
        users: delta(s1.totalUsers, s2.totalUsers),
        enrollments: delta(s1.totalEnrollments, s2.totalEnrollments),
        beneficiaries: delta(s1.totalBeneficiaries, s2.totalBeneficiaries),
        funding: delta(s1.totalFunding, s2.totalFunding),
        certificates: delta(s1.totalCertificates, s2.totalCertificates),
        completionRate: delta(s1.completionRate, s2.completionRate),
      },
    };
  }

  // ─── WIDGETS PERSONALIZADOS ──────────────────────────

  async createWidget(dto: CreateWidgetDto, userId: number) {
    const widget = await this.prisma.dashboardWidget.create({
      data: { ...dto, userId },
    });
    return widget;
  }

  async getMyWidgets(userId: number) {
    return this.prismaRead.dashboardWidget.findMany({
      where: { userId, deletedAt: null, isVisible: true },
      orderBy: { position: 'asc' },
    });
  }

  async updateWidget(id: string, dto: UpdateWidgetDto, userId: number) {
    const widget = await this.prisma.dashboardWidget.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!widget) throw new NotFoundException('Widget não encontrado');
    return this.prisma.dashboardWidget.update({ where: { id }, data: dto });
  }

  async deleteWidget(id: string, userId: number) {
    const widget = await this.prisma.dashboardWidget.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!widget) throw new NotFoundException('Widget não encontrado');
    await this.prisma.dashboardWidget.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Widget removido com sucesso' };
  }

  // ─── HELPER ──────────────────────────────────────────

  private async audit(userId: number, action: string, entity: string, entityId: string, meta: any) {
    // AuditLog.entityId é Int? no schema; os IDs deste módulo são cuid (String),
    // por isso guardamos o id real dentro de metadata (sempre JSON.stringify).
    await this.prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        metadata: JSON.stringify({ ...meta, entityId }),
      },
    });
  }
}
